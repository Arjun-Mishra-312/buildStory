"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type TargetType = "report" | "comment" | "user";

const REASONS: Array<{ value: string; label: string }> = [
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment" },
  { value: "impersonation", label: "Impersonation" },
  { value: "malicious_content", label: "Malicious content" },
  { value: "other", label: "Other" },
];

export function ReportDialog({ targetType, targetId, label = "Report" }: { targetType: TargetType; targetId: string; label?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reasonCode, setReasonCode] = useState("spam");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<"idle" | "sent" | "error">("idle");

  async function submit() {
    if (busy) return;
    setBusy(true);
    setState("idle");
    try {
      const response = await fetch("/api/content-reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetType, targetId, reasonCode, note: note.trim() || null }),
      });
      if (response.status === 401) {
        router.push(`/signin?callbackUrl=${encodeURIComponent(window.location.pathname)}`);
        return;
      }
      if (!response.ok) {
        setState("error");
        return;
      }
      setState("sent");
    } catch {
      setState("error");
    } finally {
      setBusy(false);
    }
  }

  if (state === "sent") {
    return <span className="report-dialog__sent">Reported</span>;
  }

  if (!open) {
    return (
      <button type="button" className="report-dialog__trigger" onClick={() => setOpen(true)}>
        {label}
      </button>
    );
  }

  return (
    <div className="report-dialog">
      <label>
        Reason
        <select value={reasonCode} onChange={(event) => setReasonCode(event.target.value)}>
          {REASONS.map((reason) => (
            <option key={reason.value} value={reason.value}>
              {reason.label}
            </option>
          ))}
        </select>
      </label>
      <textarea
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Add context (optional)"
        rows={2}
        maxLength={500}
      />
      {state === "error" ? <p className="report-dialog__error">That report could not be sent. Try again.</p> : null}
      <div className="report-dialog__actions">
        <button type="button" className="button button--small button--primary" onClick={() => void submit()} disabled={busy}>
          Submit report
        </button>
        <button type="button" className="button button--small button--secondary" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </button>
      </div>
    </div>
  );
}
