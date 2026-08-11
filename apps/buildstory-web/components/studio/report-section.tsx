"use client";

import { useId, type CSSProperties, type ReactNode } from "react";

export type ReportSectionProps = {
  /** Stable key used by report-layout-prefs for persistence; purely presentational here. */
  id?: string;
  index?: string;
  label: ReactNode;
  /** Right-aligned header content shown whether the section is open or closed (e.g. a cost total). */
  meta?: ReactNode;
  /** One-line digest shown only while collapsed. */
  summary?: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "card" matches .report-card chrome (border + surface); "inline" nests inside one with no border. */
  variant?: "card" | "inline";
  /** Extra class(es) on the root <section> - e.g. a legacy `.report-card--*` modifier that still keys layout CSS (grid columns, background) for that card. */
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
};

/**
 * Collapsible report section. Mirrors the aria-expanded/aria-controls pattern
 * already used by ProjectStackCard - a plain button toggle, no <details>, so
 * open state can be driven by persisted prefs. Unmounts its panel when
 * closed: safe here because no section owns state that outlives it (boundary
 * checkboxes live in the parent's selectedFields, StoryPackView's openRef
 * lives above these sections).
 */
export function ReportSection({
  id,
  index,
  label,
  meta,
  summary,
  open,
  onOpenChange,
  variant = "card",
  className,
  style,
  children,
}: ReportSectionProps) {
  const panelId = `${useId()}-report-section`;
  return (
    <section
      className={[`report-section report-section--${variant}`, open ? "report-section--open" : "", className ?? ""]
        .filter(Boolean)
        .join(" ")}
      style={style}
      data-report-section={id}
    >
      <button
        type="button"
        className="report-section__toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => onOpenChange(!open)}
      >
        <span className="report-section__heading">
          {index ? <span className="report-section__index">{index}</span> : null}
          <span className="report-section__label">{label}</span>
        </span>
        {!open && summary ? <span className="report-section__summary">{summary}</span> : null}
        <span className="report-section__end">
          {meta ? <span className="report-section__meta">{meta}</span> : null}
          <span className="report-section__chevron" aria-hidden="true">▾</span>
        </span>
      </button>
      {open ? (
        <div className="report-section__panel" id={panelId}>
          {children}
        </div>
      ) : null}
    </section>
  );
}
