import type {
  GeneratedNarrativeSections,
  ReportStoryPack,
  ReportStoryPackV2,
  ReportStoryPackV3,
  ScannerProjectSnapshot,
  StoryPackConfidence,
  StoryPackFinding,
  StoryPackRecommendation,
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

const STORY_PACK_FINDING_SCHEMA = {
  type: "object", additionalProperties: false, required: ["title", "summary", "sourceRefs", "confidence"],
  properties: {
    title: { type: "string", minLength: 1, maxLength: 120 },
    summary: { type: "string", minLength: 1, maxLength: 600 },
    sourceRefs: { type: "array", minItems: 1, maxItems: 6, items: { type: "string", minLength: 1, maxLength: 40 } },
    confidence: { enum: ["high", "medium", "low"] },
  },
} as const;

const STORY_PACK_RECOMMENDATION_SCHEMA = {
  type: "object", additionalProperties: false, required: ["title", "summary", "sourceRefs", "confidence", "priority", "rationale"],
  properties: {
    ...STORY_PACK_FINDING_SCHEMA.properties,
    priority: { enum: ["now", "next", "later"] },
    rationale: { type: "string", minLength: 1, maxLength: 600 },
  },
} as const;

export const STORY_PACK_DEEP_ANALYSIS_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["executiveSynthesis", "decisionReview", "frictionAndRecovery", "engineeringPatterns", "risksAndEvidenceGaps", "nextBuildActions", "chapterChanges"],
  properties: {
    executiveSynthesis: STORY_PACK_FINDING_SCHEMA,
    decisionReview: { type: "array", maxItems: 8, items: STORY_PACK_FINDING_SCHEMA },
    frictionAndRecovery: { type: "array", maxItems: 6, items: STORY_PACK_FINDING_SCHEMA },
    engineeringPatterns: { type: "array", maxItems: 6, items: STORY_PACK_FINDING_SCHEMA },
    risksAndEvidenceGaps: { type: "array", maxItems: 5, items: STORY_PACK_FINDING_SCHEMA },
    nextBuildActions: { type: "array", maxItems: 6, items: STORY_PACK_RECOMMENDATION_SCHEMA },
    chapterChanges: { type: "array", maxItems: 5, items: STORY_PACK_FINDING_SCHEMA },
  },
} as const;

