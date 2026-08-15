import assert from "node:assert/strict";
import test from "node:test";
import { aggregateProfileUsage } from "../lib/usage/aggregate";
import {
  axisTicks,
  buildActivityHeatmap,
  buildMonthlySpend,
  buildWeekdayBars,
  niceAxisMax,
  weekdayMetric,
} from "../lib/usage/charts";
import type { ProfileUsageDay } from "../lib/usage/contracts";
import { USAGE_ACTIVITY_MODEL } from "../lib/usage/fold";

function day(partial: Partial<ProfileUsageDay> & { day: string }): ProfileUsageDay {
  return { sessionCount: 0, models: [], ...partial };
}

test("aggregateProfileUsage keeps Cursor-only activity days for the heatmap", () => {
  const usage = aggregateProfileUsage([
    { day: "2026-08-10", modelKey: USAGE_ACTIVITY_MODEL, modelLabel: "", tokens: 0, costMicroUsd: null, sessionCount: 2 },
    { day: "2026-08-11", modelKey: "alpha", modelLabel: "Alpha", tokens: 100, costMicroUsd: 1_000_000, sessionCount: 0 },
  ], 4, "2026-08-14");
  assert.equal(usage.sessionCount, 2);
  assert.equal(usage.activeDays, 2);
  assert.equal(usage.days.find((item) => item.day === "2026-08-10")?.sessionCount, 2);
  assert.equal(usage.rank, 4);
});

test("activity heatmap is a 53-week Sunday-first grid ending on today", () => {
  const heatmap = buildActivityHeatmap([
    day({ day: "2026-08-14", sessionCount: 4, models: [{ key: "a", label: "A", tokens: 10, spendMicroUsd: 4_000_000 }] }),
    day({ day: "2026-08-07", sessionCount: 1 }),
  ], "2026-08-14");
  assert.equal(heatmap.cells.length, 53 * 7);
  const friday = heatmap.cells.find((cell) => cell?.day === "2026-08-14");
  assert.ok(friday);
  assert.equal(friday?.level, 4);
  const prior = heatmap.cells.find((cell) => cell?.day === "2026-08-07");
  assert.equal(prior?.level, 1);
  assert.ok(heatmap.months.some((month) => month.label === "Aug"));
});

test("weekday bars peak on the highest-spend day and monthly stacks group models", () => {
  const days = [
    day({ day: "2026-06-02", sessionCount: 1, models: [{ key: "a", label: "Alpha", tokens: 10, spendMicroUsd: 444_000_000 }] }), // Tuesday
    day({ day: "2026-07-04", sessionCount: 1, models: [
      { key: "a", label: "Alpha", tokens: 10, spendMicroUsd: 1_000_000_000 },
      { key: "b", label: "Beta", tokens: 10, spendMicroUsd: 897_000_000 },
    ] }),
    day({ day: "2026-08-08", sessionCount: 3, models: [{ key: "a", label: "Alpha", tokens: 10, spendMicroUsd: 1_511_000_000 }] }), // Saturday
  ];
  const weekdays = buildWeekdayBars(days, "spend");
  assert.equal(weekdays.length, 7);
  const peak = weekdays.filter((bar) => bar.peak);
  assert.equal(peak.length, 1);
  assert.equal(peak[0]?.key, "Sat");
  const months = buildMonthlySpend(days, "2026-08-14");
  assert.deepEqual(months.map((month) => month.label), ["Jun", "Jul", "Aug"]);
  assert.equal(months[1]?.segments.length, 2);
  assert.equal(months[2]?.totalMicroUsd, 1_511_000_000);
});

test("weekday metric falls back to sessions when spend is unpublished", () => {
  assert.equal(weekdayMetric({
    spendMicroUsd: null,
    tokens: 0,
    unpricedTokens: 0,
    sessionCount: 3,
    activeDays: 2,
    currentStreak: 0,
    longestStreak: 1,
    lastActiveAt: "2026-08-14",
    topSpendModel: null,
    rank: null,
    days: [],
  }), "sessions");
  assert.equal(niceAxisMax(800), 1000);
});

test("axis ticks use one nice scale so bar height matches the peak label", () => {
  const ticks = axisTicks(774_000_000);
  assert.equal(ticks[ticks.length - 1], 1_000_000_000);
  assert.equal(ticks[0], 0);
});
