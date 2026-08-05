"use client";

import { useEffect, useState } from "react";
import type { DeviceAuthorization, UploadSessionView } from "@/lib/ingestion/contracts";

const orderedStatuses = [
  "awaiting_scanner",
  "scanner_authorized",
  "snapshot_received",
  "queued",
  "generating",
  "report_ready",
] as const;

type CreateResponse = {
  session: UploadSessionView;
  deviceAuthorization: DeviceAuthorization;
};

export function ScannerConnectionFlow({
  initialSessions,
  localApiEnabled,
}: {
  initialSessions: UploadSessionView[];
  localApiEnabled: boolean;
}) {
  const [projectLabel, setProjectLabel] = useState("New local project");
  const [session, setSession] = useState<UploadSessionView | null>(null);
  const [authorization, setAuthorization] = useState<DeviceAuthorization | null>(null);
  const [starting, setStarting] = useState(false);
  const [copied, setCopied] = useState<"connect" | "upload" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session || ["report_ready", "failed", "expired"].includes(session.status)) return;
    const timer = window.setInterval(async () => {
      const response = await fetch(`/api/creator/upload-sessions/${session.id}`, {
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setError(body?.error?.message ?? "Could not refresh the import status.");
        return;
      }
      const body = (await response.json()) as { session: UploadSessionView };
      setSession(body.session);
    }, 1_500);
    return () => window.clearInterval(timer);
  }, [session]);

  async function startSession() {
    setStarting(true);
    setError(null);
    try {
      const response = await fetch("/api/creator/upload-sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectLabel }),
      });
      const body = (await response.json()) as CreateResponse | { error?: { message?: string } };
      if (!response.ok || !("session" in body)) {
        throw new Error("error" in body ? body.error?.message : "Could not start an upload session.");
      }
      setSession(body.session);
      setAuthorization(body.deviceAuthorization);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start an upload session.");
    } finally {
      setStarting(false);
    }
  }

  async function copyCommand(command: string, stage: "connect" | "upload") {
    await navigator.clipboard.writeText(command);
    setCopied(stage);
    window.setTimeout(() => setCopied(null), 1_500);
  }

  const currentIndex = session ? orderedStatuses.indexOf(session.status as (typeof orderedStatuses)[number]) : -1;
  const terminalError = session?.status === "failed" || session?.status === "expired";

  return (
    <div className="scanner-flow">
      <section className="scanner-flow__setup">
        <div className="scanner-step-label"><span>01</span> START IN THE BROWSER</div>
        <h2>Create a one-time scanner connection.</h2>
        <p>{localApiEnabled
          ? "This session is bound to your creator account. No repository is read by the browser."
          : "Hosted scanner connections are disabled. Run Buildstory locally to use the loopback-only scanner."}</p>
        <label>
          <span>Project label</span>
          <input value={projectLabel} onChange={(event) => setProjectLabel(event.target.value)} maxLength={120} disabled={!localApiEnabled} />
        </label>
        <button className="button button--primary" type="button" onClick={startSession} disabled={starting || !localApiEnabled}>
          {starting ? "Creating…" : "Create connection code"}
        </button>
        {error ? <p className="scanner-flow__error" role="alert">{error}</p> : null}
      </section>

      <section className={`scanner-terminal ${authorization ? "is-ready" : ""}`}>
        <header><span>02 / CONNECT, THEN SCAN + UPLOAD</span><i /><i /><i /></header>
        {authorization ? (
          <>
            <p className="scanner-terminal__stage"><b>A.</b> Connect this CLI to the account-bound session:</p>
            <button type="button" className="scanner-command" onClick={() => copyCommand(authorization.commandHint, "connect")}>
              <code><span>$</span> {authorization.commandHint}</code>
              <small>{copied === "connect" ? "Copied" : "Copy connect"}</small>
            </button>
            <p className="scanner-terminal__stage"><b>B.</b> After connection succeeds, scan the current repository and explicitly upload only its validated snapshot:</p>
            <button type="button" className="scanner-command scanner-command--secondary" onClick={() => copyCommand(authorization.scanUploadCommandHint, "upload")}>
              <code><span>$</span> {authorization.scanUploadCommandHint}</code>
              <small>{copied === "upload" ? "Copied" : "Copy upload"}</small>
            </button>
            <dl>
              <div><dt>Connection code</dt><dd>{authorization.userCode}</dd></div>
              <div><dt>Loopback API</dt><dd>{authorization.apiBaseUrl}</dd></div>
              <div><dt>Expires</dt><dd>{new Date(authorization.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</dd></div>
            </dl>
            <div className="scanner-token-note">
              <strong>Connect does not scan. Scan-upload requires separate consent.</strong>
              <p>The CLI stores the short-lived grant locally, sends no browser cookie, and can PUT one strict ProjectSnapshot. The consumed bearer may only read status/report until it expires.</p>
              <p>After upload, run <code>buildstory status</code> or watch the owner-bound dashboard status here.</p>
            </div>
          </>
        ) : (
          <div className="scanner-terminal__idle">
            <span>_</span><p>{localApiEnabled
              ? "A command will appear after the authenticated session is created."
              : "No remote scanner endpoint exists. The CLI intentionally refuses this hosted origin."}</p>
          </div>
        )}
      </section>

      <section className="scanner-flow__status">
        <div className="scanner-step-label"><span>03</span> WATCH THE HANDOFF</div>
        <h2>{session ? session.projectLabel : "Status appears here."}</h2>
        <div className="scanner-status-list">
          {orderedStatuses.map((status, index) => (
            <div className={currentIndex >= index ? "is-complete" : ""} key={status}>
              <i>{currentIndex > index ? "✓" : String(index + 1).padStart(2, "0")}</i>
              <span><strong>{status.replaceAll("_", " ")}</strong><small>{index === currentIndex ? session?.statusDetail : ""}</small></span>
            </div>
          ))}
        </div>
        {terminalError ? (
          <p className="scanner-flow__error" role="alert">
            {session.status === "expired" ? "This connection expired. Start a new one to continue." : session.statusDetail}
          </p>
        ) : null}
        {session?.reportId && session.status === "report_ready" ? (
          <a className="button button--primary" href={`/dashboard/reports/${session.reportId}`}>Review private report →</a>
        ) : null}
      </section>

      <section className="recent-imports">
        <header><span>RECENT IMPORTS</span><small>Owner-scoped · sanitized snapshots only</small></header>
        {initialSessions.map((item) => (
          <article key={item.id}>
            <span className={`activity-state activity-state--${item.status}`} />
            <div><strong>{item.projectLabel}</strong><small>{item.statusDetail}</small></div>
            <code>{item.id}</code>
          </article>
        ))}
      </section>
    </div>
  );
}
