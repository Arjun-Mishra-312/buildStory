"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { BuildStoryViewModel } from "@/lib/build-story";

type Session = BuildStoryViewModel["sessions"][number];

export type SessionSummaryDrawerProps = {
  sessions: Session[];
  open: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
};

/**
 * Full session detail lives in a drawer so the private report keeps its
 * above-the-fold summary compact. The trigger owns the open state; this
 * component owns Escape handling and returning focus after close.
 */
export function SessionSummaryDrawer({ sessions, open, onClose, triggerRef }: SessionSummaryDrawerProps) {
  const drawerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusTarget = triggerRef.current;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    drawerRef.current?.querySelector<HTMLElement>("button, a, input, select, textarea")?.focus();
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.setTimeout(() => {
        focusTarget?.focus();
        if (!focusTarget) previouslyFocused?.focus();
      }, 0);
    };
  }, [onClose, open, triggerRef]);

  if (!open) return null;

  return (
    <div
      className="story-pack__evidence-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <aside
        ref={drawerRef}
        className="story-pack__evidence-drawer session-summary-drawer"
        id="session-summary-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-summary-drawer-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="button button--text" type="button" onClick={onClose}>Close</button>
        <span className="story-section__label">SESSION SUMMARY</span>
        <h3 id="session-summary-drawer-title">{sessions.length} captured sessions</h3>
        <p>Every captured build session, including its intent, outcome, and touched areas.</p>
        <div className="session-table">
          {sessions.map((session) => (
            <article key={session.id}>
              <span className="session-table__index">{String(session.index).padStart(2, "0")}</span>
              <span>
                <small>{session.date} · {session.duration}</small>
                <strong>{session.intent}</strong>
                <em>{session.outcome}</em>
              </span>
              <span className="session-table__areas">{session.touchedAreas.slice(0, 2).join(" / ")}</span>
            </article>
          ))}
        </div>
      </aside>
    </div>
  );
}
