"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { ProfileUsage } from "@/lib/usage/contracts";
import { formatUsageCount, formatUsageSpend, formatUsageTokens } from "@/lib/usage/format";
import {
  axisTicks,
  buildActivityHeatmap,
  buildHourBars,
  buildMonthlySpend,
  buildWeekdayBars,
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

function MostActiveChart({ usage }: { usage: ProfileUsage }) {
  const metric = weekdayMetric(usage);
  const hourly = Boolean(usage.hours?.some((bucket) => bucket.sessions > 0 || bucket.spendMicroUsd > 0));
  const bars = useMemo(() => {
    if (hourly && usage.hours) {
      return buildHourBars(usage.hours, metric).map((bar) => ({ ...bar, key: `${bar.label}:00` }));
    }
    return buildWeekdayBars(usage.days, metric);
  }, [hourly, metric, usage.days, usage.hours]);
  const rawMax = Math.max(0, ...bars.map((bar) => bar.value));
  const ticks = axisTicks(rawMax);
  const top = ticks[ticks.length - 1] ?? 1;
  const format = metric === "spend" ? formatUsageSpend : formatUsageCount;
  const peak = bars.find((bar) => bar.peak);
  return (
    <figure className="profile-usage-chart">
      <figcaption>Most active time</figcaption>
      {rawMax <= 0 || !peak ? (
        <p className="profile-usage-chart__empty">No activity pattern in this view yet.</p>
      ) : (
        <>
          <div
            className={`profile-bar-chart${hourly ? " profile-bar-chart--hours" : ""}`}
            role="img"
            aria-label={`Most active ${hourly ? "hour" : "weekday"} is ${peak.key}`}
          >
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
                  <div key={`${bar.key}-${index}`} className="profile-bar-chart__col" title={`${hourly ? `${bar.label}:00 UTC` : bar.key} · ${format(bar.value)}`}>
                    <div className="profile-bar-chart__value">
                      <span
                        className={bar.peak ? "is-peak" : undefined}
                        style={{ height: `${Math.max(bar.value > 0 ? 4 : 0, (bar.value / top) * 100)}%` }}
                      />
                    </div>
                    {hourly ? (index % 6 === 0 ? <small>{bar.label}</small> : <small aria-hidden="true">&nbsp;</small>) : <small>{bar.label}</small>}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <p className="profile-usage-chart__hint">
            Peak {hourly ? `${peak.label}:00 UTC` : peak.key}
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
  const ticks = axisTicks(Math.max(0, ...months.map((month) => month.totalMicroUsd)));
  const top = ticks[ticks.length - 1] ?? 1;
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
      {top <= 0 ? (
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
                    <div className="profile-bar-chart__value">
                      {month.totalMicroUsd > 0 ? <em>{formatUsageSpend(month.totalMicroUsd)}</em> : null}
                      <div className="profile-bar-chart__stack" style={{ height: `${(month.totalMicroUsd / top) * 100}%` }}>
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

export function ProfileUsageSection({ usage }: { usage: ProfileUsage }) {
  const today = utcDay(new Date().toISOString());
  const hasActivity = usage.sessionCount > 0 || usage.tokens > 0 || usage.activeDays > 0;
  return (
    <section className="profile-usage" aria-label="Estimated usage">
      <div className="profile-usage__header">
        <span className="section-index">( ESTIMATED USAGE )</span>
      </div>
      <p className="profile-usage__note">
        Estimated API-equivalent totals from published stories plus any scans still awaiting publish.
      </p>
      {!hasActivity ? (
        <p className="profile-stories__empty">No scan usage yet.</p>
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
            <MostActiveChart usage={usage} />
            <MonthlySpendChart usage={usage} today={today} />
          </div>
        </>
      )}
    </section>
  );
}
