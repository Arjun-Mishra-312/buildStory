import type { Metadata } from "next";
import { OllamaModelStatus } from "@/components/creator/ollama-model-status";
import { ScannerConnectionFlow } from "@/components/creator/scanner-connection-flow";
import { requireCreator } from "@/lib/auth/runtime";
import { isHostedCliEnabled, isLocalApiEnabled } from "@/lib/ingestion/local-api";
import { ensureUser, listUploadSessions } from "@/lib/ingestion/store";
import { cloudNarrativeAvailable } from "@/lib/narrative/entitlement";

export const metadata: Metadata = { title: "Create story" };

export default async function ConnectScannerPage() {
  const creator = await requireCreator("/studio/connect");
  const [user, sessions] = await Promise.all([ensureUser(creator), listUploadSessions(creator.creatorId)]);
  // On a hosted deployment the CLI is pinned to BUILDSTORY_PUBLIC_ORIGIN, not to
  // a loopback server, and records are durable rather than disposable. Describing
  // the local-development shape to a hosted creator is simply inaccurate.
  const hosted = isHostedCliEnabled();
  const localDiscovery = isLocalApiEnabled();
  const hostedOrigin = hosted ? new URL(process.env.BUILDSTORY_PUBLIC_ORIGIN!).host : null;
  return (
    <main className="creator-page connect-page">
      <header className="creator-page__heading creator-page__heading--compact">
        <div>
          <span className="section-index">( CREATE STORY )</span>
          <h1>Turn a build into a story.</h1>
          <p>
            {hosted
              ? `Create an account-bound session, connect the installed CLI to ${hostedOrigin}, then separately consent to scan and upload one strict snapshot.`
              : "Create an account-bound session, connect the installed CLI to this loopback server, then separately consent to scan and upload one strict snapshot."}
          </p>
        </div>
      </header>
      <div className="mock-boundary-banner" data-guide="create-privacy">
        {hosted ? (
          <>
            <strong>Pinned HTTPS handoff · explicit consent.</strong>
            <span>
              The CLI uploads only to {hostedOrigin}, the single origin pinned when you connect, and refuses every other host. Your snapshot is stored privately and nothing is public until you choose fields and publish.
            </span>
          </>
        ) : (
          <>
            <strong>Real localhost handoff · explicit local consent.</strong>
            <span>The CLI contacts only the displayed loopback API. Local development uses disposable memory; production records require the configured durable D1 provider.</span>
          </>
        )}
      </div>
      <OllamaModelStatus discoveryAvailable={localDiscovery} cloudAvailable={cloudNarrativeAvailable(user.id)} />
      <div data-guide="create-scanner"><ScannerConnectionFlow
        initialSessions={sessions}
        scannerEnabled={localDiscovery || hosted}
      /></div>
    </main>
  );
}
