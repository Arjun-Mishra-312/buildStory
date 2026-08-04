import type { Metadata } from "next";
import Link from "next/link";
import { ProjectWorkbench } from "@/components/project-workbench";
import { requireCreator } from "@/lib/auth/runtime";
import { buildStoryFromSnapshot } from "@/lib/build-story";
import { getReport } from "@/lib/ingestion/store";

export const metadata: Metadata = { title: "Review imported report" };

type PageProps = { params: Promise<{ reportId: string }> };

export default async function ImportedReportPage({ params }: PageProps) {
  const { reportId } = await params;
  const creator = await requireCreator(`/dashboard/reports/${reportId}`);

  let report;
  try {
    report = await getReport(creator.creatorId, reportId);
  } catch {
    return (
      <main className="creator-page creator-project-empty">
        <span className="section-index">( REPORT NOT FOUND )</span>
        <h1>This private report is not available to this creator.</h1>
        <p>The report may belong to another account, or its configured persistence provider may be unavailable.</p>
        <Link className="button button--primary" href="/dashboard/connect">Open scanner connection →</Link>
      </main>
    );
  }

  if (report.status !== "ready") {
    return (
      <main className="creator-page creator-project-empty">
        <span className="section-index">( REPORT GENERATION )</span>
        <h1>Your snapshot is safe; the report is still {report.status}.</h1>
        <p>Return to the connection screen to watch the durable generation status.</p>
        <Link className="button button--primary" href="/dashboard/connect">View import status →</Link>
      </main>
    );
  }

  const story = buildStoryFromSnapshot(report.snapshot);
  return (
    <div className="creator-project-page">
      <div className="mock-boundary-banner mock-boundary-banner--project">
        <strong>Imported private report · sanitized snapshot only.</strong>
        <span>Production stores this report in D1; local development is disposable. Nothing is public until you select fields and publish.</span>
      </div>
      <ProjectWorkbench
        story={story}
        access="creator"
        reportId={report.id}
        initialPublicationStatus={report.publication.status}
        initialSelectedPublicFields={report.selectedPublicFields}
      />
    </div>
  );
}
