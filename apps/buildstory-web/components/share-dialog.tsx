"use client";

import { useEffect, useState } from "react";
import { copyToClipboard } from "@/lib/clipboard";

type ShareDialogProps = {
  open: boolean;
  onClose: () => void;
  path: string;
  title: string;
  imagePath: string;
};

export function ShareDialog({ open, onClose, path, title, imagePath }: ShareDialogProps) {
  const [copied, setCopied] = useState(false);
  // Lazy initializer: runs once on mount, client-side only - avoids an extra
  // render from setting this in an effect, and stays SSR-safe since
  // `navigator.canShare` simply doesn't exist in the Worker's SSR environment.
  const [canShareFiles] = useState(() => {
    if (typeof navigator === "undefined" || typeof navigator.canShare !== "function") return false;
    const probe = new File([], "probe.png", { type: "image/png" });
    return navigator.canShare({ files: [probe] });
  });
  const [deviceShareState, setDeviceShareState] = useState<"idle" | "sharing" | "error">("idle");

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  function absoluteUrl() {
    return `${window.location.origin}${path}`;
  }

  async function copyLink() {
    const ok = await copyToClipboard(absoluteUrl());
    setCopied(ok);
    if (ok) window.setTimeout(() => setCopied(false), 1600);
  }

  async function shareViaDevice() {
    setDeviceShareState("sharing");
    try {
      const response = await fetch(imagePath);
      const blob = await response.blob();
      const file = new File([blob], "buildstory-share-card.png", { type: "image/png" });
      if (!navigator.canShare({ files: [file] })) {
        setDeviceShareState("error");
        return;
      }
      await navigator.share({ files: [file], title, text: title });
      setDeviceShareState("idle");
    } catch {
      // User cancellation lands here too - not an error worth surfacing.
      setDeviceShareState("idle");
    }
  }

  const url = absoluteUrl();
  const intents = [
    { label: "X", href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}` },
    { label: "Reddit", href: `https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}` },
    { label: "LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}` },
    { label: "Bluesky", href: `https://bsky.app/intent/compose?text=${encodeURIComponent(`${title} ${url}`)}` },
  ];

  return (
    <div className="share-dialog-backdrop" role="presentation" onClick={onClose}>
      <div className="share-dialog" role="dialog" aria-modal="true" aria-label="Share this build story" onClick={(event) => event.stopPropagation()}>
        <div className="share-dialog__header">
          <strong>Share the receipt</strong>
          <button className="button button--text" type="button" onClick={onClose}>Close</button>
        </div>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="share-dialog__preview" src={imagePath} alt={`${title} — shareable build story card`} />

        <div className="share-dialog__actions">
          <a className="button button--primary button--small" href={imagePath} download>
            Download image
          </a>
          {canShareFiles ? (
            <button className="button button--secondary button--small" type="button" onClick={() => void shareViaDevice()} disabled={deviceShareState === "sharing"}>
              {deviceShareState === "sharing" ? "Sharing…" : deviceShareState === "error" ? "Couldn't share" : "Share via device"}
            </button>
          ) : null}
        </div>

        <div className="share-dialog__link-row">
          <span>{url}</span>
          <button className="button button--text" type="button" onClick={() => void copyLink()}>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>

        <div className="share-dialog__platforms">
          {intents.map((intent) => (
            <a key={intent.label} className="button button--secondary button--small" href={intent.href} target="_blank" rel="noopener noreferrer">
              {intent.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
