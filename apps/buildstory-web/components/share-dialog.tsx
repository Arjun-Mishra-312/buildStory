"use client";

import { useEffect, useRef, useState } from "react";
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
  const [shareTheme, setShareTheme] = useState<BackgroundTheme>("dark");
  const [shareBackgroundId, setShareBackgroundId] = useState<ShareBackgroundId>(() => isShareBackgroundId(storyBackgroundId) ? storyBackgroundId : SHARE_BACKGROUND_OPTIONS[0].id);
  const [canShareFiles, setCanShareFiles] = useState(false);
  const [deviceShareState, setDeviceShareState] = useState<"idle" | "sharing" | "error">("idle");
  const [renderedImage, setRenderedImage] = useState<{ key: string; objectUrl: string; blob: Blob } | null>(null);
  const [previewErrorKey, setPreviewErrorKey] = useState<string | null>(null);
  const [previewRetry, setPreviewRetry] = useState(0);
  const objectUrlRef = useRef<string | null>(null);
  const selectedImagePath = `${imagePath}?${new URLSearchParams({ background: shareBackgroundId, theme: shareTheme }).toString()}`;

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (typeof navigator.canShare !== "function") return;
      const probe = new File([], "probe.png", { type: "image/png" });
      setCanShareFiles(navigator.canShare({ files: [probe] }));
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const controller = new AbortController();
    const loadPreview = async () => {
      try {
        const response = await fetch(selectedImagePath, { signal: controller.signal });
        if (!response.ok) throw new Error("share_preview_failed");
        const blob = await response.blob();
        if (!blob.type.startsWith("image/")) throw new Error("share_preview_invalid");
        const objectUrl = URL.createObjectURL(blob);
        if (controller.signal.aborted) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        const previousObjectUrl = objectUrlRef.current;
        objectUrlRef.current = objectUrl;
        setRenderedImage({ key: selectedImagePath, objectUrl, blob });
        setPreviewErrorKey(null);
        if (previousObjectUrl) URL.revokeObjectURL(previousObjectUrl);
      } catch {
        if (!controller.signal.aborted) setPreviewErrorKey(selectedImagePath);
      }
    };
    void loadPreview();
    return () => controller.abort();
  }, [open, previewRetry, selectedImagePath]);

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

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
    if (!renderedImage || renderedImage.key !== selectedImagePath) return;
    setDeviceShareState("sharing");
    try {
      const file = new File([renderedImage.blob], `buildstory-${shareBackgroundId}-${shareTheme}.png`, { type: "image/png" });
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

  const previewReady = renderedImage?.key === selectedImagePath;
  const previewFailed = previewErrorKey === selectedImagePath;
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

        <div className="share-dialog__preview-shell" aria-live="polite" aria-busy={!previewReady && !previewFailed}>
          {renderedImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className={`share-dialog__preview${previewReady ? "" : " is-stale"}`} src={renderedImage.objectUrl} alt={`${title} — shareable build story card`} />
          ) : <div className="share-dialog__preview-placeholder" />}
          {!previewReady && !previewFailed ? <span className="share-dialog__preview-status">Rendering selected receipt…</span> : null}
          {previewFailed ? <button className="share-dialog__preview-retry" type="button" onClick={() => { setPreviewErrorKey(null); setPreviewRetry((current) => current + 1); }}>Preview failed · Try again</button> : null}
        </div>

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
          {previewReady ? <a className="button button--primary button--small" href={renderedImage.objectUrl} download={`buildstory-${shareBackgroundId}-${shareTheme}.png`}>Download image</a> : <button className="button button--primary button--small" type="button" disabled>{previewFailed ? "Preview unavailable" : "Preparing image…"}</button>}
          {canShareFiles ? (
            <button className="button button--secondary button--small" type="button" onClick={() => void shareViaDevice()} disabled={!previewReady || deviceShareState === "sharing"}>
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
