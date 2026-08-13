"use client";

import { useEffect, useState } from "react";
import type { DeviceAuthorization, UploadSessionView } from "@/lib/ingestion/contracts";
import { NARRATIVE_MODE_PREFERENCE_KEY, NARRATIVE_PROVIDER_PREFERENCE_KEY, OLLAMA_MODEL_PREFERENCE_KEY } from "./ollama-model-status";
import { GuideTooltip } from "@/components/guidance/studio-guide";

const orderedStatuses = [
  "awaiting_scanner",
  "scanner_authorized",
  "snapshot_received",
  "queued",
  "generating",
  "report_ready",
] as const;

const STATUS_LABELS: Record<(typeof orderedStatuses)[number], string> = {
  awaiting_scanner: "Awaiting scanner",
  scanner_authorized: "Scanner authorized",
  snapshot_received: "Snapshot received",
  queued: "Base report queued",
  generating: "Assembling base report",
  report_ready: "Private report ready",
};

const INSTALL_COMMAND = "npm install --global buildstory-scan";

/** Display labels for the internal narrative-mode value, which stays "local"/"byok"/"cloud"/"off" in code, storage, and the wire protocol - only this label is user-facing. */
const NARRATIVE_MODE_LABELS: Record<"local" | "byok" | "cloud" | "off", string> = {
  local: "Local",
  byok: "Bring your own key",
  cloud: "Buildstory Cloud",
  off: "Off",
};

type CreateResponse = {
  session: UploadSessionView;
  deviceAuthorization: DeviceAuthorization;
};

type TargetProject = { id: string; name: string; nextChapterIndex: number };

