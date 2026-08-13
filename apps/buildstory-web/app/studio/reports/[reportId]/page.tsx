import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProjectWorkbench } from "@/components/project-workbench";
import { requireCreator } from "@/lib/auth/runtime";
import { buildStoryFromSnapshot, publicBuildStoryFromSnapshot } from "@/lib/build-story";
import { deriveNarrativeDisplayStatus } from "@/lib/ingestion/narrative-status";
import { getProjectDetail, getProjectForVerification, getReport, listReportMedia, shouldUseDurableStore, countPublicArchetypes } from "@/lib/ingestion/store";
import { computeChapterDelta, publicChapterDelta } from "@/lib/story/chapter-delta";
import { getProfile } from "@/lib/social/store";
import { builderRoleLabel } from "@/lib/identity/builder-roles";

export const metadata: Metadata = { title: "Review imported report" };

type PageProps = { params: Promise<{ reportId: string }> };

function isMissingReport(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "isBuildstoryIngestionError" in error &&
    "status" in error &&
    (error as { status?: unknown }).status === 404
  );
}

export default async function ImportedReportPage({ params }: PageProps) {
  const { reportId } = await params;
  const creator = await requireCreator(`/studio/reports/${reportId}`);

  let report;
  try {
    report = await getReport(creator.creatorId, reportId);
  } catch (error) {
    if (isMissingReport(error)) notFound();
    return (
      <section className="creator-page creator-project-empty">
        <span className="section-index">( REPORT NOT FOUND )</span>
        <h1>This private report is not available to this creator.</h1>
        <p>The report may belong to another account, or its configured persistence provider may be unavailable.</p>
        <Link className="button button--primary" href="/studio/connect">Create story ↗</Link>
      </section>
    );
  }

  if (report.status !== "ready") {
    return (
      <section className="creator-page creator-project-empty">
        <span className="section-index">( REPORT GENERATION )</span>
        <h1>Your snapshot is safe; the report is still {report.status}.</h1>
        <p>Return to the connection screen to watch the durable generation status.</p>
        <Link className="button button--primary" href="/studio/connect">View story progress ↗</Link>
      </section>
    );
  }

  const story = { ...buildStoryFromSnapshot(report.snapshot), chapterDelta: report.chapterDelta };
  const narrativeStatus = deriveNarrativeDisplayStatus(report.sourceSnapshot, report.narrative);
  const media = await listReportMedia(report.id).catch(() => []);
  const profile = await getProfile(creator.creatorId).catch(() => null);
  const projectVerification = await getProjectForVerification(creator.creatorId, report.projectId).catch(() => null);
  const isDurableStore = shouldUseDurableStore();
  // The real publication boundary, computed server-side from the currently-saved
  // selection so the creator's "Public" tab shows exactly what a reader would see,
  // not the full private report with the checkboxes ignored.
  const previewStory = { ...publicBuildStoryFromSnapshot(
    report.snapshot,
    report.selectedPublicFields,
    { tagline: report.editorial.tagline, description: report.editorial.description, reflection: report.editorial.reflection, category: report.category },
    { ...report.artifact, media },
    { storyBackgroundId: report.storyBackgroundId },
  ), chapterDelta: report.chapterDelta ? publicChapterDelta(report.chapterDelta, report.selectedPublicFields) : null };
  // Full (ungated) live preview of "what changed" against the project's most recent
  // published chapter - lets the creator see the delta before they've published
  // anything, unlike the frozen chapter_delta_json which only exists after publish.
  const projectDetail = await getProjectDetail(creator.creatorId, report.projectId).catch(() => null);
  const previousChapter = projectDetail?.reports
    .filter((candidate) => candidate.chapterIndex !== null && candidate.reportId !== report.id)
    .sort((left, right) => (right.chapterIndex ?? 0) - (left.chapterIndex ?? 0))[0] ?? null;
  const previousChapterReport = previousChapter ? await getReport(creator.creatorId, previousChapter.reportId).catch(() => null) : null;
  const livePreviewDelta = previousChapterReport && previousChapter?.chapterIndex != null
    ? computeChapterDelta(previousChapterReport.snapshot, report.snapshot, previousChapter.chapterIndex, previousChapter.chapterIndex + 1)
    : null;
  const archetypeCounts = await countPublicArchetypes().catch(() => ({ total: 0, byKey: {} }));
  return (
    <div className="creator-project-page">
      <div className="mock-boundary-banner mock-boundary-banner--project">
        <strong>Imported private report · sanitized snapshot only.</strong>
        {/* The disposable-memory caveat is true only of local development; on a
            hosted deployment the record is durable, and saying otherwise invites
            a creator to assume their work will vanish. */}
        <span>
          {isDurableStore
            ? "Only the sanitized snapshot is stored, and this report stays private to you. Nothing is public until you select fields and publish."
            : "Production stores this report in D1; local development is disposable. Nothing is public until you select fields and publish."}
        </span>
      </div>
      <ProjectWorkbench
        story={story}
        previewStory={previewStory}
        livePreviewDelta={livePreviewDelta}
        access="creator"
        reportId={report.id}
        projectId={report.projectId}
        hasLiveChapter={Boolean(projectDetail?.reports.some((candidate) => candidate.chapterIndex !== null))}
        initialPublicationStatus={report.publication.status}
        initialSelectedPublicFields={report.selectedPublicFields}
        initialEditorial={report.editorial}
        initialCategory={report.category}
        initialStoryBackgroundId={report.storyBackgroundId}
        initialArtifact={report.artifact}
        initialMedia={media}
        initialVerifiedRepoAt={projectVerification?.verifiedRepoAt ?? null}
        ownerRoleOverride={profile?.builderRole ? builderRoleLabel(profile.builderRole) : null}
        narrative={report.narrative}
        narrativeStatus={narrativeStatus}
        reviewedEvidence={report.sourceSnapshot?.narrativeEvidence?.excerpts ?? []}
        archetypeCounts={archetypeCounts}
      />
    </div>
  );
}
