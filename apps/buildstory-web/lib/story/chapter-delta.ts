/**
 * The "what changed" model for a project update. Pure and deterministic: no I/O,
 * given the same two snapshots it always returns the same delta. Computed once at
 * publish time (see publishReport in lib/ingestion/*-store.ts) and frozen into
 * chapter_delta_json, mirroring how buildstory_public_story_index.story_json is
 * frozen at publish rather than re-derived on every public read.
 *
 * Two hard rules drive this file:
 * - Prose (tagline, narrative, milestones' own text, archetype rationale) is
 *   REPLACED, never diffed - regenerated LLM text has no stable diff, and diffing
 *   it produces noise, not information. `narrativeReplaced` is the only signal.
 * - A price is never fabricated: `spend.totalMicroUsd` is null unless BOTH
 *   chapters priced their model usage, exactly like AggregateCost.totalMicroUsd
 *   itself is null rather than a guessed $0.
 */
import { buildStoryFromSnapshot } from "@/lib/build-story";
import type { PublicFieldKey } from "@/lib/ingestion/contracts";
import { PROFILE_DIMENSIONS, type ProfileDimension } from "@/lib/ingestion/profile";
import type { ProjectSnapshot, SnapshotTimeWindow } from "@/lib/project-snapshot";

export type NumericDelta = { previous: number | null; current: number; change: number | null };

export type WindowRelation = "cumulative" | "incremental" | "overlapping";

export type ChapterModelDelta = {
  added: Array<{ id: string; label: string; requests: number; share: number | null }>;
  removed: Array<{ id: string; label: string; previousRequests: number; previousShare: number | null }>;
  shifted: Array<{ id: string; label: string; previousShare: number | null; share: number | null; requestsDelta: number }>;
  primaryModelChanged: { from: string | null; to: string | null } | null;
};

export type ChapterProfileDelta = {
  archetypeChanged: { from: string; to: string } | null;
  scores: Record<ProfileDimension, NumericDelta>;
  workPatterns: {
    peakHoursChanged: boolean;
    preferredDaysChanged: boolean;
    medianSessionMinutes: NumericDelta;
    primaryModel: { from: string | null; to: string | null } | null;
  } | null;
};

