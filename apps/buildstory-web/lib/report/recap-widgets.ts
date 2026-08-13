import { resolveModelBrand } from "../brands/model-mark";
import { featuredSignals, formatSignalUnit, formatSignalValue, illustrationForSignal } from "./poster-art";
import type { RecapContext } from "./recap";

export const RECAP_LAYOUTS = ["copy", "stat-grid", "ranked", "hour-bars", "weekday", "streak"] as const;
export type RecapLayout = (typeof RECAP_LAYOUTS)[number];

export type RecapStatTile = { value: string; label: string };
export type RecapRankedItem = {
  rank: number;
  title: string;
  subtitle: string;
  value: string;
  visual?: string;
  markSrc?: string;
};
export type RecapBar = {
  key: string;
  label: string;
  count: number;
  share: number;
  peak?: boolean;
};
export type RecapStreakRange = {
  days: number;
  start: string;
  end: string;
  label: string;
};

export type RecapWidget =
  | { type: "stat-grid"; tiles: RecapStatTile[] }
  | { type: "ranked"; items: RecapRankedItem[] }
  | { type: "hour-bars"; bars: RecapBar[]; peakLabel: string; sparse: boolean }
  | { type: "weekday"; bars: RecapBar[] }
  | { type: "streak"; others: RecapStreakRange[] };

export type RecapWidgets = {
  statGrid: Extract<RecapWidget, { type: "stat-grid" }> | null;
  ranked: Extract<RecapWidget, { type: "ranked" }> | null;
  hourBars: Extract<RecapWidget, { type: "hour-bars" }> | null;
  weekday: Extract<RecapWidget, { type: "weekday" }> | null;
  streak: RecapStreakRange | null;
  streakOthers: RecapStreakRange[];
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const usdFormat = new Intl.NumberFormat("en", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const intFormat = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });
const rangeFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function isRecapLayout(value: unknown): value is RecapLayout {
  return typeof value === "string" && (RECAP_LAYOUTS as readonly string[]).includes(value);
}

