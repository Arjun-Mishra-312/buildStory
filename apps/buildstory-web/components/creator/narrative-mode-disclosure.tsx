import Link from "next/link";
import type { NarrativeMode } from "@/lib/ingestion/scanner-project-snapshot";

type DisclosurePoints = {
  readLocally: string;
  leavesMachine: string;
  whoReceivesIt: string;
  redactedFirst: string;
  storedAndRemoval: string;
};

/**
 * Copy is derived from packages/buildstory-scanner/src/privacy-boundary.ts
 * (the redaction categories: remote-url, raw-host, absolute-path,
 * relative-file-path, plus the known-secret-format list in redaction.ts)
 * and packages/buildstory-scanner/docs/privacy.md, so this disclosure and
 * the scanner's actual behavior cannot drift apart silently - if the
 * redaction boundary changes, this text should change with it.
 */
const REDACTED_FIRST = "Recognized email addresses, file paths, URLs, hostnames, and known secret formats are replaced or cause an excerpt to be dropped before it can leave this machine. Pattern redaction cannot identify every personal fact, pasted code fragment, novel secret, or low-entropy credential, so review remains required.";

const POINTS: Record<NarrativeMode, DisclosurePoints> = {
  local: {
    readLocally: "Your local Git history and local AI coding-session files (Claude Code, Codex, Cursor, Google Antigravity) for the repository you scan.",
    leavesMachine: "Deterministic metrics, profile scores, and sanitized AI-written narrative prose. Selected excerpts travel only over loopback to the Ollama service on this machine; they are not uploaded to Buildstory or an external model provider.",
    whoReceivesIt: "Buildstory only.",
    redactedFirst: REDACTED_FIRST,
    storedAndRemoval: "Stored as a private report until you choose to publish it. Unpublish to remove public access; account deletion removes the stored private report. Individual report deletion is not currently available.",
  },
  byok: {
    readLocally: "Your local Git history and local AI coding-session files for the repository you scan.",
    leavesMachine: "After mandatory pre-send review, the exact redacted excerpts and displayed deterministic facts go directly to OpenRouter or OpenAI, never through Buildstory. Deep uses a private analysis pass followed by V3 synthesis; each component may make at most one bounded JSON-repair request. Standard is capped at 40 excerpts/600 characters each/20,000 characters total; Deep at 240 excerpts/1,500 characters each/700 KiB total, dynamically reduced to fit the upload grant. Only the finished report and content-free receipt are uploaded.",
    whoReceivesIt: "Your chosen provider, then Buildstory receives only the finished report. OpenRouter requests use ZDR-only routing; OpenAI requests send store: false, while retention remains controlled by your OpenAI organization policy.",
    redactedFirst: REDACTED_FIRST,
    storedAndRemoval: "Stored as a private report until you choose to publish it. Unpublish to remove public access; account deletion removes the stored private report. Individual report deletion is not currently available.",
  },
  cloud: {
    readLocally: "Your local Git history and local AI coding-session files for the repository you scan.",
    leavesMachine: "Only the exact redacted excerpt bundle you review and explicitly release, plus disclosed deterministic facts. For update chapters, Deep also sends the prior stored chapter's aggregate facts, deterministic profile, and final retained report—but not its old excerpts. Standard is capped at 40 excerpts, 600 characters each and 20,000 characters total; Pro deep is capped at 240 excerpts, 1,500 characters each and 700 KiB total, dynamically reduced to fit the upload grant.",
    whoReceivesIt: "Buildstory, then DeepSeek V4 Flash through OpenRouter. Every request requires a ZDR-eligible endpoint, denies provider data collection, and requires parameter support. OpenRouter may route only among compliant endpoints, but still processes operational/account/billing/security/request metadata under its policy. Deep synthesis receives an analysis map that may summarize excerpts even though excerpt strings are not directly included again.",
    redactedFirst: REDACTED_FIRST,
    storedAndRemoval: "Buildstory temporarily holds excerpt text only while generation is queued or retryable, erases it on success or terminal failure, and marks it to expire after two hours; the five-minute scheduled sweep enforces expiry. The private report and content-free evidence receipt remain until account deletion.",
  },
  off: {
    readLocally: "Your local Git history and local AI coding-session files for the repository you scan.",
    leavesMachine: "Deterministic metrics and profile scores only - no AI narrative generation runs, so no conversation excerpts are ever selected, read, or sent anywhere.",
    whoReceivesIt: "Buildstory only.",
    redactedFirst: REDACTED_FIRST,
    storedAndRemoval: "Stored as a private report until you choose to publish it. Unpublish to remove public access; account deletion removes the stored private report. Individual report deletion is not currently available.",
  },
};

export function NarrativeModeDisclosure({ mode }: { mode: NarrativeMode }) {
  const points = POINTS[mode];
  return (
    <dl className="narrative-mode-disclosure" aria-live="polite">
      <div><dt>What&rsquo;s read on this machine</dt><dd>{points.readLocally}</dd></div>
      <div><dt>What leaves this machine</dt><dd>{points.leavesMachine}</dd></div>
      <div><dt>Who receives it</dt><dd>{points.whoReceivesIt}</dd></div>
      <div><dt>Redacted first</dt><dd>{points.redactedFirst}</dd></div>
      <div><dt>Stored, and how to remove it</dt><dd>{points.storedAndRemoval}</dd></div>
      <p className="narrative-mode-disclosure__footnote">
        This choice is saved in this browser only, not on your account - it will reset to Local on a new device. Read the full <Link href="/privacy">Privacy Policy</Link> for everything else Buildstory collects.
      </p>
    </dl>
  );
}
