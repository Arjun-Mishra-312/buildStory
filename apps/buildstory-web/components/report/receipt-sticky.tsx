"use client";

import { useEffect, useId, useState } from "react";
import { ReceiptCard } from "@/components/receipt-card";
import { RecapSaveButton } from "./recap-save-button";
import { receiptFilesTouchedNote } from "@/lib/report/public-brief";

type ReceiptStory = Parameters<typeof ReceiptCard>[0]["story"];

const usdFormat = new Intl.NumberFormat("en", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });

export function ReceiptSticky({ story, trigger = "strip", downloadHref }: { story: ReceiptStory; trigger?: "strip" | "button" | "cover"; downloadHref?: string }) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const facts = [
    story.buildHours > 0 ? `${story.buildHours}h` : null,
    story.sessionCount > 0 ? `${story.sessionCount} sessions` : null,
    story.git.commits > 0 ? `${story.git.commits} commits` : null,
    story.models.length > 0 ? `${story.models.length} models` : null,
    story.cost?.totalMicroUsd != null ? usdFormat.format(story.cost.totalMicroUsd / 1_000_000) : null,
  ].filter((fact): fact is string => Boolean(fact));
  const filesNote = receiptFilesTouchedNote(story.git.filesTouched);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {trigger === "cover" ? (
        <div
          className="build-story__cover-receipt"
          role="button"
          tabIndex={0}
          onClick={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setOpen(true);
            }
          }}
          aria-label="View full build receipt"
        >
          <ReceiptCard story={story} inset animate />
        </div>
      ) : trigger === "button" ? (
        <button className="button button--text" type="button" onClick={() => setOpen(true)}>View receipt</button>
      ) : (
        <div className="receipt-sticky">
          <span>AI BUILD RECEIPT</span>
          <p>{facts.join(" · ")}</p>
          <button className="button button--text" type="button" onClick={() => setOpen(true)}>View build receipt</button>
        </div>
      )}
      {open ? (
        <div className="receipt-dialog-backdrop" role="presentation" onClick={() => setOpen(false)}>
          <div className="receipt-dialog receipt-dialog--unfurl" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(event) => event.stopPropagation()}>
            <div className="receipt-dialog__header">
              <strong id={titleId}>AI Build Receipt</strong>
              <div>
                {downloadHref ? <RecapSaveButton href={downloadHref} label="Save receipt" /> : null}
                <button className="button button--text" type="button" onClick={() => setOpen(false)}>Close</button>
              </div>
            </div>
            <ReceiptCard story={story} animate />
            {filesNote ? <p className="receipt-dialog__note">{filesNote}</p> : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
