import type { Metadata } from "next";
import Link from "next/link";
import { ProjectWorkbench } from "@/components/project-workbench";
import { requireCreator } from "@/lib/auth/runtime";
import { buildStoryFromSnapshot } from "@/lib/build-story";
import { getReport } from "@/lib/ingestion/store";

export const metadata: Metadata = { title: "Manage Orbit Notes" };

export default async function ManageOrbitNotesPage() {
  const creator = await requireCreator("/dashboard/projects/orbit-notes");
  let report;
  try {
    report = await getReport(creator.creatorId, "rpt_orbit_notes_ready");
  } catch {
    return (
      <main className="creator-page creator-project-empty">
        <span className="section-index">( PROJECT NOT IMPORTED )</span>
        <h1>Connect the scanner before opening a private report.</h1>
        <p>This creator account does not own the seeded Orbit Notes report.</p>
        <Link className="button button--primary" href="/dashboard/connect">Connect a local project →</Link>
      </main>
    );
  }

  const story = buildStoryFromSnapshot(report.snapshot);
  return (
    <div className="creator-project-page">
      <div className="mock-boundary-banner mock-boundary-banner--project">
        <strong>Creator-only report controls.</strong>
        <span>Production edits and publication state use durable D1 storage; the public projection excludes private session and provenance data.</span>
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
