import type { Metadata } from "next";
import { CliPairApproveForm } from "@/components/creator/cli-pair-approve";
import { getCliPairingPreview } from "@/lib/ingestion/store";

export const metadata: Metadata = { title: "Approve CLI upload" };

type PageProps = { searchParams: Promise<{ code?: string }> };

export default async function CliPairPage({ searchParams }: PageProps) {
  const code = (await searchParams).code?.trim() ?? "";
  if (!code) {
    return (
      <main className="creator-page">
        <h1>Missing pairing code</h1>
        <p>Open this page from the BuildStory CLI after pressing o in generate.</p>
      </main>
    );
  }

  let pairing;
  try {
    pairing = await getCliPairingPreview(code);
  } catch {
    return (
      <main className="creator-page">
        <h1>Pairing not found</h1>
        <p>This code expired or was typed incorrectly. Press o in the CLI to start again.</p>
      </main>
    );
  }

  const expired = pairing.status === "expired";
  const waitingOnCli = pairing.status === "approved" || pairing.status === "consumed";
  return (
    <main className="creator-page">
      <header className="creator-page__heading creator-page__heading--compact">
        <div>
          <span className="section-index">( CLI PAIR )</span>
          <h1>Upload a local report</h1>
          <p>
            {pairing.projectLabel} · {pairing.narrativeMode} narrative. Source files and diffs stay on the
            builder&apos;s machine.
          </p>
        </div>
      </header>
      {expired ? <p>This pairing expired. Press o in the CLI to start again.</p> : null}
      {waitingOnCli ? <p>Already approved. Return to the CLI to finish the upload.</p> : null}
      {!expired && !waitingOnCli ? <CliPairApproveForm userCode={pairing.userCode} /> : null}
    </main>
  );
}
