/**
 * Pure usage folding: turn published chapter snapshots into per-day, per-model
 * rows without double-counting overlapping scan windows. Same window relation
 * as lib/story/chapter-delta.ts (cumulative / incremental / overlapping).
 */
export const USAGE_ACTIVITY_MODEL = "__activity";

const DAY_MS = 24 * 60 * 60 * 1000;

export type UsageWindow = { startedAt: string; endedAt: string };
export type WindowRelation = "cumulative" | "incremental" | "overlapping";

export type UsageChapterInput = {
  chapterIndex: number;
  snapshot: unknown;
};

export type UsageDailyRow = {
  day: string;
  modelKey: string;
  modelLabel: string;
  tokens: number;
  costMicroUsd: number | null;
  sessionCount: number;
};

type ModelRate = {
  key: string;
  label: string;
  totalTokens: number;
  costMicroUsd: number | null;
};

type AttributedSession = {
  sessionRef: string;
  startedAt: string;
  endedAt: string;
  allocations: Array<{
    modelKey: string;
    modelLabel: string;
    tokens: number;
    costMicroUsd: number | null;
  }>;
};

type NormalizedChapter = {
  window: UsageWindow;
  sessions: AttributedSession[];
};

export function usageWindowRelation(previous: UsageWindow, current: UsageWindow): WindowRelation {
  const previousStart = Date.parse(previous.startedAt);
  const currentStart = Date.parse(current.startedAt);
  if (Number.isFinite(previousStart) && Number.isFinite(currentStart) && Math.abs(currentStart - previousStart) <= DAY_MS) {
    return "cumulative";
  }
  if (Number.isFinite(currentStart) && Number.isFinite(Date.parse(previous.endedAt)) && currentStart >= Date.parse(previous.endedAt)) {
    return "incremental";
  }
  return "overlapping";
}

export type FeatSession = {
  sessionRef: string;
  startedAt: string;
  endedAt: string;
  durationMinutes: number;
  totalTokens: number;
};

function foldAttributedSessions(chapters: UsageChapterInput[]): AttributedSession[] {
  const sorted = [...chapters].sort((left, right) => left.chapterIndex - right.chapterIndex);
  const folded = new Map<string, AttributedSession>();
  let previousWindow: UsageWindow | null = null;
  for (const chapter of sorted) {
    const current = normalizeChapter(chapter.snapshot);
    if (!current) continue;
    if (!previousWindow) {
      folded.clear();
      for (const session of current.sessions) folded.set(session.sessionRef, session);
    } else {
      const relation = usageWindowRelation(previousWindow, current.window);
      if (relation === "cumulative") {
        folded.clear();
        for (const session of current.sessions) folded.set(session.sessionRef, session);
      } else {
        for (const session of current.sessions) folded.set(session.sessionRef, session);
      }
    }
    previousWindow = current.window;
  }
  return Array.from(folded.values());
}

export function foldChaptersToDailyRows(chapters: UsageChapterInput[]): UsageDailyRow[] {
  return bucketDaily(foldAttributedSessions(chapters));
}

export type UsageHourBucket = {
  hour: number;
  sessions: number;
  spendMicroUsd: number;
};

/**
 * Private profile usage must be a superset of the published fold. An unpublished
 * re-scan often shares the same window start, which the cumulative rule would
 * treat as a replacement — wiping published sessions and making private < public.
 * Keep published session refs, then add unpublished refs that are not already present.
 */
export function unionUnpublishedOntoPublished(
  publishedChapters: UsageChapterInput[],
  unpublishedChapters: UsageChapterInput[],
): AttributedSession[] {
  const published = foldAttributedSessions(publishedChapters);
  const unpublished = foldAttributedSessions(unpublishedChapters);
  const merged = new Map(published.map((session) => [session.sessionRef, session]));
  for (const session of unpublished) {
    if (!merged.has(session.sessionRef)) merged.set(session.sessionRef, session);
  }
  return Array.from(merged.values());
}

export function foldUnionToDailyRows(
  publishedChapters: UsageChapterInput[],
  unpublishedChapters: UsageChapterInput[],
): UsageDailyRow[] {
  return bucketDaily(unionUnpublishedOntoPublished(publishedChapters, unpublishedChapters));
}

export function hourlyFromSessions(sessions: AttributedSession[]): UsageHourBucket[] {
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, sessions: 0, spendMicroUsd: 0 }));
  for (const session of sessions) {
    const parsed = Date.parse(session.startedAt);
    if (!Number.isFinite(parsed)) continue;
    const hour = new Date(parsed).getUTCHours();
    const bucket = hours[hour]!;
    bucket.sessions += 1;
    for (const allocation of session.allocations) {
      bucket.spendMicroUsd += Math.max(0, allocation.costMicroUsd ?? 0);
    }
  }
  return hours;
}

export function foldChaptersToFeatSessions(chapters: UsageChapterInput[]): FeatSession[] {
  return foldAttributedSessions(chapters).map((session) => ({
    sessionRef: session.sessionRef,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    durationMinutes: durationMinutes(session.startedAt, session.endedAt),
    totalTokens: session.allocations.reduce((sum, allocation) => sum + allocation.tokens, 0),
  }));
}

