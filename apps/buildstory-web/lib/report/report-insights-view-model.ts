import type { BuildStoryViewModel, PublicBuildStoryViewModel } from "@/lib/build-story";
import type { ReportStoryPack, StoryPackPhase } from "@/lib/ingestion/scanner-project-snapshot";
import type { ReportIntelligence } from "@/lib/narrative/v4";
import type { ChapterDelta, NumericDelta } from "@/lib/story/chapter-delta";
import type { ReportSurface } from "./evidence-view-model";
import { buildTurningBeat, isSessionActivityTitle, type TurningBeat } from "./public-brief";

export type InsightClaimKind = "arc" | "moment" | "decision" | "learning" | "trait" | "turning-point";

export type InsightClaim = {
  id: string;
  kind: InsightClaimKind;
  title: string;
  body: string;
  sourceRefs: string[];
};

export type SessionShapeMetric = "duration" | "turns" | "toolCalls";

export type SessionShapeSeries = {
  metric: SessionShapeMetric;
  label: string;
  unit: string;
  values: number[];
  minimum: number;
  q1: number;
  median: number;
  q3: number;
  maximum: number;
  useBoxPlot: boolean;
};

export type BuildJourneyPhase = {
  phase: StoryPackPhase;
  index: number;
  headline: string;
  summary: string;
  sourceRefs: string[];
  moments: Array<{ id: string; title: string; kind: string; sourceRefs: string[] }>;
  milestones: Array<{ id: string; title: string; date: string; kind: string }>;
  models: Array<{ label: string; sessions: number }>;
  sessions: Array<{ id: string; label: string; startedAt: string; endedAt: string }>;
  citedSourceCount: number;
};

export type DecisionDossierItem = {
  id: string;
  index: number;
  title: string;
  rationale: string;
  outcome: string;
  sourceRefs: string[];
  confidence: "low" | "medium" | "high" | null;
  eventIds: string[];
};

export type OutcomeFigure = {
  id: string;
  label: string;
  value: number;
  unit: string;
  detail: string;
};

export type ChapterComparisonMetric = {
  id: string;
  label: string;
  previous: number;
  current: number;
  change: number;
};

export type ReportInsightsViewModel = {
  surface: ReportSurface;
  claims: InsightClaim[];
  sourceGroups: Array<{ id: string; label: string; sourceRefs: string[] }>;
  journey: BuildJourneyPhase[];
  dossier: DecisionDossierItem[];
  turningPoint: { quote: string; sourceRefs: string[] } | null;
  turningBeat: TurningBeat | null;
  sessionShape: SessionShapeSeries[];
  outcomes: OutcomeFigure[];
  chapterComparison: {
    from: number;
    to: number;
    relation: ChapterDelta["windowRelation"];
    metrics: ChapterComparisonMetric[];
    changes: string[];
  } | null;
};

type StoryInput = BuildStoryViewModel | PublicBuildStoryViewModel;

const providerLabels: Record<string, string> = {
  codex: "Codex",
  "claude-code": "Claude",
  "gemini-antigravity": "Gemini",
  cursor: "Cursor",
  git: "Git",
};

function quantile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const remainder = position - lower;
  const next = sorted[lower + 1];
  return next === undefined ? sorted[lower]! : sorted[lower]! + remainder * (next - sorted[lower]!);
}

export function summarizeDistribution(values: number[], metric: SessionShapeMetric, label: string, unit: string): SessionShapeSeries | null {
  const sorted = values.filter((value) => Number.isFinite(value) && value >= 0).sort((left, right) => left - right);
  if (!sorted.length) return null;
  return {
    metric,
    label,
    unit,
    values: sorted,
    minimum: sorted[0]!,
    q1: quantile(sorted, 0.25),
    median: quantile(sorted, 0.5),
    q3: quantile(sorted, 0.75),
    maximum: sorted.at(-1)!,
    useBoxPlot: sorted.length >= 5 && sorted[0] !== sorted.at(-1),
  };
}

function claimsFromPack(pack: ReportStoryPack | null): InsightClaim[] {
  if (!pack) return [];
  return [
    ...pack.buildArc.map((item, index) => ({ id: `arc-${index}`, kind: "arc" as const, title: item.headline, body: item.summary, sourceRefs: item.sourceRefs })),
    ...pack.moments.map((item, index) => ({ id: `moment-${index}`, kind: "moment" as const, title: item.title, body: `${item.whatHappened} ${item.whyItMattered}`, sourceRefs: item.sourceRefs })),
    ...(pack.turningPoint.quote ? [{ id: "turning-point", kind: "turning-point" as const, title: "Turning point", body: pack.turningPoint.quote, sourceRefs: pack.turningPoint.sourceRefs }] : []),
    ...pack.decisions.map((item, index) => ({ id: `decision-${index}`, kind: "decision" as const, title: item.title, body: `${item.rationale} ${item.outcome}`, sourceRefs: item.sourceRefs })),
    ...pack.learnings.map((item, index) => ({ id: `learning-${index}`, kind: "learning" as const, title: item.title, body: item.detail, sourceRefs: item.sourceRefs })),
    ...pack.standoutTraits.map((item, index) => ({ id: `trait-${index}`, kind: "trait" as const, title: item.title, body: item.detail, sourceRefs: item.sourceRefs })),
  ];
}

function comparisonMetric(id: string, label: string, value: NumericDelta): ChapterComparisonMetric | null {
  if (value.previous === null || value.change === null || value.change === 0) return null;
  return { id, label, previous: value.previous, current: value.current, change: value.change };
}

