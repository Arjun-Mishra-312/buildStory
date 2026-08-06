import type {
  GeneratedNarrativeSections,
  ReportStoryPackV2,
  ScannerProjectSnapshot,
  StoryPackPhase,
  StoryPackSource,
} from "../ingestion/scanner-project-snapshot";
import { computeBuilderProfile } from "../ingestion/profile";
import { sanitizePublicText } from "../publication/sanitization";

export const STORY_PACK_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["hero", "buildArc", "moments", "turningPoint"],
  properties: {
    hero: { type: "object", additionalProperties: false, required: ["headline", "summary"], properties: { headline: { type: "string", minLength: 1, maxLength: 120 }, summary: { type: "string", minLength: 1, maxLength: 480 } } },
    buildArc: {
      type: "array", minItems: 3, maxItems: 3, items: {
        type: "object", additionalProperties: false, required: ["phase", "headline", "summary", "sourceRefs"],
        properties: { phase: { enum: ["discover", "decide", "deliver"] }, headline: { type: "string", minLength: 1, maxLength: 100 }, summary: { type: "string", minLength: 1, maxLength: 260 }, sourceRefs: { type: "array", minItems: 1, maxItems: 4, items: { type: "string", minLength: 1, maxLength: 40 } } },
      },
    },
    moments: {
      type: "array", minItems: 3, maxItems: 5, items: {
        type: "object", additionalProperties: false, required: ["phase", "kind", "title", "whatHappened", "whyItMattered", "sourceRefs"],
        properties: { phase: { enum: ["discover", "decide", "deliver"] }, kind: { enum: ["discovery", "decision", "breakthrough", "delivery"] }, title: { type: "string", minLength: 1, maxLength: 120 }, whatHappened: { type: "string", minLength: 1, maxLength: 400 }, whyItMattered: { type: "string", minLength: 1, maxLength: 400 }, sourceRefs: { type: "array", minItems: 1, maxItems: 4, items: { type: "string", minLength: 1, maxLength: 40 } } },
      },
    },
    turningPoint: { type: "object", additionalProperties: false, required: ["quote", "sourceRefs"], properties: { quote: { type: "string", minLength: 1, maxLength: 300 }, sourceRefs: { type: "array", minItems: 1, maxItems: 4, items: { type: "string", minLength: 1, maxLength: 40 } } } },
    decisions: { type: "array", minItems: 2, maxItems: 4, items: { type: "object", additionalProperties: false, required: ["title", "rationale", "outcome", "sourceRefs"], properties: { title: { type: "string", minLength: 1, maxLength: 120 }, rationale: { type: "string", minLength: 1, maxLength: 300 }, outcome: { type: "string", minLength: 1, maxLength: 300 }, sourceRefs: { type: "array", minItems: 1, maxItems: 4, items: { type: "string", minLength: 1, maxLength: 40 } } } } },
    learnings: { type: "array", minItems: 2, maxItems: 4, items: { type: "object", additionalProperties: false, required: ["title", "detail", "sourceRefs"], properties: { title: { type: "string", minLength: 1, maxLength: 120 }, detail: { type: "string", minLength: 1, maxLength: 300 }, sourceRefs: { type: "array", minItems: 1, maxItems: 4, items: { type: "string", minLength: 1, maxLength: 40 } } } } },
    standoutTraits: { type: "array", minItems: 2, maxItems: 4, items: { type: "object", additionalProperties: false, required: ["title", "detail", "sourceRefs"], properties: { title: { type: "string", minLength: 1, maxLength: 120 }, detail: { type: "string", minLength: 1, maxLength: 300 }, sourceRefs: { type: "array", minItems: 1, maxItems: 4, items: { type: "string", minLength: 1, maxLength: 40 } } } } },
    growthEdge: { type: "object", additionalProperties: false, required: ["title", "observation", "nextStep", "sourceRefs"], properties: { title: { type: "string", minLength: 1, maxLength: 120 }, observation: { type: "string", minLength: 1, maxLength: 400 }, nextStep: { type: "string", minLength: 1, maxLength: 300 }, sourceRefs: { type: "array", minItems: 1, maxItems: 4, items: { type: "string", minLength: 1, maxLength: 40 } } } },
  },
} as const;

export const STORY_PACK_STORY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["hero", "buildArc", "moments", "turningPoint"],
  properties: {
    hero: STORY_PACK_OUTPUT_SCHEMA.properties.hero,
    buildArc: STORY_PACK_OUTPUT_SCHEMA.properties.buildArc,
    moments: STORY_PACK_OUTPUT_SCHEMA.properties.moments,
    turningPoint: STORY_PACK_OUTPUT_SCHEMA.properties.turningPoint,
  },
} as const;

export const STORY_PACK_INSIGHTS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["decisions", "learnings", "standoutTraits", "growthEdge"],
  properties: {
    decisions: STORY_PACK_OUTPUT_SCHEMA.properties.decisions,
    learnings: STORY_PACK_OUTPUT_SCHEMA.properties.learnings,
    standoutTraits: STORY_PACK_OUTPUT_SCHEMA.properties.standoutTraits,
    growthEdge: STORY_PACK_OUTPUT_SCHEMA.properties.growthEdge,
  },
} as const;

