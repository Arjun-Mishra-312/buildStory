"use client";

import { useState } from "react";
import { copyToClipboard } from "@/lib/clipboard";

type ShareButtonProps = {
  path: string;
  title: string;
  /** Path to the downloadable share-card PNG, e.g. /api/share/story/<handle>/<slug>. Omit to hide the download action. */
  downloadPath?: string;
};

export function ShareButton({ path, title, downloadPath }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  function absoluteUrl() {
    return `${window.location.origin}${path}`;
  }

  async function copyLink() {
    const ok = await copyToClipboard(absoluteUrl());
    setCopied(ok);
    if (ok) window.setTimeout(() => setCopied(false), 1600);
  }

  async function nativeShare() {
    if (!("share" in navigator)) return false;
    try {
      await navigator.share({ title, url: absoluteUrl() });
      return true;
    } catch {
      return true; // user cancelled - don't fall through to the menu
    }
  }

  async function onShareClick() {
    if ("share" in navigator) {
      const handled = await nativeShare();
      if (handled) return;
    }
    setOpen((current) => !current);
  }

  const url = typeof window !== "undefined" ? absoluteUrl() : path;
  const intents = [
    {
      label: "Share on X",
      href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`,
    },
    {
      label: "Share on Reddit",
      href: `https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`,
    },
    {
      label: "Share on LinkedIn",
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
    },
    {
      label: "Share on Bluesky",
      href: `https://bsky.app/intent/compose?text=${encodeURIComponent(`${title} ${url}`)}`,
    },
  ];

  return (
    <div className="share-button">
      <button type="button" className="button button--secondary button--small" onClick={() => void onShareClick()}>
        Share <span aria-hidden="true">↗</span>
      </button>
      {open ? (
        <div className="share-button__menu" role="menu">
          <button type="button" role="menuitem" onClick={() => void copyLink()}>
            {copied ? "Link copied" : "Copy link"}
          </button>
          {downloadPath ? (
            <a role="menuitem" href={downloadPath} download>
              Download image
            </a>
          ) : null}
          {intents.map((intent) => (
            <a key={intent.label} role="menuitem" href={intent.href} target="_blank" rel="noopener noreferrer">
              {intent.label}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
