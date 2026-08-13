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

  async function save() {
    setBusy(true);
    try {
      const response = await fetch(href, { headers: { accept: "image/png" } });
      if (!response.ok) return;
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const filename = response.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "buildstory-recap.png";
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      onSaved?.();
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
        aria-label={busy ? "Saving image" : label}
        aria-busy={busy}
      >
        <Download size={16} strokeWidth={2.2} />
      </button>
    );
  }

  return (
    <button className="button button--text recap-save" type="button" onClick={() => void save()} disabled={busy}>
      {busy ? "Saving…" : label}
    </button>
  );
}
