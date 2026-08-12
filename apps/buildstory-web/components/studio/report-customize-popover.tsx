"use client";

import { Eye, EyeOff, Pin, PinOff, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ReportLayoutPrefs, ReportSectionKey } from "@/lib/studio/report-layout-prefs";

export type ReportCustomizeItem = {
  key: ReportSectionKey;
  label: string;
  description: string;
};

export type ReportCustomizePopoverProps = {
  items: ReportCustomizeItem[];
  prefs: ReportLayoutPrefs;
  onToggleHidden: (key: ReportSectionKey) => void;
  onTogglePinned: (key: ReportSectionKey) => void;
  onReset: () => void;
};

/** Small, keyboard-trapped layout editor for the private report masthead. */
export function ReportCustomizePopover({ items, prefs, onToggleHidden, onTogglePinned, onReset }: ReportCustomizePopoverProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const titleId = "report-customize-title";
  const panelId = "report-customize-panel";

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (event.key !== "Tab" || !popoverRef.current) return;
      const focusable = [...popoverRef.current.querySelectorAll<HTMLElement>("button, input, a, select, textarea")]
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
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    window.setTimeout(() => popoverRef.current?.querySelector<HTMLElement>("button")?.focus(), 0);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    <div className="report-customize" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="button button--secondary report-customize__trigger"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <SlidersHorizontal size={16} strokeWidth={1.8} aria-hidden="true" />
        Arrange recap
      </button>
      {open ? (
        <div className="report-customize__popover" id={panelId} ref={popoverRef} role="dialog" aria-modal="false" aria-labelledby={titleId}>
          <header>
            <div>
              <span className="section-index">PRIVATE RECAP</span>
              <h2 id={titleId}>Arrange your recap</h2>
            </div>
            <button type="button" className="button button--text report-customize__close" aria-label="Close report customization" onClick={() => { setOpen(false); triggerRef.current?.focus(); }}>
              <X size={17} strokeWidth={1.8} aria-hidden="true" />
            </button>
          </header>
          <p>Keep the moments that matter close. This changes your private view only; public choices live in What readers will see.</p>
          <ul>
            {items.map((item) => {
              const hidden = prefs.hidden.includes(item.key);
              const pinned = prefs.pinned.includes(item.key);
              return (
                <li key={item.key}>
                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.description}</small>
                  </span>
                  <span className="report-customize__item-actions">
                    <button
                      type="button"
                      className={hidden ? "is-active" : undefined}
                      aria-pressed={hidden}
                      aria-label={`${hidden ? "Show" : "Hide"} ${item.label}`}
                      title={`${hidden ? "Show" : "Hide"} ${item.label}`}
                      onClick={() => onToggleHidden(item.key)}
                    >
                      {hidden ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                    </button>
                    <button
                      type="button"
                      className={pinned ? "is-active" : undefined}
                      aria-pressed={pinned}
                      aria-label={`${pinned ? "Unpin" : "Pin"} ${item.label}`}
                      title={`${pinned ? "Unpin" : "Pin"} ${item.label}`}
                      onClick={() => onTogglePinned(item.key)}
                    >
                      {pinned ? <PinOff size={16} aria-hidden="true" /> : <Pin size={16} aria-hidden="true" />}
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
          <button type="button" className="button button--text report-customize__reset" onClick={onReset}>
            <RotateCcw size={15} strokeWidth={1.8} aria-hidden="true" />
            Reset layout
          </button>
        </div>
      ) : null}
    </div>
  );
}
