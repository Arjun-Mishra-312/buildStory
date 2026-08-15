import type { ProfileUsage, ProfileUsageDay } from "./contracts";

const DAY_MS = 86_400_000;
const WEEKDAY_KEYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const WEEKDAY_SHORT = ["S", "M", "T", "W", "T", "F", "S"] as const;
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export const USAGE_MODEL_COLORS = ["#2447d8", "#f36f56", "#2f7250", "#d59a3e", "#3d4a9c", "#dce3ff", "#387a56", "#b37825"];

export function usageModelColor(index: number) {
  return USAGE_MODEL_COLORS[index % USAGE_MODEL_COLORS.length]!;
}

export type HeatmapCell = {
  day: string;
  level: 0 | 1 | 2 | 3 | 4;
  sessions: number;
  spendMicroUsd: number;
};

export type HeatmapMonthLabel = { label: string; weekIndex: number };

export type ActivityHeatmap = {
  cells: Array<HeatmapCell | null>;
  weeks: number;
  months: HeatmapMonthLabel[];
};

export type WeekdaySpendBar = {
  key: (typeof WEEKDAY_KEYS)[number];
  label: (typeof WEEKDAY_SHORT)[number];
  spendMicroUsd: number;
  sessions: number;
  value: number;
  peak: boolean;
};

export type MonthlySpendSegment = {
  key: string;
  label: string;
  spendMicroUsd: number;
};

export type MonthlySpendBar = {
  month: string;
  label: string;
  totalMicroUsd: number;
  segments: MonthlySpendSegment[];
};

function parseDay(day: string): number {
  return Date.parse(`${day}T12:00:00.000Z`);
}

function daySpend(day: ProfileUsageDay): number {
  return day.models.reduce((sum, model) => sum + Math.max(0, model.spendMicroUsd ?? 0), 0);
}

function dayWeight(day: ProfileUsageDay): number {
  const spend = daySpend(day);
  if (spend > 0) return spend;
  if (day.sessionCount > 0) return day.sessionCount;
  return day.models.reduce((sum, model) => sum + Math.max(0, model.tokens), 0) > 0 ? 1 : 0;
}

function heatLevel(value: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (value <= 0 || max <= 0) return 0;
  const ratio = value / max;
  if (ratio < 0.25) return 1;
  if (ratio < 0.5) return 2;
  if (ratio < 0.75) return 3;
  return 4;
}

