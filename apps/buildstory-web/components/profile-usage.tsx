import Link from "next/link";
import type { ProfileUsage } from "@/lib/usage/contracts";
import { formatUsageCount, formatUsageSpend, formatUsageTokens } from "@/lib/usage/format";

const SEGMENT_COLORS = ["#2447d8", "#f36f56", "#2f7250", "#d59a3e", "#3d4a9c", "#dce3ff", "#387a56", "#b37825"];

function modelColor(index: number) {
  return SEGMENT_COLORS[index % SEGMENT_COLORS.length]!;
}

function fillDays(days: ProfileUsage["days"]) {
  if (days.length === 0) return [];
  const byDay = new Map(days.map((day) => [day.day, day]));
  const start = Date.parse(`${days[0]!.day}T12:00:00.000Z`);
  const end = Date.parse(`${days[days.length - 1]!.day}T12:00:00.000Z`);
  const filled: ProfileUsage["days"] = [];
  for (let time = start; time <= end; time += 86_400_000) {
    const key = new Date(time).toISOString().slice(0, 10);
    filled.push(byDay.get(key) ?? { day: key, models: [] });
  }
  return filled;
}

function StackedChart({
  title,
  days,
  valueOf,
  formatValue,
  unit,
}: {
  title: string;
  days: ProfileUsage["days"];
  valueOf: (spend: number | null, tokens: number) => number;
  formatValue: (value: number) => string;
  unit: string;
}) {
  const series = fillDays(days);
  const totals = new Map<string, { label: string; value: number }>();
  let max = 0;
  for (const day of series) {
    let dayTotal = 0;
    for (const model of day.models) {
      const value = valueOf(model.spendMicroUsd, model.tokens);
      if (value <= 0) continue;
      dayTotal += value;
      const existing = totals.get(model.key) ?? { label: model.label, value: 0 };
      existing.value += value;
      totals.set(model.key, existing);
    }
    max = Math.max(max, dayTotal);
  }
  const ranked = Array.from(totals.entries())
    .sort((left, right) => right[1].value - left[1].value)
    .slice(0, 10);
  const colorByKey = new Map(ranked.map(([key], index) => [key, modelColor(index)]));
  const grand = ranked.reduce((sum, [, item]) => sum + item.value, 0);
  if (series.length === 0 || max <= 0) {
    return (
      <figure className="profile-usage-chart">
        <figcaption>{title}</figcaption>
        <p className="profile-usage-chart__empty">No priced {unit} in published scans yet.</p>
      </figure>
    );
  }
  return (
    <figure className="profile-usage-chart">
      <figcaption>{title}</figcaption>
      <div className="profile-usage-chart__plot" role="img" aria-label={`${title} by model`}>
        {series.map((day) => {
          const dayTotal = day.models.reduce((sum, model) => sum + Math.max(0, valueOf(model.spendMicroUsd, model.tokens)), 0);
          return (
            <div key={day.day} className="profile-usage-chart__col" title={`${day.day} · ${formatValue(dayTotal)}`}>
              {day.models
                .filter((model) => valueOf(model.spendMicroUsd, model.tokens) > 0)
                .map((model) => (
                  <span
                    key={model.key}
                    style={{
                      flexGrow: valueOf(model.spendMicroUsd, model.tokens),
                      background: colorByKey.get(model.key) ?? "var(--line)",
                    }}
                  />
                ))}
              <i style={{ flexGrow: Math.max(0, max - dayTotal) }} />
            </div>
          );
        })}
      </div>
      <ol className="profile-usage-chart__legend">
        {ranked.map(([key, item], index) => (
          <li key={key}>
            <i style={{ background: modelColor(index) }} />
            <span>{index + 1}. {item.label}</span>
            <strong>{grand > 0 ? `${Math.round((item.value * 1000) / grand) / 10}%` : "0%"}</strong>
          </li>
        ))}
      </ol>
    </figure>
  );
}

export function ProfileUsageSection({ usage }: { usage: ProfileUsage }) {
  const hasActivity = usage.sessionCount > 0 || usage.tokens > 0 || usage.activeDays > 0;
  return (
    <section className="profile-usage" aria-label="Estimated usage">
      <span className="section-index">( ESTIMATED USAGE )</span>
      <p className="profile-usage__note">
        Estimated API-equivalent totals from published scans. Cursor sessions can add active days without spend or tokens.
      </p>
      {!hasActivity ? (
        <p className="profile-stories__empty">No published scan usage yet.</p>
      ) : (
        <>
          <dl className="profile-usage__kpis">
            <div><dt>Total spend</dt><dd>{formatUsageSpend(usage.spendMicroUsd)}</dd></div>
            <div><dt>Total tokens</dt><dd>{formatUsageTokens(usage.tokens)}</dd></div>
            <div><dt>Sessions</dt><dd>{formatUsageCount(usage.sessionCount)}</dd></div>
            <div><dt>Top spend model</dt><dd>{usage.topSpendModel?.label ?? "—"}</dd></div>
            <div><dt>Current streak</dt><dd>{usage.currentStreak}</dd></div>
            <div><dt>Longest streak</dt><dd>{usage.longestStreak}</dd></div>
            <div><dt>Active days</dt><dd>{usage.activeDays}</dd></div>
            <div>
              <dt>Leaderboard rank</dt>
              <dd>{usage.rank != null ? <Link href="/leaderboard?metric=spend&period=all-time">#{usage.rank}</Link> : "—"}</dd>
            </div>
          </dl>
          {usage.unpricedTokens > 0 ? (
            <p className="profile-usage__note">{formatUsageTokens(usage.unpricedTokens)} tokens could not be priced from the current rate card.</p>
          ) : null}
          <div className="profile-usage__charts">
            <StackedChart
              title="Daily spend"
              days={usage.days}
              valueOf={(spend) => spend ?? 0}
              formatValue={(value) => formatUsageSpend(value)}
              unit="spend"
            />
            <StackedChart
              title="Daily tokens"
              days={usage.days}
              valueOf={(_spend, tokens) => tokens}
              formatValue={formatUsageTokens}
              unit="tokens"
            />
          </div>
        </>
      )}
    </section>
  );
}