export const STORY_PACK_DEEP_OUTPUT_SCHEMA = {
  ...STORY_PACK_OUTPUT_SCHEMA,
  required: ["hero", "buildArc", "moments", "turningPoint", "decisions", "learnings", "standoutTraits", "growthEdge", "deepAnalysis"],
  properties: {
    ...STORY_PACK_OUTPUT_SCHEMA.properties,
    moments: { ...STORY_PACK_OUTPUT_SCHEMA.properties.moments, maxItems: 12 },
    deepAnalysis: STORY_PACK_DEEP_ANALYSIS_SCHEMA,
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

export type StoryPackComponent = "story" | "insights" | "deep";

export type StoryPackValidation = {
  ok: boolean;
  errors: string[];
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringError(value: unknown, path: string, min: number, max: number): string | null {
  if (typeof value !== "string") return `${path} must be a string.`;
  const length = value.trim().length;
  if (length < min) return `${path} must contain at least ${min} character${min === 1 ? "" : "s"}.`;
  if (length > max) return `${path} must contain at most ${max} characters.`;
  return null;
}

function refsError(value: unknown, path: string, allowed: Set<string>): string[] {
  if (!Array.isArray(value)) return [`${path} must be an array.`];
  const errors: string[] = [];
  if (allowed.size > 0 && value.length < 1) errors.push(`${path} must contain at least one source reference.`);
  if (value.length > 4) errors.push(`${path} must contain at most four source references.`);
  const seen = new Set<string>();
  value.forEach((item, index) => {
    if (typeof item !== "string" || !item.trim()) errors.push(`${path}[${index}] must be a non-empty string.`);
    else if (!allowed.has(item)) errors.push(`${path}[${index}] references unknown source ${item}.`);
    else if (seen.has(item)) errors.push(`${path}[${index}] duplicates source ${item}.`);
    else seen.add(item);
  });
  return errors;
}

function listError(value: unknown, path: string, min: number, max: number): string[] {
  if (!Array.isArray(value)) return [`${path} must be an array.`];
  const errors: string[] = [];
  if (value.length < min) errors.push(`${path} must contain at least ${min} items.`);
  if (value.length > max) errors.push(`${path} must contain at most ${max} items.`);
  return errors;
}

function validateStoryComponent(value: Record<string, unknown>, allowed: Set<string>, maxMoments = 5): string[] {
  // Keep the bounded rollout compatibility path for older providers that
  // still return the pre-V2 flat section names. They are normalized into the
  // structured pack immediately after this check and never reach storage as
  // unvalidated layout/content instructions.
  if (!value.hero && ("headline" in value || "narrative" in value || typeof value.turningPoint === "string")) return [];
  const errors: string[] = [];
  const hero = record(value.hero);
  if (!hero) errors.push("hero must be an object.");
  else {
    const headline = stringError(hero.headline, "hero.headline", 1, 120); if (headline) errors.push(headline);
    const summary = stringError(hero.summary, "hero.summary", 1, 480); if (summary) errors.push(summary);
  }
  const arc = value.buildArc;
  errors.push(...listError(arc, "buildArc", 3, 3));
  if (Array.isArray(arc)) {
    const phases = arc.map((item) => record(item)?.phase);
    if (new Set(phases).size !== 3 || !(["discover", "decide", "deliver"] as const).every((phase) => phases.includes(phase))) {
      errors.push("buildArc must contain exactly one discover, decide, and deliver phase.");
    }
    arc.forEach((item, index) => {
      const entry = record(item); const path = `buildArc[${index}]`;
      if (!entry) { errors.push(`${path} must be an object.`); return; }
      if (!["discover", "decide", "deliver"].includes(String(entry.phase))) errors.push(`${path}.phase is unsupported.`);
      const headline = stringError(entry.headline, `${path}.headline`, 1, 100); if (headline) errors.push(headline);
      const summary = stringError(entry.summary, `${path}.summary`, 1, 260); if (summary) errors.push(summary);
      errors.push(...refsError(entry.sourceRefs, `${path}.sourceRefs`, allowed));
    });
  }
  errors.push(...listError(value.moments, "moments", 3, maxMoments));
  if (Array.isArray(value.moments)) value.moments.forEach((item, index) => {
    const entry = record(item); const path = `moments[${index}]`;
    if (!entry) { errors.push(`${path} must be an object.`); return; }
    if (!["discover", "decide", "deliver"].includes(String(entry.phase))) errors.push(`${path}.phase is unsupported.`);
    if (!["discovery", "decision", "breakthrough", "delivery"].includes(String(entry.kind))) errors.push(`${path}.kind is unsupported.`);
    for (const [key, max] of [["title", 120], ["whatHappened", 400], ["whyItMattered", 400]] as const) {
      const issue = stringError(entry[key], `${path}.${key}`, 1, max); if (issue) errors.push(issue);
    }
    errors.push(...refsError(entry.sourceRefs, `${path}.sourceRefs`, allowed));
  });
  const turning = record(value.turningPoint);
  if (!turning) errors.push("turningPoint must be an object.");
  else {
    const quote = stringError(turning.quote, "turningPoint.quote", 1, 300); if (quote) errors.push(quote);
    errors.push(...refsError(turning.sourceRefs, "turningPoint.sourceRefs", allowed));
  }
  return errors;
}

function validateInsightsComponent(value: Record<string, unknown>, allowed: Set<string>): string[] {
  if (!value.decisions && ("decisionPatterns" in value || "standoutTraits" in value || typeof value.growthEdge === "string")) return [];
  const errors: string[] = [];
  const decisions = value.decisions;
  errors.push(...listError(decisions, "decisions", 2, 4));
  if (Array.isArray(decisions)) decisions.forEach((item, index) => {
    const entry = record(item); const path = `decisions[${index}]`;
    if (!entry) { errors.push(`${path} must be an object.`); return; }
    for (const [key, max] of [["title", 120], ["rationale", 300], ["outcome", 300]] as const) {
      const issue = stringError(entry[key], `${path}.${key}`, 1, max); if (issue) errors.push(issue);
    }
    errors.push(...refsError(entry.sourceRefs, `${path}.sourceRefs`, allowed));
  });
  for (const name of ["learnings", "standoutTraits"] as const) {
    const list = value[name];
    errors.push(...listError(list, name, 2, 4));
    if (Array.isArray(list)) list.forEach((item, index) => {
      const entry = record(item); const path = `${name}[${index}]`;
      if (!entry) { errors.push(`${path} must be an object.`); return; }
      const title = stringError(entry.title, `${path}.title`, 1, 120); if (title) errors.push(title);
      const detail = stringError(entry.detail, `${path}.detail`, 1, 300); if (detail) errors.push(detail);
      errors.push(...refsError(entry.sourceRefs, `${path}.sourceRefs`, allowed));
    });
  }
  const growth = record(value.growthEdge);
  if (!growth) errors.push("growthEdge must be an object.");
  else {
    for (const [key, max] of [["title", 120], ["observation", 400], ["nextStep", 300]] as const) {
      const issue = stringError(growth[key], `growthEdge.${key}`, 1, max); if (issue) errors.push(issue);
    }
    errors.push(...refsError(growth.sourceRefs, "growthEdge.sourceRefs", allowed));
  }
  return errors;
}

function validateFinding(value: unknown, path: string, allowed: Set<string>, recommendation = false): string[] {
  const entry = record(value);
  if (!entry) return [`${path} must be an object.`];
  const errors: string[] = [];
  const title = stringError(entry.title, `${path}.title`, 1, 120); if (title) errors.push(title);
  const summary = stringError(entry.summary, `${path}.summary`, 1, 600); if (summary) errors.push(summary);
  if (!["high", "medium", "low"].includes(String(entry.confidence))) errors.push(`${path}.confidence is unsupported.`);
  errors.push(...refsError(entry.sourceRefs, `${path}.sourceRefs`, allowed));
  if (recommendation) {
    if (!["now", "next", "later"].includes(String(entry.priority))) errors.push(`${path}.priority is unsupported.`);
    const rationale = stringError(entry.rationale, `${path}.rationale`, 1, 600); if (rationale) errors.push(rationale);
  }
  return errors;
}

function validateDeepComponent(value: Record<string, unknown>, allowed: Set<string>, includeBase = true): string[] {
  const errors = includeBase ? [...validateStoryComponent(value, allowed, 12), ...validateInsightsComponent(value, allowed)] : [];
  const deep = record(value.deepAnalysis);
  if (!deep) return [...errors, "deepAnalysis must be an object."];
  errors.push(...validateFinding(deep.executiveSynthesis, "deepAnalysis.executiveSynthesis", allowed));
  for (const [name, max, recommendation] of [
    ["decisionReview", 8, false],
    ["frictionAndRecovery", 6, false],
    ["engineeringPatterns", 6, false],
    ["risksAndEvidenceGaps", 5, false],
    ["nextBuildActions", 6, true],
    ["chapterChanges", 5, false],
  ] as const) {
    const entries = deep[name];
    errors.push(...listError(entries, `deepAnalysis.${name}`, 0, max));
    if (Array.isArray(entries)) entries.forEach((entry, index) => errors.push(...validateFinding(entry, `deepAnalysis.${name}[${index}]`, allowed, recommendation)));
  }
  return errors;
}

export function validateDeepAnalysisComponent(value: unknown, allowedRefs: Set<string>): StoryPackValidation {
  const candidate = record(value);
  if (!candidate) return { ok: false, errors: ["response must be a JSON object."] };
  const errors = validateDeepComponent({ deepAnalysis: candidate }, allowedRefs, false);
  return { ok: errors.length === 0, errors: errors.slice(0, 20) };
}

/**
 * Post-generation validation shared by the cloud repair loop and the local
 * Ollama path. The API schema catches transport-level violations; this
 * validator additionally verifies source provenance and component cardinality
 * before normalization can produce a report.
 */
export function validateStoryPackComponent(value: unknown, component: StoryPackComponent, allowedRefs: Set<string>): StoryPackValidation {
  const candidate = record(value);
  if (!candidate) return { ok: false, errors: ["response must be a JSON object."] };
  const errors = component === "story"
    ? validateStoryComponent(candidate, allowedRefs)
    : component === "insights"
      ? validateInsightsComponent(candidate, allowedRefs)
      : validateDeepComponent(candidate, allowedRefs);
  return { ok: errors.length === 0, errors: errors.slice(0, 20) };
}

function clean(path: string, value: unknown, max: number, fallback: string, fallbacks: string[]): string {
  const candidate = typeof value === "string" && value.trim() ? value.trim() : "";
  const sanitized = candidate ? sanitizePublicText(candidate, max).value : "";
  if (!sanitized) {
    fallbacks.push(path);
    return fallback;
  }
  return sanitized;
}

function sourceRefs(path: string, value: unknown, allowed: Set<string>, fallback: string[], fallbacks: string[]): string[] {
  const selected = Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === "string" && allowed.has(item)))].slice(0, 4) : [];
  if (!selected.length) {
    fallbacks.push(path);
    return fallback;
  }
  return selected;
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
    return { phase, headline: clean(`buildArc.${phase}.headline`, raw.headline, 100, base.headline, fallbacks), summary: clean(`buildArc.${phase}.summary`, raw.summary, 260, base.summary, fallbacks), sourceRefs: sourceRefs(`buildArc.${phase}.sourceRefs`, raw.sourceRefs, allowed, base.sourceRefs, fallbacks) };
  });
  const rawMoments = Array.isArray(candidate.moments) ? candidate.moments : [];
  const moments = rawMoments.slice(0, 5).map((entry, index) => {
    const raw = item(entry); const base = fallback.moments[index % fallback.moments.length]!;
    return { phase: raw.phase === "discover" || raw.phase === "decide" || raw.phase === "deliver" ? raw.phase : base.phase, kind: raw.kind === "discovery" || raw.kind === "decision" || raw.kind === "breakthrough" || raw.kind === "delivery" ? raw.kind : base.kind, title: clean(`moments.${index}.title`, raw.title, 120, base.title, fallbacks), whatHappened: clean(`moments.${index}.whatHappened`, raw.whatHappened, 400, base.whatHappened, fallbacks), whyItMattered: clean(`moments.${index}.whyItMattered`, raw.whyItMattered, 400, base.whyItMattered, fallbacks), sourceRefs: sourceRefs(`moments.${index}.sourceRefs`, raw.sourceRefs, allowed, base.sourceRefs, fallbacks) };
  });
  if (moments.length < 3) { fallbacks.push("moments"); moments.push(...fallback.moments.slice(moments.length, 3)); }
  const decisions = (Array.isArray(candidate.decisions) ? candidate.decisions : []).slice(0, 4).map((entry, index) => { const raw = item(entry); const base = fallback.decisions[index % fallback.decisions.length]!; return { title: clean(`decisions.${index}.title`, raw.title, 120, base.title, fallbacks), rationale: clean(`decisions.${index}.rationale`, raw.rationale, 300, base.rationale, fallbacks), outcome: clean(`decisions.${index}.outcome`, raw.outcome, 300, base.outcome, fallbacks), sourceRefs: sourceRefs(`decisions.${index}.sourceRefs`, raw.sourceRefs, allowed, base.sourceRefs, fallbacks) }; });
  if (decisions.length < 2) { fallbacks.push("decisions"); decisions.push(...fallback.decisions.slice(decisions.length, 2)); }
  const insightList = (name: "learnings" | "standoutTraits") => { const result = (Array.isArray(candidate[name]) ? candidate[name] : []).slice(0, 4).map((entry, index) => { const raw = item(entry); const base = fallback[name][index % fallback[name].length]!; return { title: clean(`${name}.${index}.title`, raw.title, 120, base.title, fallbacks), detail: clean(`${name}.${index}.detail`, raw.detail, 300, base.detail, fallbacks), sourceRefs: sourceRefs(`${name}.${index}.sourceRefs`, raw.sourceRefs, allowed, base.sourceRefs, fallbacks) }; }); if (result.length < 2) { fallbacks.push(name); result.push(...fallback[name].slice(result.length, 2)); } return result; };
  const turning = item(candidate.turningPoint); const growth = item(candidate.growthEdge);
  return { storyPack: { version: "2.0.0", sources: fallback.sources, hero: { headline: clean("hero.headline", hero.headline, 120, fallback.hero.headline, fallbacks), summary: clean("hero.summary", hero.summary, 480, fallback.hero.summary, fallbacks) }, buildArc, moments, turningPoint: { quote: clean("turningPoint.quote", turning.quote, 300, fallback.turningPoint.quote, fallbacks), sourceRefs: sourceRefs("turningPoint.sourceRefs", turning.sourceRefs, allowed, fallback.turningPoint.sourceRefs, fallbacks) }, decisions, learnings: insightList("learnings"), standoutTraits: insightList("standoutTraits"), growthEdge: { title: clean("growthEdge.title", growth.title, 120, fallback.growthEdge.title, fallbacks), observation: clean("growthEdge.observation", growth.observation, 400, fallback.growthEdge.observation, fallbacks), nextStep: clean("growthEdge.nextStep", growth.nextStep, 300, fallback.growthEdge.nextStep, fallbacks), sourceRefs: sourceRefs("growthEdge.sourceRefs", growth.sourceRefs, allowed, fallback.growthEdge.sourceRefs, fallbacks) } }, fallbacksUsed: [...new Set(fallbacks)].sort() };
}

