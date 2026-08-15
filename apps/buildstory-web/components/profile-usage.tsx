"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ProfileUsage } from "@/lib/usage/contracts";
import { formatUsageCount, formatUsageSpend, formatUsageTokens } from "@/lib/usage/format";
import {
  axisTicks,
  buildActivityHeatmap,
  buildMonthlySpend,
  buildWeekdayBars,
  niceAxisMax,
  rankedSpendModels,
  usageModelColor,
  weekdayMetric,
} from "@/lib/usage/charts";
import { utcDay } from "@/lib/usage/fold";

function Heatmap({ usage, today }: { usage: ProfileUsage; today: string }) {
  const heatmap = useMemo(() => buildActivityHeatmap(usage.days, today), [usage.days, today]);
  return (
    <figure className="profile-usage-chart profile-usage-chart--heatmap">
      <figcaption>Activity heatmap</figcaption>
      {usage.activeDays === 0 ? (
        <p className="profile-usage-chart__empty">No scanned activity in this view yet.</p>
      ) : (
        <div className="profile-heatmap" role="img" aria-label="Activity by day over the last year">
          <ol className="profile-heatmap__months" style={{ gridTemplateColumns: `repeat(${heatmap.weeks}, minmax(0, 1fr))` }}>
            {heatmap.months.map((month) => (
              <li key={`${month.label}-${month.weekIndex}`} style={{ gridColumn: month.weekIndex + 1 }}>{month.label}</li>
            ))}
          </ol>
          <div className="profile-heatmap__body">
            <ul className="profile-heatmap__dow" aria-hidden="true">
              <li>Mon</li>
              <li>Wed</li>
              <li>Fri</li>
            </ul>
            <div className="profile-heatmap__grid" style={{ gridTemplateColumns: `repeat(${heatmap.weeks}, minmax(0, 1fr))` }}>
              {heatmap.cells.map((cell, index) => (
                cell ? (
                  <span
                    key={cell.day}
                    className={`profile-heatmap__cell profile-heatmap__cell--${cell.level}`}
                    title={`${cell.day} · ${cell.sessions} session${cell.sessions === 1 ? "" : "s"}${cell.spendMicroUsd > 0 ? ` · ${formatUsageSpend(cell.spendMicroUsd)}` : ""}`}
                  />
                ) : (
                  <span key={`pad-${index}`} className="profile-heatmap__cell profile-heatmap__cell--pad" />
                )
              ))}
            </div>
          </div>
        </div>
      )}
    </figure>
  );
}

