"use client";

import { useEffect, useState } from "react";
import { copyToClipboard } from "@/lib/clipboard";
import { isShareBackgroundId, SHARE_BACKGROUND_OPTIONS, type BackgroundTheme, type ShareBackgroundId, type StoryBackgroundId } from "@/lib/background-options";

type ShareDialogProps = {
  open: boolean;
  onClose: () => void;
  path: string;
  title: string;
  imagePath: string;
  storyBackgroundId?: StoryBackgroundId;
};

export function ShareDialog({ open, onClose, path, title, imagePath, storyBackgroundId }: ShareDialogProps) {
  const [copied, setCopied] = useState(false);
  const [shareTheme, setShareTheme] = useState<BackgroundTheme>(() => typeof document !== "undefined" && document.documentElement.dataset.theme === "light" ? "light" : "dark");
  const [shareBackgroundId, setShareBackgroundId] = useState<ShareBackgroundId>(() => isShareBackgroundId(storyBackgroundId) ? storyBackgroundId : SHARE_BACKGROUND_OPTIONS[0].id);
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
      const response = await fetch(selectedImagePath);
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

  const selectedImagePath = (() => {
    const params = new URLSearchParams({ background: shareBackgroundId, theme: shareTheme });
    return `${imagePath}?${params.toString()}`;
  })();

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
        <img className="share-dialog__preview" src={selectedImagePath} alt={`${title} — shareable build story card`} />

        <fieldset className="share-dialog__background-picker">
          <legend>Receipt visual</legend>
          <div className="share-dialog__theme-toggle" role="group" aria-label="Receipt color theme">
            {(["light", "dark"] as const).map((theme) => (
              <button key={theme} type="button" className={`button button--small ${shareTheme === theme ? "button--primary" : "button--secondary"}`} onClick={() => setShareTheme(theme)}>
                {theme === "light" ? "Light" : "Dark"}
              </button>
            ))}
          </div>
          <div className="share-dialog__background-grid">
            {SHARE_BACKGROUND_OPTIONS.map((option) => (
              <label className={`share-dialog__background-option${shareBackgroundId === option.id ? " is-selected" : ""}`} key={option.id}>
                <input type="radio" name="shareBackground" checked={shareBackgroundId === option.id} onChange={() => setShareBackgroundId(option.id)} />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={option.assets[shareTheme]} alt="" />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="share-dialog__actions">
          <a className="button button--primary button--small" href={selectedImagePath} download>
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
