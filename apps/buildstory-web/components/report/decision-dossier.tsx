"use client";

import { useState } from "react";
import type { DecisionDossierItem } from "@/lib/report/report-insights-view-model";
import { ReportFigure } from "./report-figure";

export function DecisionDossier({
  items,
  turningPoint,
  activeRefs,
  onSelectRefs,
  onOpenReplay,
}: {
  items: DecisionDossierItem[];
  turningPoint: { quote: string; sourceRefs: string[] } | null;
  activeRefs: string[];
  onSelectRefs: (refs: string[]) => void;
  onOpenReplay?: (eventId: string) => void;
}) {
  const [page, setPage] = useState(0);
  if (!items.length && !turningPoint) return null;
  const pages = [
    ...(turningPoint ? [{ id: "cover", title: "Turning point", rationale: turningPoint.quote, outcome: "The inflection point that frames the decisions that followed.", sourceRefs: turningPoint.sourceRefs, confidence: null, eventIds: [], index: 0 }] : []),
    ...items,
  ];
  const active = new Set(activeRefs);
  return (
    <ReportFigure
      id="decision-dossier"
      index="03"
      title="DECISION DOSSIER"
      question="Which choices changed the build, and why?"
      description="Every decision stays in the document. The pager changes focus without hiding content from assistive technology or print."
      sourceNote="Source: projected decision rationale, outcomes, and validated references. Private confidence reflects citation and event linkage only."
      className="decision-dossier"
    >
      <div className="decision-dossier__viewport" onKeyDown={(event) => {
        if (event.key === "ArrowRight") setPage((current) => Math.min(pages.length - 1, current + 1));
        if (event.key === "ArrowLeft") setPage((current) => Math.max(0, current - 1));
      }} tabIndex={0} aria-label="Decision dossier pages">
        <div className="decision-dossier__pages" style={{ transform: `translateX(-${page * 100}%)` }}>
          {pages.map((item) => {
            const matches = !active.size || item.sourceRefs.some((ref) => active.has(ref));
            return <article key={item.id} className={matches ? "" : "is-dimmed"} aria-hidden={pages[page]?.id !== item.id}>
              <div className="decision-dossier__folio"><span>{item.index ? `DECISION ${String(item.index).padStart(2, "0")}` : "DOSSIER COVER"}</span><h3>{item.title}</h3>{item.confidence ? <small>{item.confidence.toUpperCase()} EVIDENCE CONFIDENCE</small> : null}</div>
              <div className="decision-dossier__copy"><span>RATIONALE</span><p>{item.rationale}</p><span>OUTCOME</span><p>{item.outcome}</p><div className="decision-dossier__sources">{item.sourceRefs.map((ref) => <button type="button" key={ref} onClick={() => onSelectRefs([ref])}>{ref}</button>)}</div>{onOpenReplay && item.eventIds[0] ? <button className="button button--text" type="button" onClick={() => onOpenReplay(item.eventIds[0]!)}>Open cited journey moment →</button> : null}</div>
            </article>;
          })}
        </div>
      </div>
      <nav className="decision-dossier__nav" aria-label="Decision pages"><button type="button" onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={page === 0}>← Previous</button><span>{page + 1} / {pages.length}</span><button type="button" onClick={() => setPage((current) => Math.min(pages.length - 1, current + 1))} disabled={page === pages.length - 1}>Next →</button></nav>
    </ReportFigure>
  );
}
