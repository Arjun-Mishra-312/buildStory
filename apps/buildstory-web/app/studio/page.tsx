import type { Metadata } from "next";
import Link from "next/link";
import { EditorialIllustration } from "@/components/editorial-illustration";
import { type StoryVisualStory } from "@/components/story-visual";
import { ProjectStackCard } from "@/components/studio/project-stack-card";
import { requireCreator } from "@/lib/auth/runtime";
import { buildStoryFromSnapshot } from "@/lib/build-story";
import { getReport, listReportMedia, listUploadSessions, statusLabel } from "@/lib/ingestion/store";

export const metadata: Metadata = { title: "Creator dashboard" };

type StudioStoryCard = StoryVisualStory & { tagline: string; projectId: string; createdAt: string };

async function storyCardForSession(creatorId: string, session: Awaited<ReturnType<typeof listUploadSessions>>[number]): Promise<StudioStoryCard | null> {
  if (!session.reportId) return null;
  try {
    const report = await getReport(creatorId, session.reportId);
    const story = buildStoryFromSnapshot(report.snapshot);
    return {
      name: story.name,
      stack: story.stack,
      storyBackgroundId: report.storyBackgroundId,
      artifactMedia: await listReportMedia(report.id),
      tagline: report.editorial.tagline,
      projectId: report.projectId,
      createdAt: report.createdAt,
    };
  } catch {
    // The dashboard can still show the session if a just-created report is not
    // available during a brief storage or processing transition.
    return null;
  }
}

type ReadyCard = { session: Awaited<ReturnType<typeof listUploadSessions>>[number]; story: StudioStoryCard | null };
type ProjectStack = { key: string; cards: ReadyCard[] };

/** Groups ready-report cards by project so repeat scans of the same repo collapse into one stack. */
function groupReadyCardsByProject(cards: ReadyCard[]): ProjectStack[] {
  const order: string[] = [];
  const byKey = new Map<string, ReadyCard[]>();
  for (const card of cards) {
    const key = card.story?.projectId ?? `session:${card.session.id}`;
    if (!byKey.has(key)) {
      byKey.set(key, []);
      order.push(key);
    }
    byKey.get(key)!.push(card);
  }
  return order.map((key) => ({ key, cards: byKey.get(key)! }));
}

export default async function StudioPage() {
  const creator = await requireCreator("/studio");
  const sessions = await listUploadSessions(creator.creatorId);
  const ready = sessions.filter((session) => session.status === "report_ready");
  const processing = sessions.filter((session) =>
    ["scanner_authorized", "snapshot_received", "queued", "generating"].includes(session.status),
  );
  const readyCards = await Promise.all(ready.map(async (session) => ({
    session,
    story: await storyCardForSession(creator.creatorId, session),
  })));
  const projectStacks = groupReadyCardsByProject(readyCards);

  return (
    <section className="creator-page dashboard-page">
      <header className="creator-page__heading">
        <div>
          <span className="section-index">( CREATOR DASHBOARD )</span>
          <h1>Good morning, {creator.name.split(" ")[0]}.</h1>
          <p>Your private build queue, reports, and publication state in one place.</p>
        </div>
        <Link className="button button--primary" href="/studio/connect" data-guide="studio-create">
          Create a story <span aria-hidden="true">↗</span>
        </Link>
      </header>

      <section className="dashboard-metrics" aria-label="Workspace summary">
        <article><span>READY REPORTS</span><strong>{ready.length}</strong><small>{ready.length ? "Ready to review" : "Connect your first"}</small></article>
        <article><span>IN THE QUEUE</span><strong>{processing.length}</strong><small>generation jobs</small></article>
        <article><span>SCANNER TRUST</span><strong>1×</strong><small>single-use upload tokens</small></article>
        <article><span>PUBLIC ACCESS</span><strong>Open</strong><small>no viewer sign-in</small></article>
      </section>

      <div className="dashboard-grid">
        <section className="dashboard-projects" data-guide="studio-reports">
          <header><span>YOUR PROJECTS</span><Link href="/studio/connect">Create story +</Link></header>
          {projectStacks.length ? projectStacks.map((stack) => (
            <ProjectStackCard
              key={stack.key}
              runs={stack.cards.map(({ session, story }) => ({
                sessionId: session.id,
                reportId: session.reportId!,
                projectLabel: session.projectLabel,
                story,
              }))}
            />
          )) : (
            <div className="dashboard-empty">
              <div className="dashboard-empty__art"><EditorialIllustration kind="studio-first-story" /></div>
              <div className="dashboard-empty__copy">
                <span>NO PRIVATE REPORTS YET</span>
                <h2>Your first project begins on your machine.</h2>
                <p>Create a connection code here, then run the local scanner against the repository you choose.</p>
                <Link className="button button--secondary" href="/studio/connect">Start story capture</Link>
              </div>
            </div>
          )}
        </section>

        <aside className="dashboard-activity" data-guide="studio-activity">
          <header><span>INGESTION ACTIVITY</span><small>{sessions.length} total</small></header>
          <div className="activity-list">
            {sessions.slice(0, 5).map((session) => (
              <article key={session.id}>
                <i className={`activity-state activity-state--${session.status}`} />
                <div><strong>{session.projectLabel}</strong><p>{session.statusDetail}</p></div>
                <small>{statusLabel(session.status)}</small>
              </article>
            ))}
            {!sessions.length ? <p className="activity-list__empty">No scanner activity yet.</p> : null}
          </div>
          <div className="dashboard-activity__boundary">
            <span>THE HANDOFF</span>
            <ol>
              <li>Creator starts a session</li>
              <li>Scanner claims one code</li>
              <li>Token uploads one snapshot</li>
              <li>Backend queues the report</li>
            </ol>
          </div>
        </aside>
      </div>
    </section>
  );
}