function clean(value: unknown, max: number, fallback: string): string {
  const candidate = typeof value === "string" && value.trim() ? value.trim() : fallback;
  return sanitizePublicText(candidate, max).value || fallback;
}

function sourceRefs(value: unknown, allowed: Set<string>, fallback: string[]): string[] {
  const selected = Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === "string" && allowed.has(item)))].slice(0, 4) : [];
  return selected.length ? selected : fallback;
}

export function buildStoryPackSources(snapshot: ScannerProjectSnapshot): StoryPackSource[] {
  const evidenceBySession = new Map<string, string[]>();
  const excerptBySession = new Map<string, string>();
  for (const excerpt of snapshot.narrativeEvidence?.excerpts ?? []) {
    if (!excerptBySession.has(excerpt.sessionRef)) excerptBySession.set(excerpt.sessionRef, excerpt.excerptId);
  }
  snapshot.evidence.forEach((evidence) => { if (evidence.sessionRef) evidenceBySession.set(evidence.sessionRef, [...(evidenceBySession.get(evidence.sessionRef) ?? []), evidence.evidenceId]); });
  const sources: StoryPackSource[] = snapshot.sessions.slice().sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.sessionRef.localeCompare(b.sessionRef)).map((session, index) => ({
    ref: `S${String(index + 1).padStart(2, "0")}`,
    provider: session.provider,
    sessionRef: session.sessionRef,
    occurredAt: session.endedAt,
    evidenceRefs: [...new Set(evidenceBySession.get(session.sessionRef) ?? [])].sort(),
    ...(excerptBySession.has(session.sessionRef) ? { excerptRef: excerptBySession.get(session.sessionRef) } : {}),
    metrics: { turns: session.turns, assistantMessages: session.assistantMessages, toolCalls: session.toolCalls },
  } satisfies StoryPackSource));
  if (snapshot.git.commits > 0) sources.push({ ref: "GIT", provider: "git", occurredAt: snapshot.timeWindow.end, evidenceRefs: snapshot.evidence.filter((evidence) => evidence.source === "git").map((evidence) => evidence.evidenceId).sort(), metrics: { turns: 0, assistantMessages: 0, toolCalls: 0 } });
  return sources;
}

export function defaultStoryPack(snapshot: ScannerProjectSnapshot): ReportStoryPackV2 {
  const profile = computeBuilderProfile({ sessions: snapshot.sessions, usage: snapshot.usage, git: snapshot.git, timeWindow: snapshot.timeWindow });
  const sources = buildStoryPackSources(snapshot);
  const refs = sources.length ? [sources[0]!.ref] : [];
  const phases: Array<{ phase: StoryPackPhase; headline: string; summary: string }> = [
    { phase: "discover", headline: "Mapped the build surface", summary: `${snapshot.sessions.length} repository-scoped sessions established the observed build context.` },
    { phase: "decide", headline: "Turned signals into a path", summary: profile.archetype.rationale.join(" ").slice(0, 260) || "Observed activity was compared as an aggregate signal." },
    { phase: "deliver", headline: "Kept the loop moving", summary: `${snapshot.git.commits} commits and ${snapshot.usage.totalToolCalls} tool calls mark the recorded delivery cadence.` },
  ];
  const fallbackInsight = { title: "Evidence-bound observation", detail: "This component is metric-derived because no valid model-written result was available.", sourceRefs: refs };
  return {
    version: "2.0.0", sources,
    hero: { headline: profile.archetype.name, summary: `A content-free report of ${snapshot.sessions.length} sessions and ${snapshot.git.commits} commits in the selected window.` },
    buildArc: phases.map((phase) => ({ ...phase, sourceRefs: refs })),
    moments: phases.map((phase, index) => ({ phase: phase.phase, kind: phase.phase === "discover" ? "discovery" : phase.phase === "decide" ? "decision" : "delivery", title: phase.headline, whatHappened: phase.summary, whyItMattered: "Metric-derived fallback; no model-written moment was available.", sourceRefs: sources[index]?.ref ? [sources[index]!.ref] : refs })),
    turningPoint: { quote: "The observed work shifted from exploration toward delivery.", sourceRefs: refs },
    decisions: [{ title: "Use the observed execution path", rationale: profile.archetype.rationale.join(" ").slice(0, 300), outcome: "The report preserves the deterministic evidence trail.", sourceRefs: refs }, { title: "Keep claims tied to evidence", rationale: "Source references are validated before display.", outcome: "Unsupported model claims are omitted or marked as fallbacks.", sourceRefs: refs }],
    learnings: [fallbackInsight, { title: "Keep evidence close to the claim", detail: "Every story component should resolve to a known session or repository aggregate.", sourceRefs: refs }],
    standoutTraits: [fallbackInsight, { title: profile.archetype.name, detail: profile.archetype.rationale.join(" ").slice(0, 300), sourceRefs: refs }],
    growthEdge: { title: "Prepare the next decision earlier", observation: "Planning and steering scores are proxies derived from observable session signals.", nextStep: "Review the evidence before treating the profile as a personal conclusion.", sourceRefs: refs },
  };
}