export function normalizeDeepStoryPack(value: unknown, snapshot: ScannerProjectSnapshot): { storyPack: ReportStoryPackV3; fallbacksUsed: string[] } {
  const normalized = normalizeStoryPack(value, snapshot);
  const candidate = record(value) ?? {};
  const deep = record(candidate.deepAnalysis) ?? {};
  const allowed = new Set(normalized.storyPack.sources.map((source) => source.ref));
  const fallbacks = [...normalized.fallbacksUsed];
  const fallbackRefs = normalized.storyPack.sources[0]?.ref ? [normalized.storyPack.sources[0].ref] : [];
  const refs = (path: string, input: unknown) => sourceRefs(path, input, allowed, fallbackRefs, fallbacks).slice(0, 6);
  const confidence = (input: unknown): StoryPackConfidence => input === "high" || input === "medium" || input === "low" ? input : "low";
  const finding = (input: unknown, path: string): StoryPackFinding => {
    const raw = record(input) ?? {};
    return {
      title: clean(`${path}.title`, raw.title, 120, "Evidence-bound observation", fallbacks),
      summary: clean(`${path}.summary`, raw.summary, 600, "The selected evidence was insufficient for a stronger claim.", fallbacks),
      sourceRefs: refs(`${path}.sourceRefs`, raw.sourceRefs),
      confidence: confidence(raw.confidence),
    };
  };
  const findings = (name: "decisionReview" | "frictionAndRecovery" | "engineeringPatterns" | "risksAndEvidenceGaps" | "chapterChanges", max: number) =>
    (Array.isArray(deep[name]) ? deep[name] : []).slice(0, max).map((entry, index) => finding(entry, `deepAnalysis.${name}.${index}`));
  const nextBuildActions: StoryPackRecommendation[] = (Array.isArray(deep.nextBuildActions) ? deep.nextBuildActions : []).slice(0, 6).map((entry, index) => {
    const raw = record(entry) ?? {};
    return {
      ...finding(entry, `deepAnalysis.nextBuildActions.${index}`),
      priority: raw.priority === "now" || raw.priority === "next" || raw.priority === "later" ? raw.priority : "next",
      rationale: clean(`deepAnalysis.nextBuildActions.${index}.rationale`, raw.rationale, 600, "Follow up where the current evidence is weakest.", fallbacks),
    };
  });
  const evidenceBytes = (snapshot.narrativeEvidence?.excerpts ?? []).reduce((sum, excerpt) => sum + new TextEncoder().encode(excerpt.text).byteLength, 0);
  return {
    storyPack: {
      ...normalized.storyPack,
      version: "3.0.0",
      analysisTier: "deep",
      moments: Array.isArray(candidate.moments)
        ? (candidate.moments as unknown[]).slice(0, 12).map((entry, index) => {
            const raw = record(entry) ?? {};
            const base = normalized.storyPack.moments[index % normalized.storyPack.moments.length] ?? normalized.storyPack.moments[0]!;
            return {
              phase: raw.phase === "discover" || raw.phase === "decide" || raw.phase === "deliver" ? raw.phase : base.phase,
              kind: raw.kind === "discovery" || raw.kind === "decision" || raw.kind === "breakthrough" || raw.kind === "delivery" ? raw.kind : base.kind,
              title: clean(`moments.${index}.title`, raw.title, 120, base.title, fallbacks),
              whatHappened: clean(`moments.${index}.whatHappened`, raw.whatHappened, 400, base.whatHappened, fallbacks),
              whyItMattered: clean(`moments.${index}.whyItMattered`, raw.whyItMattered, 400, base.whyItMattered, fallbacks),
              sourceRefs: refs(`moments.${index}.sourceRefs`, raw.sourceRefs),
            };
          })
        : normalized.storyPack.moments,
      deepAnalysis: {
        executiveSynthesis: finding(deep.executiveSynthesis, "deepAnalysis.executiveSynthesis"),
        decisionReview: findings("decisionReview", 8),
        frictionAndRecovery: findings("frictionAndRecovery", 6),
        engineeringPatterns: findings("engineeringPatterns", 6),
        risksAndEvidenceGaps: findings("risksAndEvidenceGaps", 5),
        nextBuildActions,
        chapterChanges: findings("chapterChanges", 5),
        coverage: {
          sessionsSeen: snapshot.sessions.length,
          excerptsUsed: snapshot.narrativeEvidence?.excerpts.length ?? 0,
          evidenceBytes,
          windowStart: snapshot.timeWindow.start,
          windowEnd: snapshot.timeWindow.end,
        },
      },
    },
    fallbacksUsed: [...new Set(fallbacks)].sort(),
  };
}

export function sectionsFromStoryPack(pack: ReportStoryPack): GeneratedNarrativeSections {
  return { headline: pack.hero.headline, narrative: pack.hero.summary, turningPoint: pack.turningPoint.quote, learnings: pack.learnings.map((item) => `${item.title}: ${item.detail}`), decisionPatterns: pack.decisions.map((item) => `${item.title}: ${item.rationale} ${item.outcome}`), standoutTraits: pack.standoutTraits.map((item) => `${item.title}: ${item.detail}`), growthEdge: `${pack.growthEdge.observation} ${pack.growthEdge.nextStep}` };
}
