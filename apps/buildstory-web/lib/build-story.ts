import type { ProjectSnapshot } from "./project-snapshot";
import type { PublicFieldKey, StoryCategory } from "./ingestion/contracts";
import type { ReportStoryPackV2 } from "./ingestion/scanner-project-snapshot";
import { NARRATIVE_FIELD_LIMITS } from "./narrative/schema";
import { sanitizePublicText } from "./publication/sanitization";
import { DEFAULT_STORY_BACKGROUND_ID, isStoryBackgroundId, type StoryBackgroundId } from "./background-options";

export type BuildStoryViewModel = ReturnType<typeof buildStoryFromSnapshot>;
export type PublicBuildStoryViewModel = ReturnType<typeof publicBuildStoryFromSnapshot>;

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
    narrative: snapshot.narrative ?? null,
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

function publicStoryPack(
  pack: ReportStoryPackV2,
  selected: Set<PublicFieldKey>,
): ReportStoryPackV2 {
  const clean = (value: string, max = 900) => sanitizePublicText(value, max).value;
  const refs = (value: string[]) => [...new Set(value)].slice(0, 4);
  const includeAll = selected.has("narrative");
  return {
    version: "2.0.0",
    sources: pack.sources.map((source) => ({
      ref: source.ref,
      provider: source.provider,
      occurredAt: source.occurredAt,
      evidenceRefs: refs(source.evidenceRefs),
      metrics: source.metrics,
    })),
    hero: {
      headline: includeAll ? clean(pack.hero.headline, 160) : "Evidence-backed build story",
      summary: includeAll ? clean(pack.hero.summary, 1_200) : "Selected story components from the validated build record.",
    },
    buildArc: selected.has("storyBuildArc") || includeAll
      ? pack.buildArc.map((phase) => ({ ...phase, headline: clean(phase.headline, 180), summary: clean(phase.summary), sourceRefs: refs(phase.sourceRefs) }))
      : [],
    moments: selected.has("storyMoments") || includeAll
      ? pack.moments.map((moment) => ({ ...moment, title: clean(moment.title, 180), whatHappened: clean(moment.whatHappened), whyItMattered: clean(moment.whyItMattered), sourceRefs: refs(moment.sourceRefs) }))
      : [],
    turningPoint: selected.has("storyTurningPoint") || includeAll
      ? { quote: clean(pack.turningPoint.quote, 500), sourceRefs: refs(pack.turningPoint.sourceRefs) }
      : { quote: "", sourceRefs: [] },
    decisions: selected.has("storyDecisions") || includeAll
      ? pack.decisions.map((item) => ({ ...item, title: clean(item.title, 180), rationale: clean(item.rationale), outcome: clean(item.outcome), sourceRefs: refs(item.sourceRefs) }))
      : [],
    learnings: selected.has("storyLearnings") || includeAll
      ? pack.learnings.map((item) => ({ ...item, title: clean(item.title, 180), detail: clean(item.detail), sourceRefs: refs(item.sourceRefs) }))
      : [],
    standoutTraits: selected.has("storyTraits") || includeAll
      ? pack.standoutTraits.map((item) => ({ ...item, title: clean(item.title, 180), detail: clean(item.detail), sourceRefs: refs(item.sourceRefs) }))
      : [],
    growthEdge: selected.has("storyGrowthEdge") || selected.has("growthEdge") || includeAll
      ? { ...pack.growthEdge, title: clean(pack.growthEdge.title, 180), observation: clean(pack.growthEdge.observation), nextStep: clean(pack.growthEdge.nextStep), sourceRefs: refs(pack.growthEdge.sourceRefs) }
      : { title: "Growth edge", observation: "Private by default.", nextStep: "Enable this field to publish an actionable next step.", sourceRefs: [] },
  };
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
          selected.has("costEstimate") ? model : { ...model, tokenUsage: null, costMicroUsd: null },
        )
      : [],
    tokenUsage: selected.has("modelMix") ? story.tokenUsage : null,
    cost: selected.has("costEstimate") ? story.cost : null,
    tools: selected.has("toolUsage") ? story.tools : [],
    git: selected.has("gitAggregates")
      ? story.git
      : { ...story.git, commits: 0, additions: 0, deletions: 0, filesTouched: 0, branches: 0 },
    milestones: selected.has("milestones") ? story.milestones : [],
    redaction: {
      tokensRemoved: selected.has("redactionSummary") ? story.redaction.tokensRemoved : 0,
    },
    stack: story.stack,
    receiptId: story.receiptId,
    profile: selected.has("archetype") || selected.has("profileScores") || selected.has("workPatterns")
      ? story.profile
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
          ...(story.narrative.storyPack ? { storyPack: publicStoryPack(story.narrative.storyPack, selected) } : {}),
        }
      : null,
    fallbacksUsed: story.narrative?.fallbacksUsed?.length
      ? [...new Set(story.narrative.fallbacksUsed)].slice(0, 40)
      : [],
    storyPack: story.narrative?.storyPack && (selected.has("narrative") || ["storyBuildArc", "storyMoments", "storyTurningPoint", "storyDecisions", "storyLearnings", "storyTraits", "storyGrowthEdge"].some((field) => selected.has(field as PublicFieldKey)))
      ? publicStoryPack(story.narrative.storyPack, selected)
      : null,
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