function durationMinutes(startedAt: string, endedAt: string): number {
  const start = Date.parse(startedAt);
  const end = Date.parse(endedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.max(0, Math.round((end - start) / 60_000));
}

function normalizeChapter(snapshot: unknown): NormalizedChapter | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const record = snapshot as Record<string, unknown>;
  const window = extractWindow(record);
  if (!window) return null;
  const models = extractModels(record);
  const rawSessions = extractRawSessions(record);
  const sessions = attributeSessions(rawSessions, models);
  return { window, sessions };
}

function extractWindow(record: Record<string, unknown>): UsageWindow | null {
  const timeWindow = record.timeWindow;
  if (!timeWindow || typeof timeWindow !== "object") return null;
  const window = timeWindow as Record<string, unknown>;
  const startedAt = stringOrNull(window.startedAt) ?? stringOrNull(window.start);
  const endedAt = stringOrNull(window.endedAt) ?? stringOrNull(window.end);
  if (!startedAt || !endedAt) return null;
  return { startedAt, endedAt };
}

function extractModels(record: Record<string, unknown>): ModelRate[] {
  const usage = record.usage;
  if (!usage || typeof usage !== "object") return [];
  const models = (usage as Record<string, unknown>).models;
  if (!Array.isArray(models)) return [];
  const rates: ModelRate[] = [];
  for (const item of models) {
    if (!item || typeof item !== "object") continue;
    const model = item as Record<string, unknown>;
    const name = stringOrNull(model.name) ?? stringOrNull(model.label) ?? stringOrNull(model.id);
    if (!name) continue;
    const provider = stringOrNull(model.provider);
    const id = stringOrNull(model.id);
    const key = id ?? (provider ? `${provider}:${name}` : name);
    const tokenUsage = model.tokenUsage;
    const totalTokens =
      tokenUsage && typeof tokenUsage === "object" && typeof (tokenUsage as { totalTokens?: unknown }).totalTokens === "number"
        ? Math.max(0, Math.trunc((tokenUsage as { totalTokens: number }).totalTokens))
        : 0;
    const costMicroUsd = typeof model.costMicroUsd === "number" ? Math.trunc(model.costMicroUsd) : null;
    rates.push({ key, label: name, totalTokens, costMicroUsd });
  }
  return rates;
}

type RawSession = {
  sessionRef: string;
  startedAt: string;
  endedAt: string;
  modelRefs: string[];
  totalTokens: number | null;
};

function extractRawSessions(record: Record<string, unknown>): RawSession[] {
  if (!Array.isArray(record.sessions)) return [];
  const sessions: RawSession[] = [];
  for (const item of record.sessions) {
    if (!item || typeof item !== "object") continue;
    const session = item as Record<string, unknown>;
    const sessionRef = stringOrNull(session.sessionRef) ?? stringOrNull(session.id);
    const startedAt = stringOrNull(session.startedAt);
    const endedAt = stringOrNull(session.endedAt) ?? startedAt;
    if (!sessionRef || !startedAt || !endedAt) continue;
    const modelRefs = Array.isArray(session.modelRefs)
      ? session.modelRefs.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : Array.isArray(session.modelIds)
        ? session.modelIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        : [];
    const tokenUsage = session.tokenUsage;
    const totalTokens =
      tokenUsage && typeof tokenUsage === "object" && typeof (tokenUsage as { totalTokens?: unknown }).totalTokens === "number"
        ? Math.max(0, Math.trunc((tokenUsage as { totalTokens: number }).totalTokens))
        : null;
    sessions.push({ sessionRef, startedAt, endedAt, modelRefs, totalTokens });
  }
  return sessions;
}

function attributeSessions(sessions: RawSession[], models: ModelRate[]): AttributedSession[] {
  const hasSessionTokens = sessions.some((session) => session.totalTokens != null && session.totalTokens > 0);
  if (hasSessionTokens) {
    return sessions.map((session) => ({
      sessionRef: session.sessionRef,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      allocations: allocateSessionTokens(session, models),
    }));
  }
  return distributeModelTotals(sessions, models);
}

function allocateSessionTokens(session: RawSession, models: ModelRate[]): AttributedSession["allocations"] {
  const tokens = session.totalTokens ?? 0;
  if (tokens <= 0) return [];
  const matched = matchModels(session.modelRefs, models);
  const targets = matched.length > 0 ? matched : [{ key: session.modelRefs[0] ?? "__unattributed", label: session.modelRefs[0] ?? "Unattributed", totalTokens: 0, costMicroUsd: null }];
  return splitTokens(tokens, targets);
}