function chapterComparison(delta: ChapterDelta | null | undefined): ReportInsightsViewModel["chapterComparison"] {
  if (!delta) return null;
  const metrics = [
    comparisonMetric("commits", "Commits", delta.build.commits),
    comparisonMetric("activeDays", "Active days", delta.build.activeDays),
    comparisonMetric("sessions", "AI sessions", delta.build.sessionCount),
    comparisonMetric("hours", "Build hours", delta.build.buildHours),
    comparisonMetric("tokens", "Tokens", delta.spend.totalTokens),
  ].filter((item): item is ChapterComparisonMetric => item !== null);
  const changes = [
    ...delta.models.added.map((item) => `Added ${item.label}`),
    ...delta.models.removed.map((item) => `Stopped using ${item.label}`),
    ...delta.tools.added.map((item) => `Started using ${item}`),
    ...delta.tools.removed.map((item) => `Stopped using ${item}`),
    ...delta.milestones.added.map((item) => `Milestone: ${item.title}`),
  ];
  if (!metrics.length && !changes.length && !delta.narrativeReplaced) return null;
  return { from: delta.fromChapterIndex, to: delta.toChapterIndex, relation: delta.windowRelation, metrics, changes };
}

export function buildReportInsightsViewModel({
  story,
  surface,
  pack,
  intelligence,
  chapterDelta,
}: {
  story: StoryInput;
  surface: ReportSurface;
  pack: ReportStoryPack | null;
  intelligence?: ReportIntelligence | null;
  chapterDelta?: ChapterDelta | null;
}): ReportInsightsViewModel {
  const claims = claimsFromPack(pack);
  const sources = pack?.sources ?? [];
  const sourceGroups = [...new Set(sources.map((source) => source.provider))].sort().map((provider) => ({
    id: provider,
    label: providerLabels[provider] ?? provider,
    sourceRefs: sources.filter((source) => source.provider === provider).map((source) => source.ref),
  }));
  const atlas = new Map((intelligence?.decisionAtlas.nodes ?? []).map((node) => [node.title, node]));
  const dossier = (pack?.decisions ?? []).map((decision, index) => {
    const node = atlas.get(decision.title);
    return {
      id: `decision-${index}`,
      index: index + 1,
      title: decision.title,
      rationale: decision.rationale,
      outcome: decision.outcome,
      sourceRefs: decision.sourceRefs,
      confidence: surface === "private" ? node?.confidence ?? null : null,
      eventIds: surface === "private" ? node?.eventIds ?? [] : [],
    };
  });

  const phaseOrder: StoryPackPhase[] = ["discover", "decide", "deliver"];
  const reportMapSessions = surface === "private" ? intelligence?.reportMap.sessionMaps ?? [] : [];
  const modelRoles = surface === "private" ? intelligence?.outcomeLab.modelRoles ?? [] : [];
  const journey = (pack?.buildArc ?? []).map((arc, index) => {
    const moments = (pack?.moments ?? []).filter((moment) => moment.phase === arc.phase).map((moment, momentIndex) => ({ id: `${arc.phase}-${momentIndex}`, title: moment.title, kind: moment.kind, sourceRefs: moment.sourceRefs }));
    return {
      phase: arc.phase,
      index: phaseOrder.indexOf(arc.phase) + 1 || index + 1,
      headline: arc.headline,
      summary: arc.summary,
      sourceRefs: arc.sourceRefs,
      moments,
      milestones: story.milestones.filter((milestone) => {
        if (isSessionActivityTitle(milestone.title)) return false;
        if (arc.phase === "deliver") return milestone.kind === "ship" || milestone.kind === "feedback";
        if (arc.phase === "decide") return milestone.kind === "decision";
        return milestone.kind === "breakthrough";
      }).map((milestone) => ({ id: milestone.id, title: milestone.title, date: milestone.date, kind: milestone.kind })),
      models: modelRoles.map((model) => ({
        label: story.models.find((item) => item.id === model.modelRef)?.label ?? model.modelRef,
        sessions: arc.phase === "discover" ? model.discoverySessions : arc.phase === "decide" ? model.decisionSessions : model.deliverySessions,
      })).filter((model) => model.sessions > 0),
      sessions: reportMapSessions.filter((session) => session.phases.includes(arc.phase)).map((session) => ({ id: session.sessionRef, label: providerLabels[session.provider] ?? session.provider, startedAt: session.startedAt, endedAt: session.endedAt })),
      citedSourceCount: new Set([...arc.sourceRefs, ...moments.flatMap((moment) => moment.sourceRefs)]).size,
    };
  }).sort((left, right) => left.index - right.index);

  const sessionShape = surface === "private" ? [
    summarizeDistribution(("sessions" in story ? story.sessions : []).map((session) => session.durationMinutes), "duration", "Session duration", "minutes"),
    summarizeDistribution(reportMapSessions.map((session) => session.facts.turns), "turns", "Conversation turns", "turns"),
    summarizeDistribution(reportMapSessions.map((session) => session.facts.toolCalls), "toolCalls", "Tool calls", "calls"),
  ].filter((item): item is SessionShapeSeries => item !== null) : [];

  const outcomes = surface === "private" ? (intelligence?.outcomeLab.metrics ?? []).map((metric) => ({
    id: metric.metricId,
    label: metric.label,
    value: metric.value,
    unit: metric.unit,
    detail: metric.detail,
  })) : [];

  return {
    surface,
    claims,
    sourceGroups,
    journey,
    dossier,
    turningPoint: pack?.turningPoint.quote ? pack.turningPoint : null,
    turningBeat: surface === "private" ? null : buildTurningBeat(pack),
    sessionShape,
    outcomes,
    chapterComparison: chapterComparison(chapterDelta),
  };
}
