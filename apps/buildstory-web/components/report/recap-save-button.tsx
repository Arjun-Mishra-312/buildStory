"use client";

import { useState } from "react";
import { Download } from "lucide-react";

export function RecapSaveButton({
  href,
  label = "Save image",
  variant = "text",
  onSaved,
}: {
  href: string;
  label?: string;
  variant?: "text" | "icon";
  onSaved?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function save() {
    setBusy(true);
    setError(false);
    try {
      const response = await fetch(href, { headers: { accept: "image/png" } });
      if (!response.ok) {
        setError(true);
        return;
      }
      const blob = await response.blob();
      if (!blob.type.startsWith("image/")) {
        setError(true);
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const filename = response.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "buildstory-recap.png";
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      onSaved?.();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  if (variant === "icon") {
    return (
      <button
        className="button button--text recap-save build-recap__icon"
        type="button"
        onClick={() => void save()}
        disabled={busy}
        aria-label={busy ? "Saving image" : error ? "Could not save image" : label}
        aria-busy={busy}
      >
        <Download size={16} strokeWidth={2.2} />
      </button>
    );
  }

  return (
    <button className="button button--text recap-save" type="button" onClick={() => void save()} disabled={busy}>
      {busy ? "Saving…" : error ? "Couldn’t save" : label}
    </button>
  );
}
