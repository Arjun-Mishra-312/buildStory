import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OllamaModelStatus } from "@/components/creator/ollama-model-status";
import { ScannerConnectionFlow } from "@/components/creator/scanner-connection-flow";
import { requireCreator } from "@/lib/auth/runtime";
import { isHostedCliEnabled, isLocalApiEnabled } from "@/lib/ingestion/local-api";
import { getProjectDetail, listUploadSessions } from "@/lib/ingestion/store";

export const metadata: Metadata = { title: "Publish an update" };

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
  const sessions = await listUploadSessions(creator.creatorId);
  const hosted = isHostedCliEnabled();
  const localDiscovery = isLocalApiEnabled();
  const hostedOrigin = hosted ? new URL(process.env.BUILDSTORY_PUBLIC_ORIGIN!).host : null;

  return (
    <main className="creator-page connect-page">
      <header className="creator-page__heading creator-page__heading--compact">
        <div>
          <span className="section-index">( PUBLISH AN UPDATE )</span>
          <h1>Push a new chapter to {project.name}.</h1>
          <p>
            {hosted
              ? `Connect the installed CLI to ${hostedOrigin}, then scan the same repository again to capture everything that changed since your last chapter.`
              : "Connect the installed CLI to this loopback server, then scan the same repository again to capture everything that changed since your last chapter."}
          </p>
        </div>
      </header>
      <div className="mock-boundary-banner">
        <strong>Same repository required.</strong>
        <span>The scan must come from the repository your earlier chapters were built from. A different repository is rejected before it ever creates a new report.</span>
      </div>
      <OllamaModelStatus discoveryAvailable={localDiscovery} />
      <ScannerConnectionFlow
        initialSessions={sessions}
        scannerEnabled={localDiscovery || hosted}
        targetProject={{ id: project.id, name: project.name, nextChapterIndex }}
      />
    </main>
  );
}
