import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GithubStarButton } from "@/components/github-star-button";
import { OllamaModelStatus } from "@/components/creator/ollama-model-status";
import { ScannerConnectionFlow } from "@/components/creator/scanner-connection-flow";
import { requireCreator } from "@/lib/auth/runtime";
import { isHostedCliEnabled, isLocalApiEnabled } from "@/lib/ingestion/local-api";
import { ensureUser, getFeatureBudgetCount, getProjectDetail, listUploadSessions } from "@/lib/ingestion/store";
import { cloudNarrativeAvailable, effectivePlan } from "@/lib/narrative/entitlement";

export const metadata: Metadata = { title: "Scan for updates" };

type PageProps = { params: Promise<{ projectId: string }> };

function isMissingProject(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "isBuildstoryIngestionError" in error &&
    "status" in error &&
    (error as { status?: unknown }).status === 404
  );
}

export default async function UpdateProjectPage({ params }: PageProps) {
  const { projectId } = await params;
  const creator = await requireCreator(`/studio/projects/${projectId}/update`);

  let project;
  try {
    project = await getProjectDetail(creator.creatorId, projectId);
  } catch (error) {
    if (isMissingProject(error)) notFound();
    throw error;
  }

  const nextChapterIndex = project.reports.filter((report) => report.chapterIndex !== null).length + 1;
  const [user, sessions] = await Promise.all([ensureUser(creator), listUploadSessions(creator.creatorId)]);
  const hosted = isHostedCliEnabled();
  const localDiscovery = isLocalApiEnabled();
  const hostedOrigin = hosted ? new URL(process.env.BUILDSTORY_PUBLIC_ORIGIN!).host : null;
  const isPro = effectivePlan(user.plan) === "pro";
  const rescansUsed = isPro ? null : await getFeatureBudgetCount(user.id, "rescan");

  return (
    <main className="creator-page connect-page">
      <header className="creator-page__heading creator-page__heading--compact">
        <div>
            <span className="section-index">( SCAN FOR UPDATES )</span>
            <h1>Find what changed in {project.name}.</h1>
          <p>
            {hosted
              ? `Scan the same repository, review the private report, then publish it as Chapter ${nextChapterIndex}. Connect the installed CLI to ${hostedOrigin} to begin.`
              : `Scan the same repository, review the private report, then publish it as Chapter ${nextChapterIndex}. Connect the installed CLI to this loopback server to begin.`}
          </p>
        </div>
      </header>
      <ol className="update-sequence update-sequence--hero" data-guide="update-sequence" aria-label="Update sequence">
        <li className="is-current"><strong>1</strong><span><b>Scan</b><small>Same repository</small></span></li>
        <li><strong>2</strong><span><b>Review</b><small>Private report</small></span></li>
        <li><strong>3</strong><span><b>Publish</b><small>New chapter</small></span></li>
      </ol>
      <div className="mock-boundary-banner" data-guide="update-repository">
        <strong>Same repository required.</strong>
        <span>The scan must come from the repository your earlier chapters were built from. A different repository is rejected before it ever creates a new report.</span>
      </div>
      {rescansUsed !== null ? (
        <p className={rescansUsed >= 3 ? "auth-notice auth-notice--error" : "auth-notice"}>
          {rescansUsed} of 3 free project updates used this month.
          {rescansUsed >= 3 ? " Upgrade to Pro for unlimited updates." : ""}
        </p>
      ) : null}
      <OllamaModelStatus discoveryAvailable={localDiscovery} cloudAvailable={await cloudNarrativeAvailable(user.id)} />
      <div data-guide="update-progress"><ScannerConnectionFlow
        initialSessions={sessions}
        scannerEnabled={localDiscovery || hosted}
        targetProject={{ id: project.id, name: project.name, nextChapterIndex }}
        engineStarButton={<GithubStarButton compact />}
      /></div>
    </main>
  );
}
