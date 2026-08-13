import type { AnalysisTier, NarrativeExcerpt, ReportStoryPack, ScannerProjectSnapshot, StoryPackPhase } from "../ingestion/scanner-project-snapshot";
import { defaultStoryPack } from "./story-pack";

export const REPORT_PIPELINE_VERSION = "4.0.0" as const;

export type AdaptiveReportPolicy = {
  complexityScore: number;
  complexityBand: "compact" | "standard" | "complex";
  reasoningEffort: "low" | "medium" | "high";
  maxOutputTokens: number;
  maxExcerpts: number;
  maxEvidenceCharacters: number;
};

export type StructuredSessionMap = {
  sessionRef: string;
  provider: string;
  startedAt: string;
  endedAt: string;
  status: string;
  phases: StoryPackPhase[];
  sourceRefs: string[];
  facts: {
    turns: number;
    assistantMessages: number;
    toolCalls: number;
    planningTurns: number;
    models: number;
    subagents: number;
  };
  unresolved: boolean;
};

export type ReportMapV4 = {
  version: typeof REPORT_PIPELINE_VERSION;
  sessionMaps: StructuredSessionMap[];
  policy: AdaptiveReportPolicy;
  coverage: {
    sessionsMapped: number;
    sessionsWithCitations: number;
    reviewedExcerptsAvailable: number;
    reviewedExcerptsSelected: number;
  };
};

export type ClaimVerificationIssue = {
  severity: "error" | "warning";
  code: "missing_citation" | "unknown_citation" | "citation_without_evidence" | "unsupported_number" | "duplicate_claim";
  path: string;
};

export type ClaimVerificationReport = {
  version: "1.0.0";
  status: "pass" | "warning" | "fail";
  claimCount: number;
  citedClaimCount: number;
  citationCoverage: number;
  numericClaimsChecked: number;
  issues: ClaimVerificationIssue[];
};

export type ReportQualityComparison = {
  baseline: { citationCoverage: number; issueCount: number; fallbackCount: number };
  candidate: { citationCoverage: number; issueCount: number; fallbackCount: number };
  delta: { citationCoverage: number; issueCount: number; fallbackCount: number };
};

export type DecisionAtlasNode = {
  nodeId: string;
  title: string;
  rationale: string;
  outcome: string;
  sourceRefs: string[];
  eventIds: string[];
  confidence: "low" | "medium" | "high";
  chapterValid: boolean;
};

export type DecisionAtlasEdge = {
  edgeId: string;
  from: string;
  to: string;
  relationship: "followed-by";
  sourceRefs: string[];
  chapterValid: boolean;
};

export type DecisionAtlas = { version: "1.0.0"; nodes: DecisionAtlasNode[]; edges: DecisionAtlasEdge[] };

export type AskBuildDocument = {
  documentId: string;
  kind: "moment" | "decision" | "learning" | "friction" | "chapter-change";
  title: string;
  body: string;
  sourceRefs: string[];
  eventIds: string[];
  sessionRefs: string[];
  searchTerms: string[];
};

export type LongitudinalPattern = {
  patternId: string;
  title: string;
  detail: string;
  confidence: "medium" | "high";
  observationCount: number;
  sessionRefs: string[];
  sourceRefs: string[];
  associatedOutcomes: string[];
};

export type OutcomeMetric = {
  metricId: string;
  label: string;
  value: number;
  unit: "sessions" | "percent" | "events" | "minutes" | "lines";
  detail: string;
  sourceEventIds: string[];
  coverage: "observed" | "partial";
};

export type ModelRoleObservation = {
  modelRef: string;
  discoverySessions: number;
  decisionSessions: number;
  deliverySessions: number;
};

export type OutcomeLab = {
  version: "1.0.0";
  metrics: OutcomeMetric[];
  modelRoles: ModelRoleObservation[];
  caveats: string[];
};

export type BuildConstellation = {
  version: "1.0.0";
  seed: string;
  nodes: Array<{ eventId: string; x: number; y: number; radius: number; phase: StoryPackPhase }>;
  path: string;
};

