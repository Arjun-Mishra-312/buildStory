import type { ProjectSnapshot } from "./project-snapshot";
import type { PublicFieldKey, StoryCategory } from "./ingestion/contracts";
import type { ReportStoryPack, ReportStoryPackV2, ReportStoryPackV3, StoryPackFinding } from "./ingestion/scanner-project-snapshot";
import { NARRATIVE_FIELD_LIMITS } from "./narrative/schema";
import { sanitizePublicText } from "./publication/sanitization";
import { DEFAULT_STORY_BACKGROUND_ID, isStoryBackgroundId, type StoryBackgroundId } from "./background-options";

export type BuildStoryViewModel = ReturnType<typeof buildStoryFromSnapshot>;
export type PublicBuildStoryViewModel = ReturnType<typeof publicBuildStoryFromSnapshot>;

/**
 * Story packs are persisted with reports, so the renderer must tolerate a
 * pack written before a field was introduced. In particular, v2 packs from
 * the first narrative rollout have no deterministic `signals` array. Keep the
 * original prose and evidence intact while giving every consumer a safe
 * empty collection for the newer section.
 */
export function normalizeReportStoryPack(pack: ReportStoryPack | null | undefined): ReportStoryPack | null {
  if (!pack || typeof pack !== "object") return null;
  const legacy = pack as ReportStoryPack & { signals?: unknown };
  return {
    ...pack,
    signals: Array.isArray(legacy.signals) ? legacy.signals : [],
  } as ReportStoryPack;
}

