import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChapterDeltaSummary } from "@/components/chapter-delta-summary";
import { requireCreator } from "@/lib/auth/runtime";
import { getProjectDetail } from "@/lib/ingestion/store";

export const metadata: Metadata = { title: "Project" };

type PageProps = { params: Promise<{ projectId: string }> };

const publicationLabel: Record<string, string> = {
  not_published: "Not published",
  draft_changes: "Unpublished changes",
  published: "Published",
};

const reportStatusLabel: Record<string, string> = {
  queued: "Generating report…",
  generating: "Generating report…",
  ready: "Ready to review",
  failed: "Generation failed",
};

function isMissingProject(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "isBuildstoryIngestionError" in error &&
    "status" in error &&
    (error as { status?: unknown }).status === 404
  );
}

export default async function ProjectDetailPage({ params }: PageProps) {
  const { projectId } = await params;
  const creator = await requireCreator(`/studio/projects/${projectId}`);

  let project;
  try {
    project = await getProjectDetail(creator.creatorId, projectId);
  } catch (error) {
    if (isMissingProject(error)) notFound();
    throw error;
  }

  const chapters = project.reports.filter((report) => report.chapterIndex !== null).sort((left, right) => (right.chapterIndex ?? 0) - (left.chapterIndex ?? 0));
  const drafts = project.reports.filter((report) => report.chapterIndex === null);
  const latestDraft = drafts[0] ?? null;
  const primaryAction = latestDraft?.status === "queued" || latestDraft?.status === "generating"
    ? { label: "View progress", href: `/studio/projects/${projectId}`, tone: "button--secondary" }
    : latestDraft?.status === "failed"
      ? { label: "Review issue", href: `/studio/reports/${latestDraft.reportId}`, tone: "button--secondary" }
      : latestDraft?.status === "ready"
        ? { label: chapters.length ? "Review and publish changes" : "Review and publish", href: `/studio/reports/${latestDraft.reportId}`, tone: "button--primary" }
        : { label: "Scan for updates", href: `/studio/projects/${projectId}/update`, tone: "button--primary" };

  return (
    <section className="creator-page project-detail-page">
      <header className="creator-page__heading creator-page__heading--compact">
        <div>
          <span className="section-index">( PROJECT )</span>
          <h1>{project.name}</h1>
          <p>{chapters.length ? `${chapters.length} published chapter${chapters.length === 1 ? "" : "s"}.` : "Not published yet."}</p>
        </div>
      </header>

      <div className="project-detail-actions" data-guide="project-detail-actions">
        {project.publicUrl ? (
          <a className="button button--secondary" href={project.publicUrl} target="_blank" rel="noopener noreferrer">
            View public page <span aria-hidden="true">↗</span>
          </a>
        ) : null}
        <Link className={`button ${primaryAction.tone}`} href={primaryAction.href}>
          {primaryAction.label}
        </Link>
      </div>

      <ol className="update-sequence" aria-label="Publishing sequence">
        <li><strong>1</strong><span><b>Scan the same repository</b><small>Create an update connection for this project.</small></span></li>
        <li><strong>2</strong><span><b>Review the private report</b><small>Check what changed before it becomes public.</small></span></li>
        <li><strong>3</strong><span><b>Publish a new chapter</b><small>Choose the fields your readers should see.</small></span></li>
      </ol>

      {drafts.length ? (
        <section className="project-detail-drafts" data-guide="project-detail-drafts">
          <span className="section-index">UNPUBLISHED SCANS</span>
          {drafts.map((report) => (
            <article key={report.reportId} className="project-detail-draft-row">
              <span>{reportStatusLabel[report.status] ?? report.status}</span>
              {report.status === "ready" ? (
                <Link className="button button--secondary button--small" href={`/studio/reports/${report.reportId}`}>
                  Review and publish
                </Link>
              ) : null}
            </article>
          ))}
        </section>
      ) : null}

      <section className="project-detail-chapters" data-guide="project-detail-chapters">
        <span className="section-index">CHAPTERS</span>
        {chapters.length ? chapters.map((report) => (
          <article key={report.reportId} className="project-detail-chapter">
            <header>
              <div>
                <h2>Chapter {report.chapterIndex}</h2>
                <p>{report.editorialTagline}</p>
              </div>
              <div className={`publication-state publication-state--${report.publicationStatus}`}>
                <i /> {publicationLabel[report.publicationStatus] ?? report.publicationStatus}
              </div>
            </header>
            <div className="project-detail-chapter__meta">
              <span>Published {report.publishedAt ? new Date(report.publishedAt).toLocaleDateString() : "—"}</span>
              <Link href={`/studio/reports/${report.reportId}`}>Review report →</Link>
            </div>
            {report.chapterDelta ? <ChapterDeltaSummary delta={report.chapterDelta} compact /> : null}
          </article>
        )) : (
          <p className="project-detail-chapters__empty">No chapters published yet. Review a ready report and publish it to create Chapter 1.</p>
        )}
      </section>
    </section>
  );
}