export type ReportIntelligence = {
  reportMap: ReportMapV4;
  claimVerification: ClaimVerificationReport;
  qualityComparison: ReportQualityComparison;
  decisionAtlas: DecisionAtlas;
  searchIndex: AskBuildDocument[];
  patterns: LongitudinalPattern[];
  outcomeLab: OutcomeLab;
  constellation: BuildConstellation;
  pipelineMode: "dark" | "on";
};

function stableAtlasId(prefix: "dec" | "edge", value: string): string {
  let hash = 2166136261;
  for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return `${prefix}_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function sourceContext(pack: ReportStoryPack, sourceRefs: string[], snapshot: ScannerProjectSnapshot) {
  const refs = new Set(sourceRefs);
  const sources = pack.sources.filter((source) => refs.has(source.ref));
  const sessionRefs = [...new Set(sources.map((source) => source.sessionRef).filter((ref): ref is string => Boolean(ref)))].sort();
  const evidenceRefs = new Set(sources.flatMap((source) => source.evidenceRefs));
  const eventIds = snapshot.eventSpine?.events.filter((event) =>
    (event.sessionRef ? sessionRefs.includes(event.sessionRef) : false) || event.sourceRefs.some((ref) => evidenceRefs.has(ref)),
  ).map((event) => event.eventId) ?? [];
  return { sessionRefs, eventIds: [...new Set(eventIds)].sort() };
}

function searchTerms(text: string): string[] {
  const aliases: Record<string, string[]> = {
    abandon: ["delete", "remove", "change", "reversal"],
    architecture: ["decision", "system", "strategy"],
    bug: ["failure", "friction", "hard", "repair"],
    verify: ["verification", "test", "fixture", "smoke"],
    ship: ["delivery", "release", "milestone"],
    feedback: ["tester", "recording", "simplification"],
  };
  const base = text.toLocaleLowerCase("en-US").match(/[a-z0-9]{3,}/g) ?? [];
  const expanded = base.flatMap((term) => [term, ...(aliases[term] ?? [])]);
  return [...new Set(expanded)].sort();
}

export function createAskBuildIndex(pack: ReportStoryPack, snapshot: ScannerProjectSnapshot): AskBuildDocument[] {
  const inputs: Array<Omit<AskBuildDocument, "documentId" | "eventIds" | "sessionRefs" | "searchTerms">> = [];
  pack.moments.forEach((item) => inputs.push({ kind: "moment", title: item.title, body: `${item.whatHappened} ${item.whyItMattered}`, sourceRefs: item.sourceRefs }));
  pack.decisions.forEach((item) => inputs.push({ kind: "decision", title: item.title, body: `${item.rationale} ${item.outcome}`, sourceRefs: item.sourceRefs }));
  pack.learnings.forEach((item) => inputs.push({ kind: "learning", title: item.title, body: item.detail, sourceRefs: item.sourceRefs }));
  if (pack.version === "3.0.0" && pack.deepAnalysis) {
    pack.deepAnalysis.whereItGotHard.forEach((item) => inputs.push({ kind: "friction", title: item.title, body: item.summary, sourceRefs: item.sourceRefs }));
    pack.deepAnalysis.chapterChanges.forEach((item) => inputs.push({ kind: "chapter-change", title: item.title, body: item.summary, sourceRefs: item.sourceRefs }));
  }
  return inputs.map((item, index) => {
    const context = sourceContext(pack, item.sourceRefs, snapshot);
    return {
      ...item,
      documentId: stableAtlasId("dec", `search:${index}:${item.kind}:${item.title}`),
      ...context,
      searchTerms: searchTerms(`${item.kind} ${item.title} ${item.body}`),
    };
  });
}

export function searchAskBuildIndex(query: string, documents: AskBuildDocument[], limit = 3): AskBuildDocument[] {
  const aliases: Record<string, string[]> = { why: ["rationale", "decision"], abandon: ["delete", "remove", "change"], architecture: ["system", "strategy", "decision"], bug: ["failure", "friction", "repair"], hard: ["failure", "friction", "conflict"], changed: ["change", "delete", "decision"], verify: ["verification", "test", "fixture", "smoke"] };
  const raw = query.toLocaleLowerCase("en-US").match(/[a-z0-9]{3,}/g) ?? [];
  const terms = [...new Set(raw.flatMap((term) => [term, ...(aliases[term] ?? [])]))];
  if (!terms.length) return [];
  return documents.map((document) => {
    const title = document.title.toLocaleLowerCase("en-US");
    const body = document.body.toLocaleLowerCase("en-US");
    const score = terms.reduce((sum, term) => sum + (title.includes(term) ? 5 : 0) + (body.includes(term) ? 2 : 0) + (document.searchTerms.some((candidate) => candidate.includes(term) || term.includes(candidate)) ? 3 : 0), 0);
    return { document, score };
  }).filter((result) => result.score > 0).sort((left, right) => right.score - left.score || left.document.documentId.localeCompare(right.document.documentId)).slice(0, limit).map((result) => result.document);
}

export function createLongitudinalPatterns(pack: ReportStoryPack, snapshot: ScannerProjectSnapshot, historicalPacks: ReportStoryPack[] = []): LongitudinalPattern[] {
  const groups = new Map<string, Array<{ pack: ReportStoryPack; item: ReportStoryPack["learnings"][number] }>>();
  for (const candidatePack of [...historicalPacks, pack]) for (const item of [...candidatePack.standoutTraits, ...candidatePack.learnings]) {
    const key = item.title.toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, " ").trim();
    const group = groups.get(key) ?? [];
    group.push({ pack: candidatePack, item });
    groups.set(key, group);
  }
  return [...groups.values()].flatMap((observations) => {
    const latest = observations.at(-1)!;
    const sessionRefs = [...new Set(observations.flatMap(({ pack: observationPack, item }) => {
      const refs = new Set(item.sourceRefs);
      return observationPack.sources.filter((source) => refs.has(source.ref)).map((source) => source.sessionRef).filter((ref): ref is string => Boolean(ref));
    }))].sort();
    if (sessionRefs.length < 2 && observations.length < 2) return [];
    const sourceRefs = [...new Set(observations.flatMap(({ item }) => item.sourceRefs))].sort();
    const outcomes = snapshot.sessions.filter((session) => sessionRefs.includes(session.sessionRef)).map((session) => session.status === "completed" ? "completed session" : "unresolved session");
    const observationCount = Math.max(sessionRefs.length, observations.length);
    return [{
      patternId: stableAtlasId("dec", `pattern:${latest.item.title}:${sessionRefs.join(",")}:${observations.length}`),
      title: latest.item.title,
      detail: latest.item.detail,
      confidence: observationCount >= 3 ? "high" : "medium",
      observationCount,
      sessionRefs,
      sourceRefs,
      associatedOutcomes: [...new Set(outcomes)].sort(),
    } satisfies LongitudinalPattern];
  });
}

export function createOutcomeLab(snapshot: ScannerProjectSnapshot): OutcomeLab {
  const events = snapshot.eventSpine?.events ?? [];
  const mutationSessions = new Set(events.filter((event) => event.kind === "mutation" && event.sessionRef).map((event) => event.sessionRef!));
  const verifiedSessions = new Set(events.filter((event) => event.kind === "verification" && event.sessionRef).map((event) => event.sessionRef!));
  const verifiedAfterMutation = [...mutationSessions].filter((sessionRef) => verifiedSessions.has(sessionRef));
  const modelShiftEvents = events.filter((event) => event.kind === "model-shift");
  const deliveryEvents = events.filter((event) => event.phase === "deliver");
  const phasesBySession = new Map(snapshot.sessions.map((session) => [session.sessionRef, new Set(phasesForSession(snapshot, session.sessionRef))]));
  const modelRoles = new Map<string, ModelRoleObservation>();
  for (const session of snapshot.sessions) for (const modelRef of session.modelRefs) {
    const roles = modelRoles.get(modelRef) ?? { modelRef, discoverySessions: 0, decisionSessions: 0, deliverySessions: 0 };
    const phases = phasesBySession.get(session.sessionRef);
    if (phases?.has("discover")) roles.discoverySessions += 1;
    if (phases?.has("decide")) roles.decisionSessions += 1;
    if (phases?.has("deliver")) roles.deliverySessions += 1;
    modelRoles.set(modelRef, roles);
  }
  return {
    version: "1.0.0",
    metrics: [
      { metricId: "verification-after-mutation", label: "Mutation sessions also verified", value: verifiedAfterMutation.length, unit: "sessions", detail: `${mutationSessions.size} mutation-bearing sessions were observed.`, sourceEventIds: events.filter((event) => event.sessionRef && verifiedAfterMutation.includes(event.sessionRef)).map((event) => event.eventId), coverage: "observed" },
      { metricId: "verification-coverage", label: "Verification coverage", value: mutationSessions.size ? Math.round(100 * verifiedAfterMutation.length / mutationSessions.size) : 0, unit: "percent", detail: "Association only; it does not measure productivity or code quality.", sourceEventIds: events.filter((event) => event.kind === "verification").map((event) => event.eventId), coverage: "observed" },
      { metricId: "model-context-shifts", label: "Model context shifts", value: modelShiftEvents.length, unit: "events", detail: "Observed model changes, not a model-quality ranking.", sourceEventIds: modelShiftEvents.map((event) => event.eventId), coverage: "observed" },
      { metricId: "delivery-moments", label: "Delivery moments", value: deliveryEvents.length, unit: "events", detail: "Verification and repository milestones in the delivery phase.", sourceEventIds: deliveryEvents.map((event) => event.eventId), coverage: "observed" },
      ...(snapshot.git.aiAttribution ? [{ metricId: "explicit-ai-acceptance", label: "Explicitly attributed AI lines accepted", value: snapshot.git.aiAttribution.aiAccepted, unit: "lines" as const, detail: `Opt-in Git AI aggregate across ${snapshot.git.aiAttribution.toolModels.length} tool/model pairs; authorship was not inferred.`, sourceEventIds: events.filter((event) => event.kind === "repository-milestone").map((event) => event.eventId), coverage: "partial" as const }] : []),
    ],
    modelRoles: [...modelRoles.values()].sort((left, right) => left.modelRef.localeCompare(right.modelRef)),
    caveats: ["Associations do not establish causation.", "AI authorship is never inferred from Git timing.", "Tool failure payloads are outside the retained privacy boundary."],
  };
}

export function createBuildConstellation(snapshot: ScannerProjectSnapshot): BuildConstellation {
  const events = snapshot.eventSpine?.events ?? [];
  const nodes = events.map((event, index) => {
    const hash = Number.parseInt(stableAtlasId("dec", event.eventId).slice(4), 16) >>> 0;
    const angle = (Math.PI * 2 * index) / Math.max(1, events.length) - Math.PI / 2;
    const distance = 38 + (hash % 34) + Math.min(18, event.magnitude);
    return { eventId: event.eventId, x: Number((100 + Math.cos(angle) * distance).toFixed(1)), y: Number((100 + Math.sin(angle) * distance).toFixed(1)), radius: 2.5 + Math.min(2, event.magnitude / 20), phase: event.phase };
  });
  const path = nodes.map((node, index) => `${index === 0 ? "M" : "L"}${node.x},${node.y}`).join(" ") + (nodes.length > 2 ? " Z" : "");
  return { version: "1.0.0", seed: stableAtlasId("dec", events.map((event) => event.eventId).join(":")), nodes, path };
}

export function createDecisionAtlas(pack: ReportStoryPack, snapshot: ScannerProjectSnapshot): DecisionAtlas {
  const sourceMap = new Map(pack.sources.map((source) => [source.ref, source]));
  const nodes = pack.decisions.map((decision, index) => {
    const sessionRefs = new Set(decision.sourceRefs.map((ref) => sourceMap.get(ref)?.sessionRef).filter((ref): ref is string => Boolean(ref)));
    const evidenceRefs = new Set(decision.sourceRefs.flatMap((ref) => sourceMap.get(ref)?.evidenceRefs ?? []));
    const eventIds = snapshot.eventSpine?.events.filter((event) =>
      (event.sessionRef ? sessionRefs.has(event.sessionRef) : false) || event.sourceRefs.some((ref) => evidenceRefs.has(ref)),
    ).map((event) => event.eventId) ?? [];
    const validSources = decision.sourceRefs.filter((ref) => sourceMap.has(ref)).length;
    return {
      nodeId: stableAtlasId("dec", `${index}:${decision.title}:${decision.sourceRefs.join(",")}`),
      title: decision.title,
      rationale: decision.rationale,
      outcome: decision.outcome,
      sourceRefs: [...new Set(decision.sourceRefs)].sort(),
      eventIds: [...new Set(eventIds)].sort(),
      confidence: validSources >= 2 || eventIds.length >= 2 ? "high" : validSources === 1 ? "medium" : "low",
      chapterValid: validSources === decision.sourceRefs.length && validSources > 0,
    } satisfies DecisionAtlasNode;
  });
  const edges = nodes.slice(1).map((node, index) => {
    const previous = nodes[index]!;
    return {
      edgeId: stableAtlasId("edge", `${previous.nodeId}:${node.nodeId}`),
      from: previous.nodeId,
      to: node.nodeId,
      relationship: "followed-by",
      sourceRefs: [...new Set([...previous.sourceRefs, ...node.sourceRefs])].sort(),
      chapterValid: previous.chapterValid && node.chapterValid,
    } satisfies DecisionAtlasEdge;
  });
  return { version: "1.0.0", nodes, edges };
}

function phasesForSession(snapshot: ScannerProjectSnapshot, sessionRef: string): StoryPackPhase[] {
  const values = snapshot.eventSpine?.events.filter((event) => event.sessionRef === sessionRef).map((event) => event.phase) ?? [];
  const phases = [...new Set(values)] as StoryPackPhase[];
  return phases.length ? phases : ["discover", "decide", "deliver"];
}

export function adaptiveReportPolicy(snapshot: ScannerProjectSnapshot, tier: AnalysisTier): AdaptiveReportPolicy {
  const excerpts = snapshot.narrativeEvidence?.excerpts.length ?? 0;
  const providers = snapshot.sourceSelection.providers.filter((item) => item.sessionsIncluded > 0).length;
  const incomplete = snapshot.sessions.filter((session) => session.status !== "completed").length;
  const events = snapshot.eventSpine?.events.length ?? 0;
  const score = Math.min(100,
    Math.min(40, snapshot.sessions.length * 4)
    + Math.min(25, Math.ceil(excerpts / 5))
    + Math.min(15, providers * 5)
    + Math.min(12, incomplete * 4)
    + Math.min(8, Math.ceil(events / 10)),
  );
  const complexityBand = score <= 25 ? "compact" : score <= 55 ? "standard" : "complex";
  const deep = tier === "deep";
  const maxExcerpts = deep
    ? Math.min(240, complexityBand === "compact" ? 160 : complexityBand === "standard" ? 280 : 400)
    : complexityBand === "compact" ? 40 : complexityBand === "standard" ? 60 : 80;
  return {
    complexityScore: score,
    complexityBand,
    reasoningEffort: complexityBand === "compact" ? "low" : complexityBand === "standard" ? "medium" : "high",
    maxOutputTokens: deep
      ? complexityBand === "compact" ? 16_000 : complexityBand === "standard" ? 28_000 : 40_000
      : complexityBand === "compact" ? 3_000 : complexityBand === "standard" ? 4_000 : 6_000,
    maxExcerpts,
    maxEvidenceCharacters: deep ? 700 * 1024 : 60_000,
  };
}

/** Deterministic round-robin: preserve session and evidence-role diversity before depth. */
export function selectAdaptiveExcerpts(excerpts: NarrativeExcerpt[], policy: AdaptiveReportPolicy): NarrativeExcerpt[] {
  const bySession = new Map<string, NarrativeExcerpt[]>();
  for (const excerpt of excerpts) {
    const group = bySession.get(excerpt.sessionRef) ?? [];
    group.push(excerpt);
    bySession.set(excerpt.sessionRef, group);
  }
  for (const group of bySession.values()) group.sort((left, right) => left.role.localeCompare(right.role) || left.occurredAt.localeCompare(right.occurredAt) || left.excerptId.localeCompare(right.excerptId));
  const sessions = [...bySession.keys()].sort();
  const selected: NarrativeExcerpt[] = [];
  let characters = 0;
  for (let depth = 0; selected.length < policy.maxExcerpts; depth += 1) {
    let added = false;
    for (const sessionRef of sessions) {
      const excerpt = bySession.get(sessionRef)?.[depth];
      if (!excerpt) continue;
      if (characters + excerpt.text.length > policy.maxEvidenceCharacters) continue;
      selected.push(excerpt);
      characters += excerpt.text.length;
      added = true;
      if (selected.length >= policy.maxExcerpts) break;
    }
    if (!added) break;
  }
  return selected;
}

export function createReportMapV4(snapshot: ScannerProjectSnapshot, tier: AnalysisTier): ReportMapV4 {
  const policy = adaptiveReportPolicy(snapshot, tier);
  const sources = defaultStoryPack(snapshot).sources;
  const selected = selectAdaptiveExcerpts(snapshot.narrativeEvidence?.excerpts ?? [], policy);
  const sessionMaps = snapshot.sessions.map((session) => {
    const sourceRefs = sources.filter((source) => source.sessionRef === session.sessionRef).map((source) => source.ref).sort();
    return {
      sessionRef: session.sessionRef,
      provider: session.provider,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      status: session.status,
      phases: phasesForSession(snapshot, session.sessionRef),
      sourceRefs,
      facts: {
        turns: session.turns,
        assistantMessages: session.assistantMessages,
        toolCalls: session.toolCalls,
        planningTurns: session.planModeTurns ?? 0,
        models: session.modelRefs.length,
        subagents: session.subagentInvocations ?? 0,
      },
      unresolved: session.status !== "completed",
    } satisfies StructuredSessionMap;
  });
  return {
    version: REPORT_PIPELINE_VERSION,
    sessionMaps,
    policy,
    coverage: {
      sessionsMapped: sessionMaps.length,
      sessionsWithCitations: sessionMaps.filter((session) => session.sourceRefs.length > 0).length,
      reviewedExcerptsAvailable: snapshot.narrativeEvidence?.excerpts.length ?? 0,
      reviewedExcerptsSelected: selected.length,
    },
  };
}

function claimEntries(pack: ReportStoryPack) {
  const claims: Array<{ path: string; text: string; sourceRefs: string[]; title: string }> = [];
  pack.buildArc.forEach((item, index) => claims.push({ path: `buildArc[${index}]`, text: `${item.headline} ${item.summary}`, title: item.headline, sourceRefs: item.sourceRefs }));
  pack.moments.forEach((item, index) => claims.push({ path: `moments[${index}]`, text: `${item.title} ${item.whatHappened} ${item.whyItMattered}`, title: item.title, sourceRefs: item.sourceRefs }));
  claims.push({ path: "turningPoint", text: pack.turningPoint.quote, title: pack.turningPoint.quote, sourceRefs: pack.turningPoint.sourceRefs });
  pack.decisions.forEach((item, index) => claims.push({ path: `decisions[${index}]`, text: `${item.title} ${item.rationale} ${item.outcome}`, title: item.title, sourceRefs: item.sourceRefs }));
  pack.learnings.forEach((item, index) => claims.push({ path: `learnings[${index}]`, text: `${item.title} ${item.detail}`, title: item.title, sourceRefs: item.sourceRefs }));
  pack.standoutTraits.forEach((item, index) => claims.push({ path: `standoutTraits[${index}]`, text: `${item.title} ${item.detail}`, title: item.title, sourceRefs: item.sourceRefs }));
  claims.push({ path: "growthEdge", text: `${pack.growthEdge.title} ${pack.growthEdge.observation}`, title: pack.growthEdge.title, sourceRefs: pack.growthEdge.sourceRefs });
  if (pack.version === "3.0.0" && pack.deepAnalysis) {
    const groups = [["signatureMoves", pack.deepAnalysis.signatureMoves], ["byTheNumbers", pack.deepAnalysis.byTheNumbers], ["whereItGotHard", pack.deepAnalysis.whereItGotHard], ["chapterChanges", pack.deepAnalysis.chapterChanges]] as const;
    claims.push({ path: "deepAnalysis.openingLine", text: `${pack.deepAnalysis.openingLine.title} ${pack.deepAnalysis.openingLine.summary}`, title: pack.deepAnalysis.openingLine.title, sourceRefs: pack.deepAnalysis.openingLine.sourceRefs });
    groups.forEach(([name, items]) => items.forEach((item, index) => claims.push({ path: `deepAnalysis.${name}[${index}]`, text: `${item.title} ${item.summary}`, title: item.title, sourceRefs: item.sourceRefs })));
  }
  return claims;
}

function numberTokens(text: string): string[] {
  return [...new Set(text.match(/\b\d+(?:[.,]\d+)?%?\b/g) ?? [])];
}

function allowedNumbers(snapshot: ScannerProjectSnapshot): Set<string> {
  const serializedFacts = JSON.stringify({
    sessions: snapshot.sessions.map((session) => ({ turns: session.turns, assistantMessages: session.assistantMessages, toolCalls: session.toolCalls, planModeTurns: session.planModeTurns, subagentInvocations: session.subagentInvocations })),
    usage: snapshot.usage,
    git: snapshot.git,
    excerpts: snapshot.narrativeEvidence?.excerpts.map((excerpt) => excerpt.text) ?? [],
  });
  return new Set(numberTokens(serializedFacts));
}

export function verifyStoryPackClaims(pack: ReportStoryPack, snapshot: ScannerProjectSnapshot): ClaimVerificationReport {
  const claims = claimEntries(pack);
  const sources = new Map(pack.sources.map((source) => [source.ref, source]));
  const numbers = allowedNumbers(snapshot);
  const issues: ClaimVerificationIssue[] = [];
  const titles = new Map<string, string>();
  let numericClaimsChecked = 0;
  for (const claim of claims) {
    if (!claim.sourceRefs.length) issues.push({ severity: "error", code: "missing_citation", path: claim.path });
    for (const ref of claim.sourceRefs) {
      const source = sources.get(ref);
      if (!source) issues.push({ severity: "error", code: "unknown_citation", path: claim.path });
      else if (!source.evidenceRefs.length && !source.excerptRef) issues.push({ severity: "error", code: "citation_without_evidence", path: claim.path });
    }
    const claimNumbers = numberTokens(claim.text);
    if (claimNumbers.length) numericClaimsChecked += 1;
    if (claimNumbers.some((number) => !numbers.has(number))) issues.push({ severity: "warning", code: "unsupported_number", path: claim.path });
    const normalizedTitle = claim.title.toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, " ").trim();
    if (normalizedTitle && titles.has(normalizedTitle)) issues.push({ severity: "warning", code: "duplicate_claim", path: claim.path });
    else if (normalizedTitle) titles.set(normalizedTitle, claim.path);
  }
  const citedClaimCount = claims.filter((claim) => claim.sourceRefs.length > 0).length;
  return {
    version: "1.0.0",
    status: issues.some((issue) => issue.severity === "error") ? "fail" : issues.length ? "warning" : "pass",
    claimCount: claims.length,
    citedClaimCount,
    citationCoverage: claims.length ? Math.round((citedClaimCount / claims.length) * 100) : 100,
    numericClaimsChecked,
    issues,
  };
}

export function compareReportQuality(snapshot: ScannerProjectSnapshot, candidate: ReportStoryPack, candidateFallbacks: string[]): ReportQualityComparison {
  const baselinePack = defaultStoryPack(snapshot);
  const baseline = verifyStoryPackClaims(baselinePack, snapshot);
  const verified = verifyStoryPackClaims(candidate, snapshot);
  return {
    baseline: { citationCoverage: baseline.citationCoverage, issueCount: baseline.issues.length, fallbackCount: 0 },
    candidate: { citationCoverage: verified.citationCoverage, issueCount: verified.issues.length, fallbackCount: candidateFallbacks.length },
    delta: { citationCoverage: verified.citationCoverage - baseline.citationCoverage, issueCount: verified.issues.length - baseline.issues.length, fallbackCount: candidateFallbacks.length },
  };
}

export function reportMapPromptContext(map: ReportMapV4): string {
  return `REPORT MAP ${map.version} (deterministic, content-free):\n${JSON.stringify(map)}\nSynthesize across these per-session maps and the reviewed excerpts. Treat estimated Replay placement as approximate. Every claim must cite a provided sourceRef.`;
}