function costShares(models: ProjectSnapshot["usage"]["models"]): Map<string, number | null> {
  const priced = models.filter((model) => model.costMicroUsd !== null);
  const total = priced.reduce((sum, model) => sum + (model.costMicroUsd ?? 0), 0);
  const shares = new Map<string, number | null>(models.map((model) => [model.id, null]));
  if (total <= 0) return shares;

  const floors = priced.map((model) => {
    const exact = ((model.costMicroUsd ?? 0) * 100) / total;
    return { id: model.id, floor: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let remaining = 100 - floors.reduce((sum, item) => sum + item.floor, 0);
  floors.sort((left, right) => right.remainder - left.remainder || left.id.localeCompare(right.id));
  for (const item of floors) {
    const share = item.floor + (remaining > 0 ? 1 : 0);
    shares.set(item.id, share);
    if (remaining > 0) remaining -= 1;
  }
  return shares;
}

const shortMonthDay = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const longDate = new Intl.DateTimeFormat("en", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function isSyntheticModelLabel(label: string) {
  return label.trim().toLocaleLowerCase("en-US") === "<synthetic>";
}

function observedActivityWindow(snapshot: ProjectSnapshot) {
  if (snapshot.sessions.length === 0) return snapshot.timeWindow;
  return {
    ...snapshot.timeWindow,
    startedAt: snapshot.sessions.reduce(
      (earliest, session) => session.startedAt < earliest ? session.startedAt : earliest,
      snapshot.sessions[0]!.startedAt,
    ),
    endedAt: snapshot.sessions.reduce(
      (latest, session) => session.endedAt > latest ? session.endedAt : latest,
      snapshot.sessions[0]!.endedAt,
    ),
  };
}

export function buildStoryFromSnapshot(snapshot: ProjectSnapshot) {
  const reportModels = snapshot.usage.models.filter((model) => !isSyntheticModelLabel(model.label));
  const activityWindow = observedActivityWindow(snapshot);
  const minutes = snapshot.sessions.reduce(
    (sum, session) => sum + session.durationMinutes,
    0,
  );
  const modelRequests = reportModels.reduce(
    (sum, model) => sum + model.requests,
    0,
  );
  const subagentCount = snapshot.sessions.reduce(
    (sum, session) => sum + (session.subagentInvocations ?? 0),
    0,
  );
  const shares = costShares(reportModels);
  const endedAtYear = new Date(activityWindow.endedAt).getUTCFullYear();

  return {
    id: snapshot.identity.id,
    slug: snapshot.identity.slug,
    name: snapshot.identity.name,
    tagline: snapshot.identity.tagline,
    description: snapshot.identity.description,
    status: snapshot.identity.status,
    owner: snapshot.identity.owner,
    repository: snapshot.repository,
    dateRange: `${shortMonthDay.format(new Date(activityWindow.startedAt))} — ${shortMonthDay.format(new Date(activityWindow.endedAt))}, ${endedAtYear}`,
    activeDays: snapshot.timeWindow.activeDays,
    sessionCount: snapshot.sessions.length,
    subagentCount,
    buildHours: Math.round((minutes / 60) * 10) / 10,
    modelRequests,
    models: reportModels.map((model) => ({
      ...model,
      share: shares.get(model.id) ?? null,
    })),
    tools: snapshot.usage.tools,
    tokenUsage: snapshot.usage.tokenUsage,
    cost: snapshot.usage.cost,
    coverage: snapshot.usage.coverage,
    stack: [snapshot.repository.framework, snapshot.repository.primaryLanguage, snapshot.repository.packageManager]
      .filter((value): value is string => Boolean(value) && value !== "Not collected"),
    git: snapshot.git,
    milestones: snapshot.milestones.map((milestone, index) => ({
      ...milestone,
      index: index + 1,
      date: longDate.format(new Date(milestone.occurredAt)),
    })),
    sessions: snapshot.sessions.map((session, index) => ({
      ...session,
      index: index + 1,
      date: shortMonthDay.format(new Date(session.startedAt)),
      duration: `${Math.floor(session.durationMinutes / 60)}h ${session.durationMinutes % 60}m`,
    })),
    redaction: snapshot.redaction,
    provenance: snapshot.provenance,
    ...(snapshot.sourceSelection ? { sourceSelection: snapshot.sourceSelection } : {}),
    profile: snapshot.builderProfile ?? null,
    narrative: snapshot.narrative
      ? {
          ...snapshot.narrative,
          ...(snapshot.narrative.storyPack
            ? { storyPack: normalizeReportStoryPack(snapshot.narrative.storyPack) ?? undefined }
            : {}),
        }
      : null,
    // Reports persisted before signals existed on ProjectSnapshot have no
    // signals array in their stored JSON despite the type saying otherwise -
    // default so every downstream .length/.map/[0] stays safe.
    signals: snapshot.signals ?? [],
    receiptId: `BR-${activityWindow.endedAt.slice(2, 10).replaceAll("-", "")}-${snapshot.repository.currentRevision.toUpperCase()}`,
  };
}

/**
 * Defense-in-depth at the publication boundary: even though artifact URLs
 * are validated at write time (see lib/ingestion/*-store.ts updateReportArtifact),
 * this boundary never trusts stored data blindly - only well-formed https
 * URLs ever reach a public response.
 */
function safeHttpsUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** The story-pack sections, each gated by its own independent PublicFieldKey - never bundled behind "narrative" or each other. */
const STORY_PACK_FIELD_KEYS = [
  "storyBuildArc",
  "storyMoments",
  "storyTurningPoint",
  "storyDecisions",
  "storyLearnings",
  "storyTraits",
  "storyGrowthEdge",
  "storySignals",
  "deepOpeningLine",
  "deepSignatureMoves",
  "deepByTheNumbers",
  "deepWhereItGotHard",
  "deepChapterChanges",
] as const satisfies readonly PublicFieldKey[];

function hasAnyStoryPackField(selected: Set<PublicFieldKey>): boolean {
  return STORY_PACK_FIELD_KEYS.some((field) => selected.has(field));
}

function publicStoryPack(
  pack: ReportStoryPack,
  selected: Set<PublicFieldKey>,
): ReportStoryPack {
  const clean = (value: string, max = 900) => sanitizePublicText(value, max).value;
  const refs = (value: string[]) => [...new Set(value)].slice(0, 4);
  const hasAnyField = hasAnyStoryPackField(selected);
  const base: ReportStoryPackV2 = {
    version: "2.0.0",
    sources: [],
    // Populated below, after byTheNumbers is projected - a published
    // byTheNumbers citation must always resolve to a real signal even if
    // storySignals itself wasn't separately selected.
    signals: [],
    hero: {
      headline: hasAnyField ? clean(pack.hero.headline, 160) : "Evidence-backed build story",
      summary: hasAnyField ? clean(pack.hero.summary, 1_200) : "Selected story components from the validated build record.",
    },
    buildArc: selected.has("storyBuildArc")
      ? pack.buildArc.map((phase) => ({ ...phase, headline: clean(phase.headline, 180), summary: clean(phase.summary), sourceRefs: refs(phase.sourceRefs) }))
      : [],
    moments: selected.has("storyMoments")
      ? pack.moments.map((moment) => ({ ...moment, title: clean(moment.title, 180), whatHappened: clean(moment.whatHappened), whyItMattered: clean(moment.whyItMattered), sourceRefs: refs(moment.sourceRefs) }))
      : [],
    turningPoint: selected.has("storyTurningPoint")
      ? { quote: clean(pack.turningPoint.quote, 500), sourceRefs: refs(pack.turningPoint.sourceRefs) }
      : { quote: "", sourceRefs: [] },
    decisions: selected.has("storyDecisions")
      ? pack.decisions.map((item) => ({ ...item, title: clean(item.title, 180), rationale: clean(item.rationale), outcome: clean(item.outcome), sourceRefs: refs(item.sourceRefs) }))
      : [],
    learnings: selected.has("storyLearnings")
      ? pack.learnings.map((item) => ({ ...item, title: clean(item.title, 180), detail: clean(item.detail), sourceRefs: refs(item.sourceRefs) }))
      : [],
    standoutTraits: selected.has("storyTraits")
      ? pack.standoutTraits.map((item) => ({ ...item, title: clean(item.title, 180), detail: clean(item.detail), sourceRefs: refs(item.sourceRefs) }))
      : [],
    // Empty, not a placeholder sentence: an unselected field must be indistinguishable from
    // "nothing here" so the public renderer can omit the section entirely, matching every
    // other gated-off field in this projection (empty arrays, "" strings). A prose placeholder
    // like "Private by default." would otherwise render as if it were real story content.
    growthEdge: selected.has("storyGrowthEdge")
      ? { title: clean(pack.growthEdge.title, 180), observation: clean(pack.growthEdge.observation), sourceRefs: refs(pack.growthEdge.sourceRefs) }
      : { title: "", observation: "", sourceRefs: [] },
  };
  const cleanFinding = (finding: StoryPackFinding): StoryPackFinding => ({
    title: clean(finding.title, 180),
    summary: clean(finding.summary, 900),
    sourceRefs: refs(finding.sourceRefs),
    confidence: finding.confidence,
  });
  const deep = pack.version === "3.0.0" ? pack.deepAnalysis : undefined;
  const hasDeepSelection = Boolean(deep && [
    "deepOpeningLine",
    "deepSignatureMoves",
    "deepByTheNumbers",
    "deepWhereItGotHard",
    "deepChapterChanges",
  ].some((field) => selected.has(field as PublicFieldKey)));
  const byTheNumbers = deep && selected.has("deepByTheNumbers") && deep.byTheNumbers
    ? deep.byTheNumbers.map((item) => ({ ...cleanFinding(item), signalId: item.signalId }))
    : [];
  const projection: ReportStoryPack = deep && hasDeepSelection
    ? {
        ...base,
        version: "3.0.0",
        analysisTier: (pack as ReportStoryPackV3).analysisTier,
        deepAnalysis: {
          openingLine: selected.has("deepOpeningLine") && deep.openingLine
            ? cleanFinding(deep.openingLine)
            : { title: "", summary: "", sourceRefs: [], confidence: "low" },
          signatureMoves: selected.has("deepSignatureMoves") ? (deep.signatureMoves ?? []).map(cleanFinding) : [],
          byTheNumbers,
          whereItGotHard: selected.has("deepWhereItGotHard") ? (deep.whereItGotHard ?? []).map(cleanFinding) : [],
          chapterChanges: selected.has("deepChapterChanges") ? (deep.chapterChanges ?? []).map(cleanFinding) : [],
          // Coverage is contextual provenance for any published deep finding.
          // It is called out in every deep-field review label in the UI.
          coverage: { ...deep.coverage },
        },
      } satisfies ReportStoryPackV3
    : base;
  const projectedDeep = projection.version === "3.0.0" ? projection.deepAnalysis : undefined;
  const usedSignalIds = new Set(byTheNumbers.map((item) => item.signalId));
  projection.signals = selected.has("storySignals")
    ? pack.signals
    : pack.signals.filter((signal) => usedSignalIds.has(signal.id));
  const usedRefs = new Set<string>([
    ...projection.buildArc.flatMap((item) => item.sourceRefs),
    ...projection.moments.flatMap((item) => item.sourceRefs),
    ...projection.turningPoint.sourceRefs,
    ...projection.decisions.flatMap((item) => item.sourceRefs),
    ...projection.learnings.flatMap((item) => item.sourceRefs),
    ...projection.standoutTraits.flatMap((item) => item.sourceRefs),
    ...projection.growthEdge.sourceRefs,
    ...projection.signals.flatMap((signal) => signal.sourceRefs),
    ...(projectedDeep ? [
      ...(projectedDeep.openingLine?.sourceRefs ?? []),
      ...(projectedDeep.signatureMoves ?? []).flatMap((item) => item.sourceRefs),
      ...(projectedDeep.byTheNumbers ?? []).flatMap((item) => item.sourceRefs),
      ...(projectedDeep.whereItGotHard ?? []).flatMap((item) => item.sourceRefs),
      ...(projectedDeep.chapterChanges ?? []).flatMap((item) => item.sourceRefs),
    ] : []),
  ]);
  projection.sources = pack.sources
    .filter((source) => usedRefs.has(source.ref))
    .map((source) => ({
      ref: source.ref,
      provider: source.provider,
      occurredAt: source.occurredAt,
      evidenceRefs: refs(source.evidenceRefs),
      metrics: source.metrics,
    }));
  return projection;
}

export type ArtifactMediaItem = { id: string; url: string; kind: "cover" | "screenshot" };
export type ArtifactLinksInput = {
  projectUrl?: string | null;
  repoUrl?: string | null;
  videoUrl?: string | null;
  media?: ArtifactMediaItem[];
};

export type PublicStoryVisualOptions = {
  storyBackgroundId?: StoryBackgroundId;
};

/**
 * Explicit publication boundary. Public routes receive this projection rather
 * than the source snapshot or full private report.
 */
export function publicBuildStoryFromSnapshot(
  snapshot: ProjectSnapshot,
  selectedPublicFields: PublicFieldKey[],
  editorial?: { tagline?: string; description?: string; reflection?: string; category?: StoryCategory | null },
  artifact?: ArtifactLinksInput,
  visual?: PublicStoryVisualOptions,
) {
  const story = buildStoryFromSnapshot(snapshot);
  const selected = new Set(selectedPublicFields);
  const publicName = sanitizePublicText(story.name, 160).value;
  const publicTagline = sanitizePublicText(editorial?.tagline ?? story.tagline, 300).value;
  const publicDescription = sanitizePublicText(
    editorial?.description ?? story.description,
    4_000,
  ).value;
  const publicReflection = editorial?.reflection
    ? sanitizePublicText(editorial.reflection, 260).value
    : "";
  const projectedStoryPack = story.narrative?.storyPack && hasAnyStoryPackField(selected)
    ? publicStoryPack(story.narrative.storyPack, selected)
    : null;
  const narrativeMetadataIsPublic = selected.has("narrative") || projectedStoryPack !== null;
  return {
    id: story.id,
    slug: story.slug,
    name: publicName,
    tagline: selected.has("tagline") ? publicTagline : "",
    description: selected.has("description") ? publicDescription : "",
    reflection: selected.has("description") ? publicReflection : "",
    category: editorial?.category ?? "other",
    storyBackgroundId: isStoryBackgroundId(visual?.storyBackgroundId)
      ? visual.storyBackgroundId
      : DEFAULT_STORY_BACKGROUND_ID,
    status: story.status,
    owner: {
      name: sanitizePublicText(story.owner.name, 160).value,
      handle: sanitizePublicText(story.owner.handle, 80).value,
      role: sanitizePublicText(story.owner.role, 160).value,
    },
    dateRange: selected.has("timeWindow") ? story.dateRange : "Private build window",
    activeDays: selected.has("timeWindow") ? story.activeDays : 0,
    sessionCount: selected.has("sessionSummary") ? story.sessionCount : 0,
    subagentCount: selected.has("sessionSummary") ? story.subagentCount : 0,
    buildHours: selected.has("sessionSummary") ? story.buildHours : 0,
    modelRequests: selected.has("modelMix") ? story.modelRequests : 0,
    models: selected.has("modelMix")
      ? story.models.map((model) =>
          // `share` is a cost percentage computed from real costMicroUsd
          // figures (see costShares above) - it must be withheld along with
          // tokenUsage/costMicroUsd whenever costEstimate isn't selected, or
          // an exact cost breakdown leaks through a mix-only receipt.
          selected.has("costEstimate") ? model : { ...model, tokenUsage: null, costMicroUsd: null, share: null },
        )
      : [],
    tokenUsage: selected.has("modelMix") ? story.tokenUsage : null,
    cost: selected.has("costEstimate") ? story.cost : null,
    // Coverage describes both a session count (sessionSummary) and a cost
    // caveat (costEstimate) - only show it when both are public, so it
    // never leaks a category the creator didn't select.
    coverage: selected.has("costEstimate") && selected.has("sessionSummary") ? story.coverage : null,
    tools: selected.has("toolUsage") ? story.tools : [],
    git: selected.has("gitAggregates")
      ? {
          commits: story.git.commits,
          additions: story.git.additions,
          deletions: story.git.deletions,
          filesTouched: story.git.filesTouched,
          branches: story.git.branches,
          contributors: story.git.contributors,
          firstCommitSha: "not-collected",
          lastCommitSha: "not-collected",
        }
      : {
          commits: 0,
          additions: 0,
          deletions: 0,
          filesTouched: 0,
          branches: 0,
          contributors: 0,
          firstCommitSha: "not-collected",
          lastCommitSha: "not-collected",
        },
    milestones: selected.has("milestones") ? story.milestones : [],
    redaction: {
      tokensRemoved: selected.has("redactionSummary") ? story.redaction.tokensRemoved : 0,
    },
    stack: story.stack,
    // Public receipts are stable but deliberately derived only from the already-public report ID.
    // The private receipt contains the HEAD revision and must never cross this boundary.
    receiptId: `BR-PUBLIC-${story.id.replace(/[^A-Za-z0-9]/g, "").slice(-12).toUpperCase()}`,
    profile: story.profile
      ? {
          scores: selected.has("profileScores") ? story.profile.scores : null,
          archetype: selected.has("archetype") ? story.profile.archetype : null,
          workPatterns: selected.has("workPatterns") ? story.profile.workPatterns : null,
        }
      : null,
    narrative: selected.has("narrative") && story.narrative
      ? {
          headline: sanitizePublicText(story.narrative.headline, NARRATIVE_FIELD_LIMITS.headline).value,
          narrative: sanitizePublicText(story.narrative.narrative, NARRATIVE_FIELD_LIMITS.narrative).value,
          turningPoint: sanitizePublicText(story.narrative.turningPoint, NARRATIVE_FIELD_LIMITS.turningPoint).value,
          learnings: story.narrative.learnings.map(
            (line) => sanitizePublicText(line, NARRATIVE_FIELD_LIMITS.learningItem).value,
          ),
          ...(story.narrative.fallbacksUsed?.length
            ? { fallbacksUsed: [...new Set(story.narrative.fallbacksUsed)].slice(0, 40) }
            : {}),
          ...(projectedStoryPack ? { storyPack: projectedStoryPack } : {}),
        }
      : null,
    fallbacksUsed: narrativeMetadataIsPublic && story.narrative?.fallbacksUsed?.length
      ? [...new Set(story.narrative.fallbacksUsed)].slice(0, 40)
      : [],
    storyPack: projectedStoryPack,
    // Report-level, independent of storyPack/narrative: computed facts need
    // no model, so they're the one section a facts-only ("off" narrative
    // mode) report can still publish. Gated by the same storySignals key
    // that gates pack.signals inside a story pack, for one consistent
    // meaning of "are computed facts public" regardless of whether a
    // narrative was ever generated.
    signals: selected.has("storySignals") ? story.signals : [],
    // Independently gated from storySignals: a creator may want the one
    // headline fact on the share card without exposing the full facts list
    // on the page itself. signals is already notability-sorted, so [0] is
    // always the single most notable computed fact.
    headlineFact: selected.has("signalHeadline") ? story.signals[0]?.headline ?? null : null,
    decisionPatterns: selected.has("decisionPatterns")
      ? (story.narrative?.decisionPatterns ?? []).map(
          (line) => sanitizePublicText(line, NARRATIVE_FIELD_LIMITS.decisionPatternItem).value,
        )
      : [],
    standoutTraits: selected.has("standoutTraits")
      ? (story.narrative?.standoutTraits ?? []).map(
          (line) => sanitizePublicText(line, NARRATIVE_FIELD_LIMITS.standoutTraitItem).value,
        )
      : [],
    growthEdge: selected.has("growthEdge") && story.narrative?.growthEdge
      ? sanitizePublicText(story.narrative.growthEdge, NARRATIVE_FIELD_LIMITS.growthEdge).value
      : "",
    artifactLinks: selected.has("artifactLinks")
      ? {
          projectUrl: safeHttpsUrl(artifact?.projectUrl),
          repoUrl: safeHttpsUrl(artifact?.repoUrl),
          videoUrl: safeHttpsUrl(artifact?.videoUrl),
        }
      : { projectUrl: null, repoUrl: null, videoUrl: null },
    artifactMedia: selected.has("artifactMedia") ? (artifact?.media ?? []) : [],
  };
}
