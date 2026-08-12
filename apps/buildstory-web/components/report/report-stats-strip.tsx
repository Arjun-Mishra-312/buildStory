import type { EvidenceMetric } from "@/lib/report/evidence-view-model";

const preferredOrder: EvidenceMetric["id"][] = [
  "activeDays",
  "sessions",
  "commits",
  "linesAdded",
  "models",
  "tokens",
  "cost",
];

export function ReportStatsStrip({ metrics, className = "" }: { metrics: EvidenceMetric[]; className?: string }) {
  if (!metrics.length) return null;
  const ordered = preferredOrder.flatMap((id) => metrics.filter((metric) => metric.id === id));

  return (
    <section className={`report-stats-strip ${className}`.trim()} aria-label="Build statistics">
      {ordered.map((metric) => (
        <div className="report-stats-strip__fact" key={metric.id}>
          <strong>{metric.value}</strong>
          <span>{metric.label}</span>
        </div>
      ))}
    </section>
  );
}