export function niceAxisMax(value: number): number {
  if (value <= 0) return 1;
  const padded = value * 1.12;
  const magnitude = 10 ** Math.floor(Math.log10(padded));
  const normalized = padded / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

export function axisTicks(max: number, count = 5): number[] {
  const top = niceAxisMax(max);
  return Array.from({ length: count }, (_, index) => (top * index) / (count - 1));
}

/** GitHub-style last-53-weeks grid, Sunday-first, ending on `today`. */
export function buildActivityHeatmap(days: ProfileUsageDay[], today: string): ActivityHeatmap {
  const byDay = new Map(days.map((day) => [day.day, day]));
  const end = parseDay(today);
  const endDate = new Date(end);
  const weekday = endDate.getUTCDay();
  const gridEnd = end + (6 - weekday) * DAY_MS;
  const weeks = 53;
  const cells: Array<HeatmapCell | null> = [];
  const start = gridEnd - (weeks * 7 - 1) * DAY_MS;
  let max = 0;
  const weights: Array<{ day: string; inRange: boolean; weight: number; sessions: number; spend: number }> = [];
  for (let index = 0; index < weeks * 7; index += 1) {
    const time = start + index * DAY_MS;
    const key = new Date(time).toISOString().slice(0, 10);
    const inRange = time <= end;
    const day = byDay.get(key);
    const weight = day && inRange ? dayWeight(day) : 0;
    max = Math.max(max, weight);
    weights.push({
      day: key,
      inRange,
      weight,
      sessions: day?.sessionCount ?? 0,
      spend: day ? daySpend(day) : 0,
    });
  }
  for (const cell of weights) {
    if (!cell.inRange) {
      cells.push(null);
      continue;
    }
    cells.push({
      day: cell.day,
      level: heatLevel(cell.weight, max),
      sessions: cell.sessions,
      spendMicroUsd: cell.spend,
    });
  }
  const months: HeatmapMonthLabel[] = [];
  for (let week = 0; week < weeks; week += 1) {
    const first = cells[week * 7];
    if (!first) continue;
    const month = Number(first.day.slice(5, 7));
    const prev = week === 0 ? null : cells[(week - 1) * 7];
    const prevMonth = prev ? Number(prev.day.slice(5, 7)) : null;
    if (prevMonth !== month) months.push({ label: MONTH_SHORT[month - 1]!, weekIndex: week });
  }
  return { cells, weeks, months };
}

export function buildWeekdayBars(days: ProfileUsageDay[], metric: "spend" | "sessions" = "spend"): WeekdaySpendBar[] {
  const spend = Array.from({ length: 7 }, () => 0);
  const sessions = Array.from({ length: 7 }, () => 0);
  for (const day of days) {
    const weekday = new Date(parseDay(day.day)).getUTCDay();
    spend[weekday] += daySpend(day);
    sessions[weekday] += day.sessionCount;
  }
  const values = metric === "spend" ? spend : sessions;
  const peakValue = Math.max(...values);
  const peakIndex = values.findIndex((value) => value === peakValue);
  return WEEKDAY_KEYS.map((key, index) => ({
    key,
    label: WEEKDAY_SHORT[index]!,
    spendMicroUsd: spend[index]!,
    sessions: sessions[index]!,
    value: values[index]!,
    peak: peakValue > 0 && index === peakIndex,
  }));
}

export function buildMonthlySpend(days: ProfileUsageDay[], throughDay: string): MonthlySpendBar[] {
  const priced = days.filter((day) => daySpend(day) > 0);
  if (priced.length === 0) return [];
  const first = priced[0]!.day.slice(0, 7);
  const last = [priced[priced.length - 1]!.day.slice(0, 7), throughDay.slice(0, 7)].sort()[1]!;
  const months: string[] = [];
  for (let cursor = first; cursor <= last; ) {
    months.push(cursor);
    const year = Number(cursor.slice(0, 4));
    const month = Number(cursor.slice(5, 7));
    const next = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
    cursor = next;
  }
  const totals = new Map<string, Map<string, MonthlySpendSegment>>();
  for (const month of months) totals.set(month, new Map());
  for (const day of priced) {
    const month = day.day.slice(0, 7);
    const bucket = totals.get(month);
    if (!bucket) continue;
    for (const model of day.models) {
      const spend = Math.max(0, model.spendMicroUsd ?? 0);
      if (spend <= 0) continue;
      const existing = bucket.get(model.key) ?? { key: model.key, label: model.label, spendMicroUsd: 0 };
      existing.spendMicroUsd += spend;
      bucket.set(model.key, existing);
    }
  }
  return months.map((month) => {
    const segments = Array.from(totals.get(month)?.values() ?? []).sort((left, right) => right.spendMicroUsd - left.spendMicroUsd);
    return {
      month,
      label: MONTH_SHORT[Number(month.slice(5, 7)) - 1]!,
      totalMicroUsd: segments.reduce((sum, segment) => sum + segment.spendMicroUsd, 0),
      segments,
    };
  });
}

export function rankedSpendModels(days: ProfileUsageDay[], limit = 10): MonthlySpendSegment[] {
  const totals = new Map<string, MonthlySpendSegment>();
  for (const day of days) {
    for (const model of day.models) {
      const spend = Math.max(0, model.spendMicroUsd ?? 0);
      if (spend <= 0) continue;
      const existing = totals.get(model.key) ?? { key: model.key, label: model.label, spendMicroUsd: 0 };
      existing.spendMicroUsd += spend;
      totals.set(model.key, existing);
    }
  }
  return Array.from(totals.values()).sort((left, right) => right.spendMicroUsd - left.spendMicroUsd).slice(0, limit);
}

export function weekdayMetric(usage: ProfileUsage): "spend" | "sessions" {
  return usage.spendMicroUsd != null && usage.spendMicroUsd > 0 ? "spend" : "sessions";
}
