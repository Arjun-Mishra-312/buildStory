import type { OutcomeFigure } from "@/lib/report/report-insights-view-model";
import { ReportFigure } from "./report-figure";

export function OutcomeSmallMultiples({ outcomes }: { outcomes: OutcomeFigure[] }) {
  if (!outcomes.length) return null;
  return (
    <ReportFigure
      id="outcome-small-multiples"
      index="05"
      title="OBSERVED OUTCOMES"
      question="Which behaviors accompanied verification and delivery?"
      description="Small multiples keep unlike measures separate while making the observed pattern easy to scan."
      sourceNote="Private source: metadata-only event spine. Descriptive only · no causal claim."
      className="outcome-multiples"
      table={<table><thead><tr><th>Measure</th><th>Value</th><th>Interpretation</th></tr></thead><tbody>{outcomes.map((outcome) => <tr key={outcome.id}><th>{outcome.label}</th><td>{outcome.value}{outcome.unit === "percent" ? "%" : ` ${outcome.unit}`}</td><td>{outcome.detail}</td></tr>)}</tbody></table>}
    >
      <div className="outcome-multiples__grid">{outcomes.map((outcome) => <article key={outcome.id}><span>{outcome.label}</span><strong>{outcome.value}{outcome.unit === "percent" ? "%" : ""}</strong><div aria-hidden="true"><i style={{ width: `${outcome.unit === "percent" ? Math.min(100, outcome.value) : Math.min(100, outcome.value * 12)}%` }} /></div><p>{outcome.detail}</p></article>)}</div>
      <p className="outcome-multiples__caveat">DESCRIPTIVE ONLY · NO CAUSAL CLAIM</p>
    </ReportFigure>
  );
}
