"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AccountDangerZone({ handle, exportOnly = false, deleteOnly = false }: { handle: string; exportOnly?: boolean; deleteOnly?: boolean }) {
  const router = useRouter();
  const [exporting, setExporting] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function exportData() {
    setExporting(true);
    try {
      const response = await fetch("/api/creator/account/export", { cache: "no-store" });
      if (!response.ok) throw new Error("Export failed.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "buildstory-account-export.json";
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Could not export your data. Try again shortly.");
    } finally {
      setExporting(false);
    }
  }

  async function deleteAccount() {
    if (confirmText !== handle || deleting) return;
    setDeleting(true);
    setError(null);
    try {
      const response = await fetch("/api/creator/account", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmHandle: confirmText }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(payload?.error?.message ?? "Could not delete your account.");
        return;
      }
      router.push("/");
    } catch {
      setError("Could not delete your account. Try again shortly.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="account-settings">
      {!deleteOnly ? <section className="report-card">
        <header><span>DATA EXPORT</span><strong>Download everything tied to your account</strong></header>
        <p>Profile, projects, reports, scan snapshots and AI-generated narrative text, upload session history, comments you&apos;ve written, reactions you&apos;ve given, and your follow graph, as one JSON file.</p>
        <button className="button button--secondary" type="button" onClick={() => void exportData()} disabled={exporting}>
          {exporting ? "Preparing export…" : "Export my data"}
        </button>
      </section> : null}

      {!exportOnly ? <section className="report-card report-card--danger">
        <header><span>DANGER ZONE</span><strong>Permanently delete your account</strong></header>
        <p>
          This removes your profile, projects, published build stories, comments, reactions, and follow
          relationships. It cannot be undone.
        </p>
        <label>
          <span>Type <strong>{handle}</strong> to confirm</span>
          <input
            value={confirmText}
            onChange={(event) => setConfirmText(event.target.value)}
            placeholder={handle}
            autoComplete="off"
          />
        </label>
        {error ? <p className="comment-thread__error">{error}</p> : null}
        <button
          className="button button--dark"
          type="button"
          onClick={() => void deleteAccount()}
          disabled={confirmText !== handle || deleting}
        >
          {deleting ? "Deleting…" : "Permanently delete my account"}
        </button>
      </section> : null}
    </div>
  );
}