export type ChapterDelta = {
  fromChapterIndex: number;
  toChapterIndex: number;
  windowRelation: WindowRelation;
  window: { previousEndedAt: string; endedAt: string; newActiveDays: number };
  build: {
    commits: NumericDelta;
    additions: NumericDelta;
    deletions: NumericDelta;
    filesTouched: NumericDelta;
    branches: NumericDelta;
    activeDays: NumericDelta;
    sessionCount: NumericDelta;
    buildHours: NumericDelta;
    subagentCount: NumericDelta;
  };
  spend: {
    /** Null unless both chapters priced their usage - never a fabricated $ change. */
    totalMicroUsd: NumericDelta | null;
    totalTokens: NumericDelta;
    inputTokens: NumericDelta;
    outputTokens: NumericDelta;
    modelRequests: NumericDelta;
  };
  models: ChapterModelDelta;
  tools: { added: string[]; removed: string[] };
  stack: { added: string[]; removed: string[] };
  profile: ChapterProfileDelta | null;
  milestones: { added: Array<{ title: string; occurredAt: string; kind: string }>; total: NumericDelta };
  redaction: { tokensRemoved: NumericDelta };
  /** True whenever the new chapter carries its own narrative - the old one is replaced wholesale, never diffed. */
  narrativeReplaced: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * "cumulative" (equal start, ~full re-scan): every build/spend number is a real
 * delta. "incremental" (new window starts at/after the old one ended, e.g. a
 * --since scan): the chapter's own totals ARE the new work, not a delta to sum.
 * "overlapping" (anything else): windows overlap in a way that would double-count
 * if summed - db/schema.ts's projects comment warns about exactly this - so
 * numbers are shown as this chapter's own totals with an explicit caveat, same as
 * "incremental".
 */
function deriveWindowRelation(previous: SnapshotTimeWindow, current: SnapshotTimeWindow): WindowRelation {
  const previousStart = Date.parse(previous.startedAt);
  const currentStart = Date.parse(current.startedAt);
  if (Math.abs(currentStart - previousStart) <= DAY_MS) return "cumulative";
  if (currentStart >= Date.parse(previous.endedAt)) return "incremental";
  return "overlapping";
}

function nd(previous: number, current: number): NumericDelta {
  return { previous, current, change: current - previous };
}

const zeroDelta: NumericDelta = { previous: null, current: 0, change: null };

export function computeChapterDelta(
  previousSnapshot: ProjectSnapshot,
  currentSnapshot: ProjectSnapshot,
  fromChapterIndex: number,
  toChapterIndex: number,
): ChapterDelta {
  const previous = buildStoryFromSnapshot(previousSnapshot);
  const current = buildStoryFromSnapshot(currentSnapshot);
  const windowRelation = deriveWindowRelation(previousSnapshot.timeWindow, currentSnapshot.timeWindow);
  const newActiveDays = windowRelation === "incremental"
    ? current.activeDays
    : Math.max(0, current.activeDays - previous.activeDays);

  const previousModelsById = new Map(previous.models.map((model) => [model.id, model]));
  const currentModelsById = new Map(current.models.map((model) => [model.id, model]));
  const added = current.models
    .filter((model) => !previousModelsById.has(model.id))
    .map((model) => ({ id: model.id, label: model.label, requests: model.requests, share: model.share }));
  const removed = previous.models
    .filter((model) => !currentModelsById.has(model.id))
    .map((model) => ({ id: model.id, label: model.label, previousRequests: model.requests, previousShare: model.share }));
  const shifted = current.models.flatMap((model) => {
    const previousModel = previousModelsById.get(model.id);
    if (!previousModel) return [];
    const previousShare = previousModel.share;
    const share = model.share;
    const shareUnchanged = previousShare === share
      || (previousShare !== null && share !== null && Math.abs(share - previousShare) < 1);
    if (shareUnchanged) return [];
    return [{ id: model.id, label: model.label, previousShare, share, requestsDelta: model.requests - previousModel.requests }];
  });
  const previousPrimaryModel = previous.profile?.workPatterns.primaryModel ?? null;
  const currentPrimaryModel = current.profile?.workPatterns.primaryModel ?? null;
  const models: ChapterModelDelta = {
    added,
    removed,
    shifted,
    primaryModelChanged: previousPrimaryModel !== currentPrimaryModel
      ? { from: previousPrimaryModel, to: currentPrimaryModel }
      : null,
  };

  const previousTools = new Set(previous.tools.map((tool) => tool.label));
  const currentTools = new Set(current.tools.map((tool) => tool.label));
  const previousStack = new Set(previous.stack);
  const currentStack = new Set(current.stack);

  const profile: ChapterProfileDelta | null = previous.profile && current.profile
    ? {
        archetypeChanged: previous.profile.archetype.name !== current.profile.archetype.name
          ? { from: previous.profile.archetype.name, to: current.profile.archetype.name }
          : null,
        scores: Object.fromEntries(
          PROFILE_DIMENSIONS.map((dimension) => [
            dimension,
            nd(previous.profile!.scores[dimension].value, current.profile!.scores[dimension].value),
          ]),
        ) as Record<ProfileDimension, NumericDelta>,
        workPatterns: {
          peakHoursChanged: JSON.stringify([...previous.profile.workPatterns.peakHours].sort((a, b) => a - b))
            !== JSON.stringify([...current.profile.workPatterns.peakHours].sort((a, b) => a - b)),
          preferredDaysChanged: JSON.stringify([...previous.profile.workPatterns.preferredDays].sort())
            !== JSON.stringify([...current.profile.workPatterns.preferredDays].sort()),
          medianSessionMinutes: nd(previous.profile.workPatterns.medianSessionMinutes, current.profile.workPatterns.medianSessionMinutes),
          primaryModel: previousPrimaryModel !== currentPrimaryModel
            ? { from: previousPrimaryModel, to: currentPrimaryModel }
            : null,
        },
      }
    : null;

  const previousMilestoneIds = new Set(previousSnapshot.milestones.map((milestone) => milestone.id));
  const addedMilestones = currentSnapshot.milestones
    .filter((milestone) => !previousMilestoneIds.has(milestone.id))
    .map((milestone) => ({ title: milestone.title, occurredAt: milestone.occurredAt, kind: milestone.kind }));

  return {
    fromChapterIndex,
    toChapterIndex,
    windowRelation,
    window: { previousEndedAt: previousSnapshot.timeWindow.endedAt, endedAt: currentSnapshot.timeWindow.endedAt, newActiveDays },
    build: {
      commits: nd(previous.git.commits, current.git.commits),
      additions: nd(previous.git.additions, current.git.additions),
      deletions: nd(previous.git.deletions, current.git.deletions),
      filesTouched: nd(previous.git.filesTouched, current.git.filesTouched),
      branches: nd(previous.git.branches, current.git.branches),
      activeDays: nd(previous.activeDays, current.activeDays),
      sessionCount: nd(previous.sessionCount, current.sessionCount),
      buildHours: nd(previous.buildHours, current.buildHours),
      subagentCount: nd(previous.subagentCount, current.subagentCount),
    },
    spend: {
      totalMicroUsd: previous.cost?.totalMicroUsd != null && current.cost?.totalMicroUsd != null
        ? nd(previous.cost.totalMicroUsd, current.cost.totalMicroUsd)
        : null,
      totalTokens: nd(previous.tokenUsage?.totalTokens ?? 0, current.tokenUsage?.totalTokens ?? 0),
      inputTokens: nd(previous.tokenUsage?.inputTokens ?? 0, current.tokenUsage?.inputTokens ?? 0),
      outputTokens: nd(previous.tokenUsage?.outputTokens ?? 0, current.tokenUsage?.outputTokens ?? 0),
      modelRequests: nd(previous.modelRequests, current.modelRequests),
    },
    models,
    tools: {
      added: [...currentTools].filter((tool) => !previousTools.has(tool)),
      removed: [...previousTools].filter((tool) => !currentTools.has(tool)),
    },
    stack: {
      added: [...currentStack].filter((tag) => !previousStack.has(tag)),
      removed: [...previousStack].filter((tag) => !currentStack.has(tag)),
    },
    profile,
    milestones: {
      added: addedMilestones,
      total: nd(previousSnapshot.milestones.length, currentSnapshot.milestones.length),
    },
    redaction: { tokensRemoved: nd(previousSnapshot.redaction.tokensRemoved, currentSnapshot.redaction.tokensRemoved) },
    narrativeReplaced: Boolean(currentSnapshot.narrative),
  };
}

/**
 * Publication boundary for a chapter delta, mirroring publicBuildStoryFromSnapshot's
 * key map field-for-field: a number the creator hasn't opted into publishing must
 * never appear here just because it's "only a delta", not the number itself.
 */
export function publicChapterDelta(delta: ChapterDelta, selectedFields: PublicFieldKey[]): ChapterDelta {
  const selected = new Set(selectedFields);
  const gateNumeric = (key: PublicFieldKey, value: NumericDelta): NumericDelta => (selected.has(key) ? value : zeroDelta);
  const emptyScores = Object.fromEntries(
    PROFILE_DIMENSIONS.map((dimension) => [dimension, zeroDelta]),
  ) as Record<ProfileDimension, NumericDelta>;

  return {
    ...delta,
    build: {
      commits: gateNumeric("gitAggregates", delta.build.commits),
      additions: gateNumeric("gitAggregates", delta.build.additions),
      deletions: gateNumeric("gitAggregates", delta.build.deletions),
      filesTouched: gateNumeric("gitAggregates", delta.build.filesTouched),
      branches: gateNumeric("gitAggregates", delta.build.branches),
      activeDays: gateNumeric("timeWindow", delta.build.activeDays),
      sessionCount: gateNumeric("sessionSummary", delta.build.sessionCount),
      buildHours: gateNumeric("sessionSummary", delta.build.buildHours),
      subagentCount: gateNumeric("sessionSummary", delta.build.subagentCount),
    },
    spend: {
      totalMicroUsd: selected.has("costEstimate") ? delta.spend.totalMicroUsd : null,
      totalTokens: gateNumeric("modelMix", delta.spend.totalTokens),
      inputTokens: gateNumeric("modelMix", delta.spend.inputTokens),
      outputTokens: gateNumeric("modelMix", delta.spend.outputTokens),
      modelRequests: gateNumeric("modelMix", delta.spend.modelRequests),
    },
    models: selected.has("modelMix") ? delta.models : { added: [], removed: [], shifted: [], primaryModelChanged: null },
    tools: selected.has("toolUsage") ? delta.tools : { added: [], removed: [] },
    profile: delta.profile
      ? {
          archetypeChanged: selected.has("archetype") ? delta.profile.archetypeChanged : null,
          scores: selected.has("profileScores") ? delta.profile.scores : emptyScores,
          workPatterns: selected.has("workPatterns") ? delta.profile.workPatterns : null,
        }
      : null,
    milestones: selected.has("milestones") ? delta.milestones : { added: [], total: zeroDelta },
    redaction: selected.has("redactionSummary") ? delta.redaction : { tokensRemoved: zeroDelta },
  };
}

const compactNumber = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const usdFormat = new Intl.NumberFormat("en", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

function signed(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toLocaleString("en")}`;
}

/**
 * Renders a delta (private or already publicly-gated via publicChapterDelta) as a
 * flat list of short, human-readable highlights - "what changed" bullets shared by
 * the creator's pre-publish panel, the public "UPDATED" band, and the project
 * changelog. A gated-off field's NumericDelta is the zero sentinel (previous:
 * null, current: 0), which every branch below skips, so this needs no separate
 * knowledge of the publication boundary - it just renders whatever it's given.
 */
export function formatChapterDeltaHighlights(delta: ChapterDelta): string[] {
  const lines: string[] = [];
  const isIncremental = delta.windowRelation !== "cumulative";
  const suffix = isIncremental ? " (new work this chapter)" : "";

  if (delta.build.commits.change) lines.push(`${signed(delta.build.commits.change)} commits${suffix}`);
  if (delta.build.additions.change || delta.build.deletions.change) {
    lines.push(`${signed(delta.build.additions.change ?? 0)}/${signed(-(delta.build.deletions.change ?? 0))} lines${suffix}`);
  }
  if (delta.build.sessionCount.change) lines.push(`${signed(delta.build.sessionCount.change)} AI sessions${suffix}`);
  if (delta.build.buildHours.change) lines.push(`${signed(Math.round(delta.build.buildHours.change * 10) / 10)} build hours${suffix}`);
  if (delta.build.activeDays.change) lines.push(`${signed(delta.build.activeDays.change)} active days${suffix}`);

  if (delta.spend.totalMicroUsd?.change) {
    const formatted = usdFormat.format(Math.abs(delta.spend.totalMicroUsd.change) / 1_000_000);
    lines.push(`${delta.spend.totalMicroUsd.change > 0 ? "+" : "-"}${formatted} spend${suffix}`);
  }
  if (delta.spend.totalTokens.change) lines.push(`${signed(delta.spend.totalTokens.change)} tokens (${compactNumber.format(delta.spend.totalTokens.change)})${suffix}`);

  for (const model of delta.models.added) lines.push(`Added ${model.label} to the model mix`);
  for (const model of delta.models.removed) lines.push(`Stopped using ${model.label}`);
  for (const model of delta.models.shifted) {
    if (model.previousShare === null || model.share === null) continue;
    lines.push(`${model.label} moved from ${model.previousShare}% to ${model.share}% of requests`);
  }
  if (delta.models.primaryModelChanged) {
    const { from, to } = delta.models.primaryModelChanged;
    if (from && to) lines.push(`Primary model changed from ${from} to ${to}`);
    else if (to) lines.push(`Primary model is now ${to}`);
  }

  for (const tool of delta.tools.added) lines.push(`Started using ${tool}`);
  for (const tool of delta.tools.removed) lines.push(`Stopped using ${tool}`);

  if (delta.profile?.archetypeChanged) {
    lines.push(`Builder archetype shifted from ${delta.profile.archetypeChanged.from} to ${delta.profile.archetypeChanged.to}`);
  }

  if (delta.milestones.added.length) {
    lines.push(`${delta.milestones.added.length} new milestone${delta.milestones.added.length === 1 ? "" : "s"}`);
  }

  return lines;
}
