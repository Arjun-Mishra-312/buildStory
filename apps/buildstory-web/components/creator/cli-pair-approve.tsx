"use client";

import { useState } from "react";

export function CliPairApproveForm({ userCode }: { userCode: string }) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (done) {
    return <p>Approved. Return to the CLI — it will upload the report already on disk.</p>;
  }

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setSubmitting(true);
        setError(null);
        try {
          const response = await fetch("/api/creator/cli-pair/approve", {
            method: "POST",
            headers: { "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify({ userCode }),
          });
          if (!response.ok) {
            const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
            setError(body?.error?.message ?? "Could not approve this CLI upload.");
            return;
          }
          setDone(true);
        } finally {
          setSubmitting(false);
        }
      }}
    >
      <button type="submit" className="button button--primary" disabled={submitting}>
        {submitting ? "Approving…" : "Approve upload"}
      </button>
      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}