function WeekdayChart({ usage }: { usage: ProfileUsage }) {
  const metric = weekdayMetric(usage);
  const bars = useMemo(() => buildWeekdayBars(usage.days, metric), [usage.days, metric]);
  const max = niceAxisMax(Math.max(0, ...bars.map((bar) => bar.value)));
  const ticks = axisTicks(max);
  const format = metric === "spend" ? formatUsageSpend : formatUsageCount;
  const peak = bars.find((bar) => bar.peak);
  return (
    <figure className="profile-usage-chart">
      <figcaption>Most active time</figcaption>
      {max <= 0 || !peak ? (
        <p className="profile-usage-chart__empty">No weekday pattern in this view yet.</p>
      ) : (
        <>
          <div className="profile-bar-chart" role="img" aria-label={`Most active weekday is ${peak.key}`}>
            <div className="profile-bar-chart__axis" aria-hidden="true">
              {ticks.slice().reverse().map((tick) => (
                <span key={tick}>{format(tick)}</span>
              ))}
            </div>
            <div className="profile-bar-chart__plot">
              <div className="profile-bar-chart__rules" aria-hidden="true">
                {ticks.map((tick) => <i key={tick} />)}
              </div>
              <div className="profile-bar-chart__cols">
                {bars.map((bar, index) => (
                  <div key={`${bar.key}-${index}`} className="profile-bar-chart__col" title={`${bar.key} · ${format(bar.value)}`}>
                    <span
                      className={bar.peak ? "is-peak" : undefined}
                      style={{ height: `${Math.max(bar.value > 0 ? 4 : 0, (bar.value / max) * 100)}%` }}
                    />
                    <small>{bar.label}</small>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <p className="profile-usage-chart__hint">
            Peak {peak.key}
            {metric === "spend" ? ` · ${formatUsageSpend(peak.spendMicroUsd)}` : ` · ${formatUsageCount(peak.sessions)} sessions`}
          </p>
        </>
      )}
    </figure>
  );
}

function MonthlySpendChart({ usage, today }: { usage: ProfileUsage; today: string }) {
  const months = useMemo(() => buildMonthlySpend(usage.days, today), [usage.days, today]);
  const ranked = useMemo(() => rankedSpendModels(usage.days), [usage.days]);
  const colorByKey = useMemo(() => new Map(ranked.map((model, index) => [model.key, usageModelColor(index)])), [ranked]);
  const max = niceAxisMax(Math.max(0, ...months.map((month) => month.totalMicroUsd)));
  const ticks = axisTicks(max);
  if (usage.spendMicroUsd == null) {
    return (
      <figure className="profile-usage-chart">
        <figcaption>Monthly spend</figcaption>
        <p className="profile-usage-chart__empty">No priced spend in this view yet.</p>
      </figure>
    );
  }
  return (
    <figure className="profile-usage-chart">
      <figcaption>Monthly spend</figcaption>
      {max <= 0 ? (
        <p className="profile-usage-chart__empty">No priced spend in this view yet.</p>
      ) : (
        <>
          <div className="profile-bar-chart profile-bar-chart--stack" role="img" aria-label="Monthly estimated spend by model">
            <div className="profile-bar-chart__axis" aria-hidden="true">
              {ticks.slice().reverse().map((tick) => (
                <span key={tick}>{formatUsageSpend(tick)}</span>
              ))}
            </div>
            <div className="profile-bar-chart__plot">
              <div className="profile-bar-chart__rules" aria-hidden="true">
                {ticks.map((tick) => <i key={tick} />)}
              </div>
              <div className="profile-bar-chart__cols">
                {months.map((month) => (
                  <div key={month.month} className="profile-bar-chart__col" title={`${month.label} · ${formatUsageSpend(month.totalMicroUsd)}`}>
                    {month.totalMicroUsd > 0 ? <em>{formatUsageSpend(month.totalMicroUsd)}</em> : null}
                    <div className="profile-bar-chart__stack" style={{ height: `${(month.totalMicroUsd / max) * 100}%` }}>
                      {month.segments.map((segment) => (
                        <span
                          key={segment.key}
                          style={{
                            flexGrow: segment.spendMicroUsd,
                            background: colorByKey.get(segment.key) ?? "var(--line)",
                          }}
                        />
                      ))}
                    </div>
                    <small>{month.label}</small>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {ranked.length > 0 ? (
            <ol className="profile-usage-chart__legend">
              {ranked.map((model, index) => (
                <li key={model.key}>
                  <i style={{ background: usageModelColor(index) }} />
                  <span>{model.label}</span>
                  <strong>{formatUsageSpend(model.spendMicroUsd)}</strong>
                </li>
              ))}
            </ol>
          ) : null}
        </>
      )}
    </figure>
  );
}

export function ProfileUsageSection({
  publicUsage,
  privateUsage,
  isOwner,
}: {
  publicUsage: ProfileUsage;
  privateUsage: ProfileUsage | null;
  isOwner: boolean;
}) {
  const [view, setView] = useState<"public" | "private">(isOwner ? "private" : "public");
  const usage = isOwner && view === "private" && privateUsage ? privateUsage : publicUsage;
  const today = utcDay(new Date().toISOString());
  const hasActivity = usage.sessionCount > 0 || usage.tokens > 0 || usage.activeDays > 0;
  const privateDiffers = Boolean(
    isOwner
    && privateUsage
    && (privateUsage.activeDays !== publicUsage.activeDays
      || privateUsage.sessionCount !== publicUsage.sessionCount
      || privateUsage.spendMicroUsd !== publicUsage.spendMicroUsd),
  );
  return (
    <section className="profile-usage" aria-label="Estimated usage">
      <div className="profile-usage__header">
        <span className="section-index">( ESTIMATED USAGE )</span>
        {isOwner ? (
          <div className="view-switcher" role="tablist" aria-label="Usage views">
            <button
              type="button"
              role="tab"
              aria-selected={view === "public"}
              className={view === "public" ? "is-active" : undefined}
              onClick={() => setView("public")}
            >
              <span className="view-status view-status--public" /> Public
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "private"}
              className={view === "private" ? "is-active" : undefined}
              onClick={() => setView("private")}
            >
              <span className="view-status view-status--private" /> Private
            </button>
          </div>
        ) : null}
      </div>
      <p className="profile-usage__note">
        {isOwner && view === "private"
          ? "Private view includes unpublished ready scans. Visitors only see the public view, which is limited to published stories."
          : "Estimated API-equivalent totals from published scans. Cursor sessions can add active days without spend or tokens."}
      </p>
      {isOwner && view === "public" && privateDiffers ? (
        <p className="profile-usage__note">This is the public cut. Switch to private to include unpublished scans.</p>
      ) : null}
      {!hasActivity ? (
        <p className="profile-stories__empty">{view === "private" ? "No ready scan usage yet." : "No published scan usage yet."}</p>
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
          <Heatmap usage={usage} today={today} />
          <div className="profile-usage__charts">
            <WeekdayChart usage={usage} />
            <MonthlySpendChart usage={usage} today={today} />
          </div>
        </>
      )}
    </section>
  );
}