export function normalizeStoryPack(value: unknown, snapshot: ScannerProjectSnapshot): { storyPack: ReportStoryPackV2; fallbacksUsed: string[] } {
  const fallback = defaultStoryPack(snapshot);
  const candidate = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const allowed = new Set(fallback.sources.map((source) => source.ref));
  const fallbacks: string[] = [];
  const item = (value: unknown) => value && typeof value === "object" ? value as Record<string, unknown> : {};
  const hero = item(candidate.hero);
  const arcInput = Array.isArray(candidate.buildArc) ? candidate.buildArc : [];
  const buildArc = (['discover', 'decide', 'deliver'] as const).map((phase) => {
    const raw = item(arcInput.find((entry) => item(entry).phase === phase));
    const base = fallback.buildArc.find((entry) => entry.phase === phase)!;
    return { phase, headline: clean(raw.headline, 100, base.headline), summary: clean(raw.summary, 260, base.summary), sourceRefs: sourceRefs(raw.sourceRefs, allowed, base.sourceRefs) };
  });
  const rawMoments = Array.isArray(candidate.moments) ? candidate.moments : [];
  const moments = rawMoments.slice(0, 5).map((entry, index) => {
    const raw = item(entry); const base = fallback.moments[index % fallback.moments.length]!;
    return { phase: raw.phase === "discover" || raw.phase === "decide" || raw.phase === "deliver" ? raw.phase : base.phase, kind: raw.kind === "discovery" || raw.kind === "decision" || raw.kind === "breakthrough" || raw.kind === "delivery" ? raw.kind : base.kind, title: clean(raw.title, 120, base.title), whatHappened: clean(raw.whatHappened, 400, base.whatHappened), whyItMattered: clean(raw.whyItMattered, 400, base.whyItMattered), sourceRefs: sourceRefs(raw.sourceRefs, allowed, base.sourceRefs) };
  });
  if (moments.length < 3) { fallbacks.push("moments"); moments.push(...fallback.moments.slice(moments.length, 3)); }
  const decisions = (Array.isArray(candidate.decisions) ? candidate.decisions : []).slice(0, 4).map((entry, index) => { const raw = item(entry); const base = fallback.decisions[index % fallback.decisions.length]!; return { title: clean(raw.title, 120, base.title), rationale: clean(raw.rationale, 300, base.rationale), outcome: clean(raw.outcome, 300, base.outcome), sourceRefs: sourceRefs(raw.sourceRefs, allowed, base.sourceRefs) }; });
  if (decisions.length < 2) { fallbacks.push("decisions"); decisions.push(...fallback.decisions.slice(decisions.length, 2)); }
  const insightList = (name: "learnings" | "standoutTraits") => { const result = (Array.isArray(candidate[name]) ? candidate[name] : []).slice(0, 4).map((entry, index) => { const raw = item(entry); const base = fallback[name][index % fallback[name].length]!; return { title: clean(raw.title, 120, base.title), detail: clean(raw.detail, 300, base.detail), sourceRefs: sourceRefs(raw.sourceRefs, allowed, base.sourceRefs) }; }); if (result.length < 2) { fallbacks.push(name); result.push(...fallback[name].slice(result.length, 2)); } return result; };
  const turning = item(candidate.turningPoint); const growth = item(candidate.growthEdge);
  return { storyPack: { version: "2.0.0", sources: fallback.sources, hero: { headline: clean(hero.headline, 120, fallback.hero.headline), summary: clean(hero.summary, 480, fallback.hero.summary) }, buildArc, moments, turningPoint: { quote: clean(turning.quote, 300, fallback.turningPoint.quote), sourceRefs: sourceRefs(turning.sourceRefs, allowed, fallback.turningPoint.sourceRefs) }, decisions, learnings: insightList("learnings"), standoutTraits: insightList("standoutTraits"), growthEdge: { title: clean(growth.title, 120, fallback.growthEdge.title), observation: clean(growth.observation, 400, fallback.growthEdge.observation), nextStep: clean(growth.nextStep, 300, fallback.growthEdge.nextStep), sourceRefs: sourceRefs(growth.sourceRefs, allowed, fallback.growthEdge.sourceRefs) } }, fallbacksUsed: [...new Set(fallbacks)].sort() };
}

export function sectionsFromStoryPack(pack: ReportStoryPackV2): GeneratedNarrativeSections {
  return { headline: pack.hero.headline, narrative: pack.hero.summary, turningPoint: pack.turningPoint.quote, learnings: pack.learnings.map((item) => `${item.title}: ${item.detail}`), decisionPatterns: pack.decisions.map((item) => `${item.title}: ${item.rationale} ${item.outcome}`), standoutTraits: pack.standoutTraits.map((item) => `${item.title}: ${item.detail}`), growthEdge: `${pack.growthEdge.observation} ${pack.growthEdge.nextStep}` };
}
