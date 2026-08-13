"use client";

import type { ReactNode } from "react";
import type { PartialTheme } from "@nivo/theming";

export const buildstoryNivoTheme: PartialTheme = {
  background: "transparent",
  text: { fill: "var(--ink)", fontFamily: "var(--font-code)", fontSize: 10 },
  axis: {
    domain: { line: { stroke: "var(--line-strong)", strokeWidth: 1 } },
    ticks: {
      line: { stroke: "var(--line-strong)", strokeWidth: 1 },
      text: { fill: "var(--muted)", fontFamily: "var(--font-code)", fontSize: 9 },
    },
    legend: { text: { fill: "var(--ink)", fontFamily: "var(--font-code)", fontSize: 9 } },
  },
  grid: { line: { stroke: "var(--line)", strokeWidth: 1 } },
  labels: { text: { fill: "var(--ink)", fontFamily: "var(--font-code)", fontSize: 10 } },
  tooltip: {
    container: {
      background: "var(--surface-strong)",
      color: "var(--ink)",
      border: "1px solid var(--line-strong)",
      borderRadius: 0,
      boxShadow: "var(--shadow)",
      fontFamily: "var(--font-code)",
      fontSize: 11,
    },
  },
};

export function ReportFigure({
  id,
  index,
  title,
  question,
  description,
  sourceNote,
  children,
  table,
  className = "",
  chrome = true,
}: {
  id: string;
  index: string;
  title: string;
  question: string;
  description: string;
  sourceNote: string;
  children: ReactNode;
  table?: ReactNode;
  className?: string;
  chrome?: boolean;
}) {
  const descriptionId = `${id}-description`;
  return (
    <figure className={`report-figure${chrome ? "" : " report-figure--bare"} ${className}`.trim()} aria-labelledby={`${id}-title`} aria-describedby={chrome ? descriptionId : undefined} aria-label={chrome ? undefined : title}>
      {chrome ? (
        <figcaption>
          <span>{index} / {title}</span>
          <h2 id={`${id}-title`}>{question}</h2>
          <p id={descriptionId}>{description}</p>
        </figcaption>
      ) : <h2 id={`${id}-title`} className="sr-only">{title}</h2>}
      <div className="report-figure__canvas">{children}</div>
      {chrome && table ? <details className="report-figure__data"><summary>View figure data</summary>{table}</details> : null}
      {chrome ? <footer>{sourceNote}</footer> : null}
    </figure>
  );
}
