/**
 * Pure, storage-agnostic contract for private-report layout preferences
 * (which sections are open, hidden, or pinned). Stored client-side in
 * localStorage today (see use-report-layout-prefs.ts); the JSON shape is
 * deliberately store-agnostic so a future account-synced version can adopt
 * it unchanged with only the hook swapped out.
 */

export const REPORT_SECTION_KEYS = [
  "boundary",
  "sessions",
  "repository",
  "toolModel",
  "redaction",
  "provenance",
  "profile",
  "narrativeArc",
  "narrativeMoments",
  "narrativeInsights",
  "narrativeSignals",
] as const;

export type ReportSectionKey = (typeof REPORT_SECTION_KEYS)[number];

const SECTION_KEY_SET = new Set<string>(REPORT_SECTION_KEYS);

function isReportSectionKey(value: unknown): value is ReportSectionKey {
  return typeof value === "string" && SECTION_KEY_SET.has(value);
}

export const REPORT_LAYOUT_PREFS_VERSION = 1;

export type ReportLayoutPrefs = {
  version: 1;
  /** Only deviations from DEFAULT_OPEN are stored, so changing a default later isn't frozen out by a stale blob. */
  open: Partial<Record<ReportSectionKey, boolean>>;
  hidden: ReportSectionKey[];
  pinned: ReportSectionKey[];
};

export const DEFAULT_OPEN: Record<ReportSectionKey, boolean> = {
  boundary: false,
  sessions: false,
  repository: true,
  /** Model distribution itself is always rendered outside this gate; toolModel only gates the tool-usage chip list. */
  toolModel: false,
  redaction: false,
  provenance: false,
  profile: true,
  narrativeArc: true,
  narrativeMoments: true,
  /** Recap-first sections are open by default; they are the report's payoff rather than optional audit detail. */
  narrativeInsights: true,
  narrativeSignals: true,
};

export function defaultReportLayoutPrefs(): ReportLayoutPrefs {
  return { version: REPORT_LAYOUT_PREFS_VERSION, open: {}, hidden: [], pinned: [] };
}

function sanitizeKeyList(value: unknown): ReportSectionKey[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<ReportSectionKey>();
  for (const entry of value) {
    if (isReportSectionKey(entry)) seen.add(entry);
  }
  return [...seen];
}

/** Total: never throws, always returns a valid ReportLayoutPrefs. Unknown version or malformed JSON both fall back to defaults. */
export function parseReportLayoutPrefs(raw: string | null | undefined): ReportLayoutPrefs {
  if (!raw) return defaultReportLayoutPrefs();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return defaultReportLayoutPrefs();
  }
  if (typeof parsed !== "object" || parsed === null) return defaultReportLayoutPrefs();
  const candidate = parsed as Record<string, unknown>;
  if (candidate.version !== REPORT_LAYOUT_PREFS_VERSION) return defaultReportLayoutPrefs();

  const open: Partial<Record<ReportSectionKey, boolean>> = {};
  if (typeof candidate.open === "object" && candidate.open !== null) {
    for (const [key, value] of Object.entries(candidate.open as Record<string, unknown>)) {
      if (isReportSectionKey(key) && typeof value === "boolean") open[key] = value;
    }
  }

  return {
    version: REPORT_LAYOUT_PREFS_VERSION,
    open,
    hidden: sanitizeKeyList(candidate.hidden),
    pinned: sanitizeKeyList(candidate.pinned),
  };
}

export function serializeReportLayoutPrefs(prefs: ReportLayoutPrefs): string {
  return JSON.stringify(prefs);
}

export function isSectionOpen(prefs: ReportLayoutPrefs, key: ReportSectionKey): boolean {
  return prefs.open[key] ?? DEFAULT_OPEN[key];
}

export function withSectionOpen(prefs: ReportLayoutPrefs, key: ReportSectionKey, open: boolean): ReportLayoutPrefs {
  const next = { ...prefs.open };
  if (open === DEFAULT_OPEN[key]) {
    delete next[key];
  } else {
    next[key] = open;
  }
  return { ...prefs, open: next };
}

export function withSectionHidden(prefs: ReportLayoutPrefs, key: ReportSectionKey, hidden: boolean): ReportLayoutPrefs {
  const set = new Set(prefs.hidden);
  if (hidden) set.add(key);
  else set.delete(key);
  const nextPinned = hidden ? prefs.pinned.filter((entry) => entry !== key) : prefs.pinned;
  return { ...prefs, hidden: [...set], pinned: nextPinned };
}

export function withSectionPinned(prefs: ReportLayoutPrefs, key: ReportSectionKey, pinned: boolean): ReportLayoutPrefs {
  const set = new Set(prefs.pinned);
  if (pinned) set.add(key);
  else set.delete(key);
  const nextHidden = pinned ? prefs.hidden.filter((entry) => entry !== key) : prefs.hidden;
  return { ...prefs, pinned: [...set], hidden: nextHidden };
}
