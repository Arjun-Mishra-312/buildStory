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
}) {
  const descriptionId = `${id}-description`;
  return (
    <figure className={`report-figure ${className}`.trim()} aria-labelledby={`${id}-title`} aria-describedby={descriptionId}>
      <figcaption>
        <span>{index} / {title}</span>
        <h2 id={`${id}-title`}>{question}</h2>
        <p id={descriptionId}>{description}</p>
      </figcaption>
      <div className="report-figure__canvas">{children}</div>
      {table ? <details className="report-figure__data"><summary>View figure data</summary>{table}</details> : null}
      <footer>{sourceNote}</footer>
    </figure>
  );
}
