import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProjectWorkbench } from "@/components/project-workbench";
import { requireCreator } from "@/lib/auth/runtime";
import { buildStoryFromSnapshot } from "@/lib/build-story";
import { deriveNarrativeDisplayStatus } from "@/lib/ingestion/narrative-status";
import { getProjectForVerification, getReport, listReportMedia, shouldUseDurableStore } from "@/lib/ingestion/store";

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

  const story = buildStoryFromSnapshot(report.snapshot);
  const narrativeStatus = deriveNarrativeDisplayStatus(report.sourceSnapshot, report.narrative);
  const media = await listReportMedia(report.id).catch(() => []);
  const projectVerification = await getProjectForVerification(creator.creatorId, report.projectId).catch(() => null);
  const isDurableStore = shouldUseDurableStore();
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
        access="creator"
        reportId={report.id}
        projectId={report.projectId}
        initialPublicationStatus={report.publication.status}
        initialSelectedPublicFields={report.selectedPublicFields}
        initialEditorial={report.editorial}
        initialCategory={report.category}
        initialArtifact={report.artifact}
        initialMedia={media}
        initialVerifiedRepoAt={projectVerification?.verifiedRepoAt ?? null}
        narrative={report.narrative}
        narrativeStatus={narrativeStatus}
        reviewedEvidence={report.sourceSnapshot?.narrativeEvidence?.excerpts ?? []}
      />
    </div>
  );
}
