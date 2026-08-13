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

export function ReportStatsStrip({
  metrics,
  className = "",
  variant = "grid",
  hideNotes = false,
}: {
  metrics: EvidenceMetric[];
  className?: string;
  variant?: "grid" | "line";
  hideNotes?: boolean;
}) {
  if (!metrics.length) return null;
  const ordered = preferredOrder.flatMap((id) => metrics.filter((metric) => metric.id === id));

  if (variant === "line") {
    const notes = hideNotes ? [] : ordered
      .filter((metric) => (metric.id === "cost" || metric.id === "tokens") && metric.note)
      .slice(0, 2)
      .map((metric) => metric.note);
    return (
      <section className={`report-stats-strip report-stats-strip--line ${className}`.trim()} aria-label="Build statistics">
        <p>{ordered.map((metric) => `${metric.value} ${metric.label}`).join(" · ")}</p>
        {notes.length ? <small>{notes.join(" ")}</small> : null}
      </section>
    );
  }

  return (
    <section className={`report-stats-strip ${className}`.trim()} aria-label="Build statistics">
      {ordered.map((metric) => (
        <div className={`report-stats-strip__fact${!hideNotes && metric.note ? " report-stats-strip__fact--noted" : ""}`} key={metric.id}>
          <strong>{metric.value}</strong>
          <span>{metric.label}</span>
          {!hideNotes && metric.note ? <p>{metric.note}</p> : null}
        </div>
      ))}
    </section>
  );
}
