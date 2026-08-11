"use client";

import { useEffect, useRef, type ChangeEvent } from "react";
import type { PublicFieldKey } from "@/lib/ingestion/contracts";

export type PublishReviewStory = {
  name: string;
  owner: { name: string; handle: string; role: string };
  status: string;
  stack: string[];
};

export type PublishReviewField = {
  id: PublicFieldKey;
  label: string;
  detail: string;
  reviewValue: string;
};

export type PublishReviewDialogProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  acknowledged: boolean;
  onAcknowledgedChange: (event: ChangeEvent<HTMLInputElement>) => void;
  saving: boolean;
  isLive: boolean;
  story: PublishReviewStory;
  category: string | null;
  storyBackgroundLabel: string;
  receiptId: string;
  fields: PublishReviewField[];
  selectedFields: PublicFieldKey[];
  videoUrl: string | null;
  mediaCount: number;
};

/**
 * Shared final privacy review used by both the private and public workbench
 * tabs. Keeping the modal in one component prevents the two tab entry points
 * from drifting apart.
 */
export function PublishReviewDialog({
  open,
  onClose,
  onConfirm,
  acknowledged,
  onAcknowledgedChange,
  saving,
  isLive,
  story,
  category,
  storyBackgroundLabel,
  receiptId,
  fields,
  selectedFields,
  videoUrl,
  mediaCount,
}: PublishReviewDialogProps) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>("button, input, a, select, textarea")]
        .filter((node) => !node.hasAttribute("disabled"));
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    closeRef.current?.focus();
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      className="publish-review-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="publish-review"
        role="dialog"
        aria-modal="true"
        aria-labelledby="publish-review-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span className="section-index">FINAL PRIVACY REVIEW</span>
            <h2 id="publish-review-title">This is what becomes public.</h2>
          </div>
          <button ref={closeRef} type="button" className="button button--text" onClick={onClose} aria-label="Close publish review">Close</button>
        </header>
        <div className="publish-review__columns">
          <section>
            <h3>Always public</h3>
            <dl>
              <div><dt>Project</dt><dd>{story.name}</dd></div>
              <div><dt>Owner</dt><dd>{story.owner.name} (@{story.owner.handle}) · {story.owner.role}</dd></div>
              <div><dt>Category / status</dt><dd>{category} / {story.status}</dd></div>
              <div><dt>Tech stack</dt><dd>{story.stack.join(", ") || "No stack labels"}</dd></div>
              <div><dt>Visual</dt><dd>{storyBackgroundLabel}</dd></div>
              <div><dt>Receipt</dt><dd>{receiptId}</dd></div>
            </dl>
          </section>
          <section>
            <h3>Selected optional data ({fields.length})</h3>
            <ul>
              {fields.map((field) => (
                <li key={field.id}>
                  <strong>{field.label}</strong>
                  <span>{field.detail}</span>
                  <small>{field.reviewValue}</small>
                </li>
              ))}
            </ul>
          </section>
        </div>
        <aside>
          <strong>Still private</strong>
          <p>Repository path and remotes, branch and commit hashes, full source snapshot, raw transcripts and tool payloads, reviewed excerpt text, connection credentials, and every unchecked optional field.</p>
          {(selectedFields.includes("narrative") || selectedFields.some((field) => field.startsWith("story"))) ? <p>AI-written prose can reflect the meaning of private conversations. Pattern redaction reduces known secret, path, host, URL, and email exposure, but it is not a guarantee of anonymity — read the public preview before confirming.</p> : null}
          {selectedFields.includes("artifactLinks") && videoUrl ? <p>The video link is public. Visitors must choose to load an embed before their browser connects to the video provider.</p> : null}
          {selectedFields.includes("artifactMedia") ? <p>{mediaCount} uploaded image{mediaCount === 1 ? "" : "s"} will be public until you unpublish or remove them.</p> : null}
        </aside>
        <label className="publish-review__acknowledgement">
          <input type="checkbox" checked={acknowledged} onChange={onAcknowledgedChange} />
          <span>I reviewed the exact categories above and understand this creates or replaces a page anyone can view.</span>
        </label>
        <footer>
          <button type="button" className="button button--secondary" onClick={onClose}>Keep private</button>
          <button type="button" className="button button--primary" onClick={onConfirm} disabled={!acknowledged || saving}>
            {saving ? "Publishing..." : isLive ? "Confirm and republish" : "Confirm and publish"}
          </button>
        </footer>
      </section>
    </div>
  );
}