export function formatRecapHours(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return "0";
  const rounded = Math.round(hours * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function formatUsd(microUsd: number): string {
  return usdFormat.format(microUsd / 1_000_000);
}

function localHour(timestamp: string, utcOffsetMinutes: number): number {
  const utcMillis = Date.parse(timestamp);
  if (!Number.isFinite(utcMillis)) return 0;
  return new Date(utcMillis + utcOffsetMinutes * 60_000).getUTCHours();
}

function localDayKey(timestamp: string, utcOffsetMinutes: number): string {
  const utcMillis = Date.parse(timestamp);
  if (!Number.isFinite(utcMillis)) return timestamp.slice(0, 10);
  return new Date(utcMillis + utcOffsetMinutes * 60_000).toISOString().slice(0, 10);
}

function localWeekday(timestamp: string, utcOffsetMinutes: number): number {
  const utcMillis = Date.parse(timestamp);
  if (!Number.isFinite(utcMillis)) return 0;
  return new Date(utcMillis + utcOffsetMinutes * 60_000).getUTCDay();
}

function formatDayRange(start: string, end: string): string {
  const from = Date.parse(`${start}T12:00:00.000Z`);
  const to = Date.parse(`${end}T12:00:00.000Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return `${start} — ${end}`;
  return `${rangeFormat.format(new Date(from))} — ${rangeFormat.format(new Date(to))}`;
}

function nextDayKey(key: string): string {
  const ms = Date.parse(`${key}T12:00:00.000Z`);
  if (!Number.isFinite(ms)) return key;
  return new Date(ms + 86_400_000).toISOString().slice(0, 10);
}

function consecutiveRuns(days: string[]): RecapStreakRange[] {
  if (days.length === 0) return [];
  const runs: RecapStreakRange[] = [];
  let start = days[0]!;
  let prev = days[0]!;
  const flush = () => {
    const daysCount = Math.round((Date.parse(`${prev}T12:00:00.000Z`) - Date.parse(`${start}T12:00:00.000Z`)) / 86_400_000) + 1;
    if (daysCount >= 2) {
      runs.push({
        days: daysCount,
        start,
        end: prev,
        label: formatDayRange(start, prev),
      });
    }
  };
  for (let index = 1; index < days.length; index += 1) {
    const current = days[index]!;
    if (current === nextDayKey(prev)) {
      prev = current;
      continue;
    }
    flush();
    start = current;
    prev = current;
  }
  flush();
  return runs.sort((left, right) => right.days - left.days || left.start.localeCompare(right.start));
}

function shareOf(count: number, max: number): number {
  if (max <= 0 || count <= 0) return 0;
  return count / max;
}

function statGridFrom(context: RecapContext): Extract<RecapWidget, { type: "stat-grid" }> | null {
  const tiles: RecapStatTile[] = [];
  const hoursHero = context.buildHours > 0;
  if (hoursHero && context.sessionCount > 0) {
    tiles.push({
      value: intFormat.format(context.sessionCount),
      label: context.sessionCount === 1 ? "session" : "sessions",
    });
  } else if (!hoursHero && context.activeDays > 0) {
    tiles.push({
      value: intFormat.format(context.activeDays),
      label: context.activeDays === 1 ? "active day" : "active days",
    });
  }
  if (context.activeDays > 0 && hoursHero) {
    tiles.push({
      value: intFormat.format(context.activeDays),
      label: context.activeDays === 1 ? "active day" : "active days",
    });
  }
  if (context.commits > 0) {
    tiles.push({
      value: intFormat.format(context.commits),
      label: context.commits === 1 ? "commit" : "commits",
    });
  }
  const files = context.filesTouched ?? 0;
  const cost = context.costMicroUsd;
  if (files > 0 && tiles.length < 4) {
    tiles.push({
      value: intFormat.format(files),
      label: "files touched",
    });
  } else if (cost && cost > 0 && tiles.length < 4) {
    tiles.push({
      value: formatUsd(cost),
      label: "est. API spend",
    });
  }
  if (cost && cost > 0 && files > 0 && tiles.length < 4) {
    tiles.push({
      value: formatUsd(cost),
      label: "est. API spend",
    });
  }
  if (tiles.length < 2) return null;
  return { type: "stat-grid", tiles: tiles.slice(0, 4) };
}

function rankedFrom(context: RecapContext): Extract<RecapWidget, { type: "ranked" }> | null {
  const models = [...(context.models ?? [])]
    .filter((model) => model.requests > 0)
    .sort((left, right) => right.requests - left.requests || left.label.localeCompare(right.label))
    .slice(0, 5);
  if (models.length >= 2) {
    return {
      type: "ranked",
      items: models.map((model, index) => ({
        rank: index + 1,
        title: model.label,
        subtitle: model.share != null ? `${model.share}% of spend` : `${intFormat.format(model.requests)} calls`,
        value: intFormat.format(model.requests),
        markSrc: resolveModelBrand(model)?.src,
      })),
    };
  }
  const signals = featuredSignals(context.signals ?? context.pack?.signals ?? [], 5);
  if (signals.length < 2) return null;
  return {
    type: "ranked",
    items: signals.map((signal, index) => ({
      rank: index + 1,
      title: signal.headline.replace(/^\d[\d.,%]*\s*/, "").trim() || signal.headline,
      subtitle: formatSignalUnit(signal) || signal.family,
      value: formatSignalValue(signal),
      visual: illustrationForSignal(signal),
    })),
  };
}

function hourBarsFrom(context: RecapContext): Extract<RecapWidget, { type: "hour-bars" }> | null {
  const offset = context.utcOffsetMinutes ?? 0;
  const sessions = context.sessions ?? [];
  const counts = Array.from({ length: 24 }, () => 0);
  if (sessions.length > 0) {
    for (const session of sessions) {
      const hour = localHour(session.startedAt, offset);
      counts[hour] = (counts[hour] ?? 0) + 1;
    }
    const max = Math.max(...counts);
    if (max <= 0) return null;
    const peak = counts.indexOf(max);
    const bars: RecapBar[] = counts.map((count, hour) => ({
      key: String(hour).padStart(2, "0"),
      label: String(hour).padStart(2, "0"),
      count,
      share: shareOf(count, max),
      peak: hour === peak,
    }));
    return {
      type: "hour-bars",
      bars,
      peakLabel: `Peak ${String(peak).padStart(2, "0")}:00`,
      sparse: false,
    };
  }
  const peaks = (context.peakHours ?? []).filter((hour) => hour >= 0 && hour <= 23);
  if (!peaks.length) return null;
  const peakSet = new Set(peaks);
  const lead = peaks[0]!;
  return {
    type: "hour-bars",
    bars: counts.map((_, hour) => ({
      key: String(hour).padStart(2, "0"),
      label: String(hour).padStart(2, "0"),
      count: peakSet.has(hour) ? 1 : 0,
      share: 0,
      peak: peakSet.has(hour),
    })),
    peakLabel: `Peak ${String(lead).padStart(2, "0")}:00`,
    sparse: true,
  };
}

function weekdayFrom(context: RecapContext): Extract<RecapWidget, { type: "weekday" }> | null {
  const sessions = context.sessions ?? [];
  if (sessions.length === 0) return null;
  const offset = context.utcOffsetMinutes ?? 0;
  const counts = Array.from({ length: 7 }, () => 0);
  for (const session of sessions) {
    const day = localWeekday(session.startedAt, offset);
    counts[day] = (counts[day] ?? 0) + 1;
  }
  const max = Math.max(...counts);
  if (max <= 0) return null;
  const peak = counts.indexOf(max);
  return {
    type: "weekday",
    bars: counts.map((count, index) => ({
      key: WEEKDAYS[index]!,
      label: WEEKDAYS[index]!,
      count,
      share: shareOf(count, max),
      peak: index === peak,
    })),
  };
}

function streaksFrom(context: RecapContext): { longest: RecapStreakRange; others: RecapStreakRange[] } | null {
  const sessions = context.sessions ?? [];
  if (sessions.length === 0) return null;
  const offset = context.utcOffsetMinutes ?? 0;
  const days = [...new Set(sessions.map((session) => localDayKey(session.startedAt, offset)))].sort();
  const runs = consecutiveRuns(days);
  const longest = runs[0];
  if (!longest) return null;
  return { longest, others: runs.slice(1, 3) };
}

export function computeRecapWidgets(context: RecapContext): RecapWidgets {
  const streak = streaksFrom(context);
  return {
    statGrid: statGridFrom(context),
    ranked: rankedFrom(context),
    hourBars: hourBarsFrom(context),
    weekday: weekdayFrom(context),
    streak: streak?.longest ?? null,
    streakOthers: streak?.others ?? [],
  };
}

export function widgetForLayout(layout: RecapLayout, widgets: RecapWidgets): RecapWidget | undefined {
  if (layout === "stat-grid") return widgets.statGrid ?? undefined;
  if (layout === "ranked") return widgets.ranked ?? undefined;
  if (layout === "hour-bars") return widgets.hourBars ?? undefined;
  if (layout === "weekday") return widgets.weekday ?? undefined;
  if (layout === "streak" && widgets.streak) {
    return { type: "streak", others: widgets.streakOthers };
  }
  return undefined;
}
