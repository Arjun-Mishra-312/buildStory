"use client";

import { useState } from "react";
import { copyToClipboard } from "@/lib/clipboard";
import { LOCAL_GENERATE_COMMAND } from "@/lib/marketing/generate";

export function GenerateCommand({ className = "" }: { className?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const ok = await copyToClipboard(LOCAL_GENERATE_COMMAND);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <button className={`landing-command ${className}`.trim()} type="button" onClick={() => void copy()}>
      <code>{LOCAL_GENERATE_COMMAND}</code>
      <small>{copied ? "Copied" : "Copy"}</small>
    </button>
  );
}