export function ScannerConnectionFlow({
  initialSessions,
  scannerEnabled,
  targetProject = null,
}: {
  initialSessions: UploadSessionView[];
  scannerEnabled: boolean;
  /** Set when this session is started from an existing project's "Scan for updates" flow, not the general "Create a story" flow. */
  targetProject?: TargetProject | null;
}) {
  const [projectLabel, setProjectLabel] = useState(targetProject?.name ?? "New local project");
  const [session, setSession] = useState<UploadSessionView | null>(null);
  const [authorization, setAuthorization] = useState<DeviceAuthorization | null>(null);
  const [starting, setStarting] = useState(false);
  const [copied, setCopied] = useState<"install" | "connect" | "upload" | null>(null);
  const [withEvidence, setWithEvidence] = useState(true);
  const [narrativeMode, setNarrativeMode] = useState<"local" | "byok" | "cloud" | "off">("local");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const narrativePending = session?.narrativeStatus === "queued" || session?.narrativeStatus === "generating";
    if (!session || ["failed", "expired"].includes(session.status) || (session.status === "report_ready" && !narrativePending)) return;
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
      let narrativeModel: string | null = null;
      let selectedMode: "local" | "byok" | "cloud" | "off" = "cloud";
      let narrativeProvider: "openrouter" | "openai" = "openrouter";
      try {
        const storedModel = window.localStorage.getItem(OLLAMA_MODEL_PREFERENCE_KEY);
        narrativeModel = storedModel && storedModel !== "auto" ? storedModel : null;
        const storedMode = window.localStorage.getItem(NARRATIVE_MODE_PREFERENCE_KEY);
        if (storedMode === "local" || storedMode === "byok" || storedMode === "cloud" || storedMode === "off") selectedMode = storedMode;
        if (window.localStorage.getItem(NARRATIVE_PROVIDER_PREFERENCE_KEY) === "openai") narrativeProvider = "openai";
      } catch {
        narrativeModel = null;
      }
      setNarrativeMode(selectedMode);
      const response = await fetch("/api/creator/upload-sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectLabel,
          narrativeModel,
          narrativeMode: selectedMode,
          ...(selectedMode === "byok" ? { narrativeProvider } : {}),
          ...(targetProject ? { projectId: targetProject.id } : {}),
        }),
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

  async function copyCommand(command: string, stage: "install" | "connect" | "upload") {
    await navigator.clipboard.writeText(command);
    setCopied(stage);
    window.setTimeout(() => setCopied(null), 1_500);
  }

  const currentIndex = session ? orderedStatuses.indexOf(session.status as (typeof orderedStatuses)[number]) : -1;
  const terminalError = session?.status === "failed" || session?.status === "expired";

  return (
    <div className="scanner-flow">
      <section className="scanner-install">
        <div className="scanner-install__copy">
          <div className="scanner-step-label"><span>1×</span> ONE-TIME SETUP</div>
          <h2>Install the BuildStory scanner.</h2>
          <p>
            Run this once before creating your first story. If you already installed
            <code> buildstory-scan</code>, you can skip this step.
          </p>
        </div>
        <div className="scanner-install__command">
          <button type="button" className="scanner-command scanner-command--install" onClick={() => copyCommand(INSTALL_COMMAND, "install")}>
            <code><span>$</span> {INSTALL_COMMAND}</code>
            <small>{copied === "install" ? "Copied" : "Copy install"}</small>
          </button>
          <small>Requires Node.js 22.5 or newer. You can run it from any folder.</small>
        </div>
      </section>

      <section className="scanner-flow__setup" data-guide="create-scanner">
        <div className="scanner-step-label"><span>01</span> PROJECT DETAILS <GuideTooltip label="scan and report">A scan is the repository snapshot. The report is the private review generated from that scan.</GuideTooltip></div>
          <h2>{targetProject ? `Scan ${targetProject.name} for updates.` : "Start a guided story capture."}</h2>
        <p>
          {targetProject
            ? `This scan becomes Chapter ${targetProject.nextChapterIndex} of ${targetProject.name}. It must be run against the same repository as the earlier chapters.`
            : scannerEnabled
              ? "This session is bound to your creator account. No repository is read by the browser."
              : "Scanner connections are not configured on this deployment yet."}
        </p>
        {targetProject ? (
          <div className="scanner-target-project">
            <span>Project</span>
            <strong>{targetProject.name}</strong>
          </div>
        ) : (
          <label>
            <span>Project label</span>
            <input value={projectLabel} onChange={(event) => setProjectLabel(event.target.value)} maxLength={120} disabled={!scannerEnabled} />
          </label>
        )}
        <button className="button button--primary" type="button" onClick={startSession} disabled={starting || !scannerEnabled}>
          {starting ? "Starting…" : targetProject ? "Start scan connection" : "Create story connection"}
        </button>
        {error ? <p className="scanner-flow__error" role="alert">{error}</p> : null}
      </section>

      <section className={`scanner-terminal ${authorization ? "is-ready" : ""}`}>
        <header><span>02 / CONNECTION COMMAND</span><i /><i /><i /></header>
        {authorization ? (
          <>
            <p className="scanner-terminal__stage"><b>A.</b> Connect this CLI to the account-bound session:</p>
            <button type="button" className="scanner-command" onClick={() => copyCommand(authorization.commandHint, "connect")}>
              <code><span>$</span> {authorization.commandHint}</code>
              <small>{copied === "connect" ? "Copied" : "Copy connect"}</small>
            </button>
            <p className="scanner-terminal__stage"><b>B.</b> After connection succeeds, scan the current repository and explicitly upload only its validated snapshot:</p>
            {narrativeMode === "cloud" ? (
              <label className="scanner-evidence-option">
                <input type="checkbox" checked={withEvidence} onChange={(event) => setWithEvidence(event.target.checked)} />
                <span>Include the reviewed redacted evidence bundle for a {session?.analysisTier === "deep" ? "deep Pro" : "standard"} report <small>(requires explicit review)</small></span>
              </label>
            ) : null}
            <p className="scanner-evidence-explainer">
              <strong>Narrative mode <GuideTooltip label="narrative mode">Local keeps excerpts on this machine; bring-your-own-key sends excerpts only to a cloud model you configure yourself; Buildstory Cloud is an explicit upload opt-in through Buildstory; off creates deterministic metrics only.</GuideTooltip></strong>{" "}
              {narrativeMode === "local"
                ? "Local mode sizes its evidence and context profile from this machine's RAM and logical CPU count (safe, balanced, or enhanced). Selected excerpts travel only over loopback to Ollama and are never uploaded to Buildstory or an external model provider."
                : narrativeMode === "byok"
                  ? `Bring-your-own-key requires a pre-send CLI review of the exact excerpts and facts, then sends them directly to ${session?.narrativeProvider === "openai" ? "OpenAI using BUILDSTORY_OPENAI_API_KEY; store: false is sent, but your OpenAI organization retention policy controls retention" : "OpenRouter using BUILDSTORY_OPENROUTER_API_KEY with ZDR routing and data collection denied"}. ${session?.analysisTier === "deep" ? "Deep is capped at 400 excerpts, 1,500 characters each and 700 KiB total (dynamically reduced to fit the upload grant) and uses a private analysis pass followed by V3 synthesis;" : "Standard is capped at 80 excerpts, 800 characters each and 60,000 characters total;"} each component may make one JSON-repair request. Buildstory receives only the finished report and never the key or excerpts.`
                  : narrativeMode === "cloud"
                    ? `Buildstory Cloud sends the reviewed evidence and disclosed deterministic facts to DeepSeek V4 Flash through OpenRouter with ZDR-eligible routing and data collection denied. ${session?.analysisTier === "deep" ? "Deep is capped at 400 excerpts, 1,500 characters each and 700 KiB total, dynamically reduced to fit the upload grant; update chapters also include the prior chapter's aggregate facts, deterministic profile, and final report, but not its old excerpts." : "Standard is capped at 80 excerpts, 800 characters each and 60,000 characters total."} Buildstory scrubs excerpts on completion or final failure and marks them to expire after two hours.`
                    : "Off mode uploads deterministic metrics and profile scores without narrative prose."}
            </p>
            <button type="button" className="scanner-command scanner-command--secondary" onClick={() => {
              const suffix = narrativeMode === "cloud" && withEvidence ? " --with-evidence --review" : narrativeMode === "local" || narrativeMode === "byok" ? " --review" : "";
              void copyCommand(`${authorization.scanUploadCommandHint}${suffix}`, "upload");
            }}>
              <code><span>$</span> {authorization.scanUploadCommandHint}{narrativeMode === "cloud" && withEvidence ? " --with-evidence --review" : narrativeMode === "local" || narrativeMode === "byok" ? " --review" : ""}</code>
              <small>{copied === "upload" ? "Copied" : "Copy upload"}</small>
            </button>
            <dl>
              <div><dt>Connection code</dt><dd>{authorization.userCode}</dd></div>
              <div><dt>Loopback API</dt><dd>{authorization.apiBaseUrl}</dd></div>
              <div><dt>Narrative mode</dt><dd>{NARRATIVE_MODE_LABELS[session?.narrativeMode ?? narrativeMode]}</dd></div>
              <div><dt>Report depth</dt><dd>{session?.analysisTier === "deep" ? "Pro / deep" : session?.narrativeMode === "local" ? "Hardware-adaptive local" : "Standard"}{session?.narrativeMode === "byok" ? " — provider-generated" : ""}</dd></div>
              <div><dt>Provider</dt><dd>{session?.narrativeProvider === "openrouter" ? "OpenRouter / DeepSeek V4 Flash" : session?.narrativeProvider ?? "None"}</dd></div>
              {(session?.narrativeMode ?? narrativeMode) !== "cloud" ? (
                <div><dt>Narrative model</dt><dd>{session?.narrativeModel ?? "Automatic"}</dd></div>
              ) : null}
              <div><dt>Expires</dt><dd>{new Date(authorization.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</dd></div>
            </dl>
            <div className="scanner-token-note">
              <strong>Connect does not scan. Scan-upload requires separate consent.</strong>
              <p>The CLI stores the short-lived grant locally, sends no browser cookie, and can PUT one strict ProjectSnapshot. The consumed bearer may only read status/report until it expires.</p>
              <p>After upload, run <code>buildstory-scan status</code> or watch the owner-bound dashboard status here.</p>
            </div>
          </>
        ) : (
          <div className="scanner-terminal__idle">
            <span>_</span><p>{scannerEnabled
              ? "A command will appear after the authenticated session is created."
              : "The hosted scanner endpoint is not configured for this environment."}</p>
          </div>
        )}
      </section>

      <section className="scanner-flow__status" data-guide="create-progress update-progress">
        <div className="scanner-step-label"><span>03</span> LIVE PROGRESS <GuideTooltip label="report progress">When the report is ready, review it before publishing a chapter.</GuideTooltip></div>
        <h2>{session ? session.projectLabel : "Status appears here."}</h2>
        <div className="scanner-status-list">
          {orderedStatuses.map((status, index) => (
            <div className={currentIndex >= index ? "is-complete" : ""} key={status}>
              <i>{currentIndex > index ? "✓" : String(index + 1).padStart(2, "0")}</i>
              <span><strong>{STATUS_LABELS[status]}</strong><small>{index === currentIndex ? session?.statusDetail : ""}</small></span>
            </div>
          ))}
        </div>
        {session?.reportId && (session.narrativeStatus === "queued" || session.narrativeStatus === "generating") ? (
          <div className="scanner-narrative-progress" role="status" aria-live="polite">
            <span className="scanner-narrative-progress__pulse" aria-hidden="true" />
            <div>
              <strong>{session.narrativeStatus === "queued" ? "AI narrative queued" : "AI narrative generating"}</strong>
              <p>Your private report is ready to browse. DeepSeek is processing the reviewed evidence in the background, and this status will update automatically.</p>
            </div>
          </div>
        ) : session?.reportId && session.narrativeStatus === "ready" ? (
          <div className="scanner-narrative-progress scanner-narrative-progress--ready" role="status">
            <span aria-hidden="true">✓</span><div><strong>AI narrative ready</strong><p>The evidence-linked narrative is available in the private report.</p></div>
          </div>
        ) : session?.reportId && session.narrativeStatus === "failed" ? (
          <div className="scanner-narrative-progress scanner-narrative-progress--failed" role="alert">
            <span aria-hidden="true">!</span><div><strong>AI narrative could not be generated</strong><p>The deterministic private report remains available.</p></div>
          </div>
        ) : null}
        {terminalError ? (
          <p className="scanner-flow__error" role="alert">
            {session.status === "expired" ? "This connection expired. Start a new one to continue." : session.statusDetail}
          </p>
        ) : null}
        {session?.reportId && session.status === "report_ready" ? (
          <a className="button button--primary" href={`/studio/reports/${session.reportId}`}>{session.narrativeStatus === "queued" || session.narrativeStatus === "generating" ? "Browse report while AI generates" : "Review private report"} →</a>
        ) : null}
      </section>

      <section className="recent-imports">
        <header><span>RECENT IMPORTS</span><small>Owner-scoped · sanitized snapshots only</small></header>
        {initialSessions.map((item) => (
          <article key={item.id}>
            <span className={`activity-state activity-state--${item.status}`} />
            <div><strong>{item.projectLabel}</strong><small>{item.statusDetail}{item.narrativeStatus === "queued" || item.narrativeStatus === "generating" ? ` AI narrative ${item.narrativeStatus}.` : item.narrativeStatus === "ready" ? " AI narrative ready." : ""}</small></div>
            <code>{item.id}</code>
          </article>
        ))}
      </section>
    </div>
  );
}
