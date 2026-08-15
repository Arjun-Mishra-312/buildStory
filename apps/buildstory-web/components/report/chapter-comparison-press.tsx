import type { ReportInsightsViewModel } from "@/lib/report/report-insights-view-model";

const relationNote = {
  cumulative: null,
  incremental: "This chapter contains new work since the previous scan; values are not cumulative project deltas.",
  overlapping: "The scan windows overlap, so values describe this chapter rather than a clean cumulative delta.",
} as const;

export function ChapterComparisonPress({ comparison }: { comparison: NonNullable<ReportInsightsViewModel["chapterComparison"]> }) {
  return (
    <section className="chapter-comparison section-wrap" aria-labelledby="chapter-comparison-title">
      <header><span>CHAPTER COMPARISON PRESS</span><h2 id="chapter-comparison-title">What changed since the previous publication?</h2></header>
      <div className="chapter-comparison__spread">
        <article><span>CHAPTER {String(comparison.from).padStart(2, "0")}</span><h3>Previous publication</h3><dl>{comparison.metrics.map((metric) => <div key={metric.id}><dt>{metric.label}</dt><dd>{metric.previous.toLocaleString()}</dd></div>)}</dl></article>
        <i aria-hidden="true">→</i>
        <article className="chapter-comparison__current"><span>CHAPTER {String(comparison.to).padStart(2, "0")}</span><h3>Current publication</h3><dl>{comparison.metrics.map((metric) => <div key={metric.id}><dt>{metric.label}</dt><dd>{metric.current.toLocaleString()} <small>{metric.change > 0 ? "+" : ""}{metric.change.toLocaleString()}</small></dd></div>)}</dl></article>
      </div>
      {relationNote[comparison.relation] ? <p className="chapter-comparison__note">{relationNote[comparison.relation]}</p> : null}
    </section>
  );
}
