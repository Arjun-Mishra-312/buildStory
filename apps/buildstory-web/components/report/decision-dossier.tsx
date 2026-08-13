"use client";

import { useState } from "react";
import type { DecisionDossierItem } from "@/lib/report/report-insights-view-model";
import type { TurningBeat } from "@/lib/report/public-brief";
import { ReportFigure } from "./report-figure";

const beatDate = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" });

export function DecisionDossier({
  items,
  turningPoint,
  turningBeat = null,
  layout = "pager",
  activeRefs,
  onSelectRefs,
  onOpenReplay,
  showSourceCodes = true,
}: {
  items: DecisionDossierItem[];
  turningPoint: { quote: string; sourceRefs: string[] } | null;
  turningBeat?: TurningBeat | null;
  layout?: "pager" | "stack" | "posters";
  activeRefs: string[];
  onSelectRefs: (refs: string[]) => void;
  onOpenReplay?: (eventId: string) => void;
  showSourceCodes?: boolean;
}) {
  const [page, setPage] = useState(0);
  if (!items.length && !turningPoint && !turningBeat) return null;
  const posters = layout === "posters";
  const stacked = layout === "stack";
  const pages = [
    ...(turningPoint && layout === "pager" ? [{ id: "cover", title: "Turning point", rationale: turningPoint.quote, outcome: "The inflection point that frames the decisions that followed.", sourceRefs: turningPoint.sourceRefs, confidence: null, eventIds: [], index: 0 }] : []),
    ...items,
  ];
  const active = new Set(activeRefs);

  if (posters) {
    if (!items.length) return null;
    return (
      <section className="decision-posters" aria-label="Decision dossier">
        <header><span>DECISION DOSSIER</span><strong>{items.length} choice{items.length === 1 ? "" : "s"}</strong></header>
        <div className="decision-posters__grid">
          {items.map((item, index) => {
            const matches = !active.size || item.sourceRefs.some((ref) => active.has(ref));
            return (
              <article key={item.id} className={matches ? "" : "is-dimmed"}>
                {index === 0 && turningBeat?.occurredAt ? <time dateTime={turningBeat.occurredAt}>{beatDate.format(new Date(turningBeat.occurredAt))}</time> : null}
                <span>{`DECISION ${String(item.index).padStart(2, "0")}`}</span>
                <h3>{item.title}</h3>
                <small>Rationale</small>
                <p>{item.rationale}</p>
                <small>Outcome</small>
                <p>{item.outcome}</p>
                {showSourceCodes ? <div className="decision-dossier__sources">{item.sourceRefs.map((ref) => <button type="button" key={ref} onClick={() => onSelectRefs([ref])}>{ref}</button>)}</div> : null}
                {onOpenReplay && item.eventIds[0] ? <button className="button button--text" type="button" onClick={() => onOpenReplay(item.eventIds[0]!)}>Open cited journey moment →</button> : null}
              </article>
            );
          })}
        </div>
      </section>
    );
  }

  return (
    <ReportFigure
      id="decision-dossier"
      index="03"
      title="DECISION DOSSIER"
      question="Which choices changed the build, and why?"
      description="Decision, rationale, outcome, and the evidence that makes the claim traceable."
      sourceNote="Source: projected decision rationale, outcomes, and validated references."
      className={`decision-dossier${stacked ? " decision-dossier--stack" : ""}`}
    >
      <div className="decision-dossier__viewport" onKeyDown={stacked ? undefined : (event) => {
        if (event.key === "ArrowRight") setPage((current) => Math.min(pages.length - 1, current + 1));
        if (event.key === "ArrowLeft") setPage((current) => Math.max(0, current - 1));
      }} tabIndex={stacked ? undefined : 0} aria-label="Decision dossier pages">
        <div className="decision-dossier__pages" style={stacked ? undefined : { transform: `translateX(-${page * 100}%)` }}>
          {pages.map((item) => {
            const matches = !active.size || item.sourceRefs.some((ref) => active.has(ref));
            return <article key={item.id} className={matches ? "" : "is-dimmed"} aria-hidden={stacked ? undefined : pages[page]?.id !== item.id}>
              <div className="decision-dossier__folio"><span>{item.index ? `DECISION ${String(item.index).padStart(2, "0")}` : "DOSSIER COVER"}</span><h3>{item.title}</h3>{item.confidence ? <small>{item.confidence.toUpperCase()} EVIDENCE CONFIDENCE</small> : null}</div>
              <div className="decision-dossier__copy"><span>RATIONALE</span><p>{item.rationale}</p><span>OUTCOME</span><p>{item.outcome}</p>{showSourceCodes ? <div className="decision-dossier__sources">{item.sourceRefs.map((ref) => <button type="button" key={ref} onClick={() => onSelectRefs([ref])}>{ref}</button>)}</div> : null}{onOpenReplay && item.eventIds[0] ? <button className="button button--text" type="button" onClick={() => onOpenReplay(item.eventIds[0]!)}>Open cited journey moment →</button> : null}</div>
            </article>;
          })}
        </div>
      </div>
      {stacked ? null : <nav className="decision-dossier__nav" aria-label="Decision pages"><button type="button" onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={page === 0}>← Previous</button><span>{page + 1} / {pages.length}</span><button type="button" onClick={() => setPage((current) => Math.min(pages.length - 1, current + 1))} disabled={page === pages.length - 1}>Next →</button></nav>}
    </ReportFigure>
  );
}
