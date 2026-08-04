import type { Metadata } from "next";
import { ScannerConnectionFlow } from "@/components/creator/scanner-connection-flow";
import { requireCreator } from "@/lib/auth/runtime";
import { isLocalApiEnabled } from "@/lib/ingestion/local-api";
import { listUploadSessions } from "@/lib/ingestion/store";

export const metadata: Metadata = { title: "Connect local scanner" };

export default async function ConnectScannerPage() {
  const creator = await requireCreator("/dashboard/connect");
  const sessions = await listUploadSessions(creator.creatorId);
  return (
    <main className="creator-page connect-page">
      <header className="creator-page__heading creator-page__heading--compact">
        <div>
          <span className="section-index">( SCANNER CONNECTION )</span>
          <h1>Private evidence crosses one narrow bridge.</h1>
          <p>Create an account-bound session, connect the installed CLI to this loopback server, then separately consent to scan and upload one strict snapshot.</p>
        </div>
      </header>
      <div className="mock-boundary-banner">
        <strong>Real localhost handoff · explicit local consent.</strong>
        <span>The CLI contacts only the displayed loopback API. Local development uses disposable memory; production records require the configured durable D1 provider.</span>
      </div>
      <ScannerConnectionFlow
        initialSessions={sessions}
        localApiEnabled={isLocalApiEnabled()}
      />
    </main>
  );
}