function distributeModelTotals(sessions: RawSession[], models: ModelRate[]): AttributedSession[] {
  const allocationsByRef = new Map<string, AttributedSession["allocations"]>();
  for (const session of sessions) allocationsByRef.set(session.sessionRef, []);
  for (const model of models) {
    if (model.totalTokens <= 0 && model.costMicroUsd == null) continue;
    const matching = sessions.filter((session) => session.modelRefs.includes(model.key) || session.modelRefs.includes(model.label));
    const targets = matching.length > 0 ? matching : sessions;
    if (targets.length === 0) continue;
    const tokenParts = splitInteger(model.totalTokens, targets.length);
    const costParts = model.costMicroUsd == null ? targets.map(() => null) : splitInteger(model.costMicroUsd, targets.length);
    targets.forEach((session, index) => {
      const list = allocationsByRef.get(session.sessionRef);
      if (!list) return;
      list.push({
        modelKey: model.key,
        modelLabel: model.label,
        tokens: tokenParts[index] ?? 0,
        costMicroUsd: costParts[index] ?? null,
      });
    });
  }
  return sessions.map((session) => ({
    sessionRef: session.sessionRef,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    allocations: allocationsByRef.get(session.sessionRef) ?? [],
  }));
}

function matchModels(modelRefs: string[], models: ModelRate[]): ModelRate[] {
  const matched: ModelRate[] = [];
  for (const ref of modelRefs) {
    const hit = models.find((model) => model.key === ref || model.label === ref || model.key.endsWith(`:${ref}`));
    if (hit && !matched.some((model) => model.key === hit.key)) matched.push(hit);
  }
  return matched;
}

function splitTokens(tokens: number, models: ModelRate[]): AttributedSession["allocations"] {
  const parts = splitInteger(tokens, models.length);
  return models.map((model, index) => {
    const share = parts[index] ?? 0;
    const costMicroUsd =
      model.costMicroUsd == null || model.totalTokens <= 0
        ? model.costMicroUsd
        : Math.round((share * model.costMicroUsd) / model.totalTokens);
    return { modelKey: model.key, modelLabel: model.label, tokens: share, costMicroUsd };
  });
}

function splitInteger(total: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(total / count);
  const remainder = total - base * count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

function bucketDaily(sessions: AttributedSession[]): UsageDailyRow[] {
  const rows = new Map<string, UsageDailyRow>();
  const bump = (row: UsageDailyRow) => {
    const key = `${row.day}\t${row.modelKey}`;
    const existing = rows.get(key);
    if (!existing) {
      rows.set(key, { ...row });
      return;
    }
    existing.tokens += row.tokens;
    existing.sessionCount += row.sessionCount;
    if (row.costMicroUsd == null && existing.costMicroUsd == null) return;
    existing.costMicroUsd = (existing.costMicroUsd ?? 0) + (row.costMicroUsd ?? 0);
  };
  for (const session of sessions) {
    const day = utcDay(session.startedAt);
    bump({
      day,
      modelKey: USAGE_ACTIVITY_MODEL,
      modelLabel: "",
      tokens: 0,
      costMicroUsd: null,
      sessionCount: 1,
    });
    for (const allocation of session.allocations) {
      if (allocation.tokens <= 0 && allocation.costMicroUsd == null) continue;
      bump({
        day,
        modelKey: allocation.modelKey,
        modelLabel: allocation.modelLabel,
        tokens: allocation.tokens,
        costMicroUsd: allocation.costMicroUsd,
        sessionCount: 0,
      });
    }
  }
  return Array.from(rows.values()).sort((left, right) => left.day.localeCompare(right.day) || left.modelKey.localeCompare(right.modelKey));
}

export function utcDay(timestamp: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(timestamp)) return timestamp;
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return timestamp.slice(0, 10);
  return new Date(parsed).toISOString().slice(0, 10);
}

export function periodStartDay(period: "7d" | "30d" | "all-time", now = Date.now()): string | null {
  if (period === "all-time") return null;
  const days = period === "7d" ? 7 : 30;
  return new Date(now - (days - 1) * DAY_MS).toISOString().slice(0, 10);
}

export function computeStreaks(days: string[], today = utcDay(new Date().toISOString())): { current: number; longest: number } {
  const unique = Array.from(new Set(days.filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day)))).sort();
  if (unique.length === 0) return { current: 0, longest: 0 };
  let longest = 1;
  let run = 1;
  for (let index = 1; index < unique.length; index += 1) {
    if (unique[index] === nextDay(unique[index - 1]!)) {
      run += 1;
      longest = Math.max(longest, run);
    } else {
      run = 1;
    }
  }
  const last = unique[unique.length - 1]!;
  let current = 0;
  if (last === today || last === previousDay(today)) {
    current = 1;
    for (let index = unique.length - 2; index >= 0; index -= 1) {
      if (unique[index] === previousDay(unique[index + 1]!)) current += 1;
      else break;
    }
  }
  return { current, longest: Math.max(longest, current) };
}

function nextDay(day: string): string {
  return new Date(Date.parse(`${day}T12:00:00.000Z`) + DAY_MS).toISOString().slice(0, 10);
}

function previousDay(day: string): string {
  return new Date(Date.parse(`${day}T12:00:00.000Z`) - DAY_MS).toISOString().slice(0, 10);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}
