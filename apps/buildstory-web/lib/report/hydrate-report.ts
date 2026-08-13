import type { GeneratedReport, PublicFieldKey } from "@/lib/ingestion/contracts";
import { withUiPortPublicFields } from "@/lib/ingestion/contracts";
import { computeBuilderProfile, canonicalArchetypeName, type BuilderProfile } from "@/lib/ingestion/profile";
import type { ScannerProjectSnapshot, Signal } from "@/lib/ingestion/scanner-project-snapshot";
import { computeSignals } from "@/lib/ingestion/signals";
import { buildStoryPackSources } from "@/lib/narrative/story-pack";
import type { ProjectSnapshot } from "@/lib/project-snapshot";

/**
 * True scanner transport, not a ProjectSnapshot stuffed into source_snapshot_json
 * by a contract test. Recompute is only safe against the scanner shape.
 */
export function isScannerProjectSnapshot(value: unknown): value is ScannerProjectSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.scanId === "string"
    && Array.isArray(candidate.sessions)
    && typeof candidate.usage === "object"
    && candidate.usage !== null
    && typeof candidate.git === "object"
    && candidate.git !== null;
}

function mergeSignals(computed: Signal[], stored: Signal[] | undefined): Signal[] {
  const byId = new Map(computed.map((signal) => [signal.id, signal]));
  for (const signal of stored ?? []) {
    if (!byId.has(signal.id)) byId.set(signal.id, signal);
  }
  return [...byId.values()].sort((left, right) => right.notability - left.notability || left.id.localeCompare(right.id));
}

function withLegacyWorkPatterns(profile: BuilderProfile): BuilderProfile {
  const patterns = profile.workPatterns as BuilderProfile["workPatterns"] & {
    nightShare?: number;
    morningShare?: number;
    weekendShare?: number;
    distinctToolCount?: number;
  };
  const name = canonicalArchetypeName(profile.archetype.name);
  return {
    ...profile,
    archetype: {
      ...profile.archetype,
      name: name as BuilderProfile["archetype"]["name"],
    },
    workPatterns: {
      ...patterns,
      nightShare: patterns.nightShare ?? 0,
      morningShare: patterns.morningShare ?? 0,
      weekendShare: patterns.weekendShare ?? 0,
      distinctToolCount: patterns.distinctToolCount ?? 0,
    },
  };
}

/**
 * Recomputes profile + signals from the retained scanner snapshot so a report
 * stored before the expanded archetypes, work-pattern shares, or busiest-weekday
 * signal still renders the current UI. Evidence-family signals that cannot be
 * recomputed after scrub are kept from the stored report.
 */
export function hydrateReportSnapshot(
  source: unknown,
  snapshot: ProjectSnapshot,
): ProjectSnapshot {
  if (!isScannerProjectSnapshot(source)) {
    if (!snapshot.builderProfile) return snapshot;
    return { ...snapshot, builderProfile: withLegacyWorkPatterns(snapshot.builderProfile) };
  }
  const builderProfile = computeBuilderProfile({
    sessions: source.sessions,
    usage: source.usage,
    git: source.git,
    timeWindow: source.timeWindow,
  });
  const signals = mergeSignals(
    computeSignals({
      sessions: source.sessions,
      usage: source.usage,
      git: source.git,
      timeWindow: source.timeWindow,
      narrativeEvidence: source.narrativeEvidence,
      sources: buildStoryPackSources(source),
    }),
    snapshot.signals,
  );
  const narrative = snapshot.narrative?.storyPack
    ? {
        ...snapshot.narrative,
        storyPack: { ...snapshot.narrative.storyPack, signals },
      }
    : snapshot.narrative;
  return {
    ...snapshot,
    builderProfile,
    signals,
    ...(narrative ? { narrative } : {}),
  };
}

export function hydrateGeneratedReport(report: GeneratedReport): GeneratedReport {
  return {
    ...report,
    snapshot: hydrateReportSnapshot(report.sourceSnapshot, report.snapshot),
  };
}

export function portSelectedPublicFields(fields: readonly PublicFieldKey[]): PublicFieldKey[] {
  return withUiPortPublicFields(fields);
}

export type ReportUiPortPlan = {
  hydrateSnapshot: boolean;
  updatePublicFields: boolean;
  refreshPublicIndex: boolean;
};

export function planReportUiPort(report: GeneratedReport): { next: GeneratedReport; plan: ReportUiPortPlan } {
  const snapshot = hydrateReportSnapshot(report.sourceSnapshot, report.snapshot);
  const selectedPublicFields = portSelectedPublicFields(report.selectedPublicFields);
  const hydrateSnapshot = JSON.stringify(snapshot) !== JSON.stringify(report.snapshot);
  const updatePublicFields = selectedPublicFields.length !== report.selectedPublicFields.length
    || selectedPublicFields.some((field, index) => field !== report.selectedPublicFields[index]);
  const next = { ...report, snapshot, selectedPublicFields };
  return {
    next,
    plan: {
      hydrateSnapshot,
      updatePublicFields,
      // Always rebuild a live published projection so recapEnabled/signals land
      // in frozen story_json even when the stored snapshot already looked current.
      refreshPublicIndex: report.publication.status === "published",
    },
  };
}
