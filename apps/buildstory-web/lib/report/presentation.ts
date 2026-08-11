import type {
  ReportStoryPack,
  Signal,
  StoryPackFinding,
} from "@/lib/ingestion/scanner-project-snapshot";
import type { PublicBuildStoryViewModel } from "@/lib/build-story";

/**
 * The report renderer intentionally has a small visual vocabulary. A finding
 * chooses a block based on what it is, rather than inheriting one generic card
 * shell. The data is derived from the already validated snapshot/story pack;
 * this layer never invents metrics.
 */
export type ReportBlockKind =
  | "metric"
  | "distribution"
  | "timeline"
  | "decision"
  | "comparison"
  | "quote"
  | "model-mix"
  | "evidence";

export type ReportBlockSection =
  | "narrativeArc"
  | "narrativeMoments"
  | "narrativeInsights"
  | "narrativeSignals";

export type ReportBlock = {
  id: string;
  kind: ReportBlockKind;
  section: ReportBlockSection;
  eyebrow: string;
  title: string;
  summary?: string;
  data: unknown;
  sourceRefs: string[];
  confidence?: "high" | "medium" | "low";
};

type SignalBlockData = {
  value: number;
  unit: string;
  detail: string;
  formula: string;
  family: Signal["family"];
};

type FindingBlockData = {
  detail?: string;
  whyItMattered?: string;
  phase?: string;
  kind?: string;
};

export type ReportStoryMetrics = Pick<
  PublicBuildStoryViewModel,
  "sessionCount" | "activeDays" | "subagentCount" | "buildHours" | "modelRequests" | "models" | "tokenUsage" | "cost" | "git" | "redaction"
>;

type ModelMixBlockData = {
  models: Array<{ id: string; label: string; requests: number; totalTokens: number | null; share: number | null; costMicroUsd: number | null }>;
  totalRequests: number;
  totalTokens: number | null;
};

function stableKey(value: string): string {
  return value
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 280);
}

function uniqueRefs(refs: string[]): string[] {
  return [...new Set(refs)].slice(0, 6);
}

function signalKind(signal: Signal): ReportBlockKind {
  if (signal.id === "night-owl-share" || signal.family === "rhythm" && signal.unit === "%") {
    return "distribution";
  }
  if (signal.id === "token-heaviest-session" || signal.family === "spend") {
    return "metric";
  }
  if (signal.family === "conversation" || signal.family === "output") {
    return "comparison";
  }
  return "metric";
}

export function signalToReportBlock(signal: Signal, index = 0): ReportBlock {
  const kind = signalKind(signal);
  return {
    id: `signal:${signal.id}`,
    kind,
    section: "narrativeSignals",
    eyebrow: signal.family === "rhythm" ? "BUILD RHYTHM" : signal.family.toUpperCase(),
    title: signal.headline,
    summary: signal.detail,
    data: {
      value: signal.value,
      unit: signal.unit,
      detail: signal.detail,
      formula: signal.formula,
      family: signal.family,
      index,
    } satisfies SignalBlockData & { index: number },
    sourceRefs: uniqueRefs(signal.sourceRefs),
  };
}

function findingBlock(
  id: string,
  section: ReportBlockSection,
  kind: ReportBlockKind,
  eyebrow: string,
  finding: StoryPackFinding,
  data: FindingBlockData = {},
): ReportBlock {
  return {
    id,
    kind,
    section,
    eyebrow,
    title: finding.title,
    summary: finding.summary,
    data,
    sourceRefs: uniqueRefs(finding.sourceRefs),
    confidence: finding.confidence,
  };
}

/**
 * Remove exact semantic repeats while retaining the first occurrence. The
 * first occurrence is the most intentional one because callers build blocks
 * in editorial order (arc, moments, insights, computed facts).
 */
export function dedupeReportBlocks(blocks: ReportBlock[], against: string[] = []): ReportBlock[] {
  const seen = new Set(against.map(stableKey).filter(Boolean));
  const seenTitles = new Set(against.map(stableKey).filter(Boolean));
  return blocks.filter((block) => {
    const titleKey = stableKey(block.title);
    const key = stableKey(`${block.title} ${block.summary ?? ""}`);
    if (!titleKey || seenTitles.has(titleKey) || !key || seen.has(key)) return false;
    seenTitles.add(titleKey);
    seen.add(key);
    return true;
  });
}

/**
 * Build the non-narrative report surface from already-derived public fields.
 * A missing value means that field was not selected for publication, so this
 * function omits the block instead of rendering a zero sentinel as a fact.
 */
export function buildStoryMetricBlocks(story: ReportStoryMetrics, privateView = false): ReportBlock[] {
  const blocks: ReportBlock[] = [];
  if (story.activeDays > 0) {
    blocks.push({
      id: "metric:active-days",
      kind: "metric",
      section: "narrativeSignals",
      eyebrow: "BUILD RHYTHM",
      title: "Active build days",
      summary: "Distinct UTC days with observed build activity.",
      data: { value: story.activeDays, unit: "days" },
      sourceRefs: [],
    });
  }
  if (story.sessionCount > 0) {
    blocks.push({
      id: "metric:sessions",
      kind: "metric",
      section: "narrativeSignals",
      eyebrow: "BUILD VOLUME",
      title: "AI-assisted sessions",
      summary: `${story.subagentCount > 0 ? `${story.subagentCount} subagent delegations · ` : ""}${story.buildHours > 0 ? `${story.buildHours} build hours observed.` : "A count of the sessions in the selected report window."}`,
      data: { value: story.sessionCount, unit: "sessions" },
      sourceRefs: [],
    });
  }
  if (story.tokenUsage && story.tokenUsage.totalTokens > 0) {
    blocks.push({
      id: "metric:tokens",
      kind: "metric",
      section: "narrativeSignals",
      eyebrow: "TOKEN LEDGER",
      title: "Tokens processed",
      summary: "Aggregate input, cached, output, and reasoning tokens from the scanner.",
      data: { value: story.tokenUsage.totalTokens, unit: "tokens" },
      sourceRefs: [],
    });
  }
  if (story.cost?.totalMicroUsd != null) {
    blocks.push({
      id: "metric:spend",
      kind: "comparison",
      section: "narrativeSignals",
      eyebrow: "SPEND LEDGER",
      title: "Estimated API-equivalent spend",
      summary: `${story.cost.unpricedTokens > 0 ? "Some tokens came from models outside the pricing table. " : ""}This is a deterministic estimate, not a bill from a provider.`,
      data: { value: story.cost.totalMicroUsd, unit: "micro-USD", unpricedTokens: story.cost.unpricedTokens },
      sourceRefs: [],
    });
  }
  if (story.models.length > 0) {
    blocks.push({
      id: "metric:model-mix",
      kind: "model-mix",
      section: "narrativeSignals",
      eyebrow: "MODEL MIX",
      title: "Models in the build",
      summary: "Observed request share, with cost shares only when pricing data is available.",
      data: {
        models: story.models.map((model) => ({
          id: model.id,
          label: model.label,
          requests: model.requests,
          totalTokens: model.tokenUsage?.totalTokens ?? null,
          share: model.share ?? null,
          costMicroUsd: model.costMicroUsd ?? null,
        })),
        totalRequests: story.modelRequests,
        totalTokens: story.tokenUsage?.totalTokens ?? null,
      } satisfies ModelMixBlockData,
      sourceRefs: [],
    });
  }
  if (privateView) {
    blocks.push({
      id: "evidence:redaction",
      kind: "evidence",
      section: "narrativeSignals",
      eyebrow: "VERIFIED RECEIPT",
      title: "Local redaction and provenance",
      summary: `${story.redaction.tokensRemoved.toLocaleString("en-US")} tokens withheld before upload; raw snapshots remain private.`,
      data: { tokensRemoved: story.redaction.tokensRemoved },
      sourceRefs: [],
      confidence: "high",
    });
  }
  return dedupeReportBlocks(blocks);
}

export function buildReportBlocks(
  pack: ReportStoryPack,
  options: { includeDeep?: boolean; includeSignals?: boolean; against?: string[] } = {},
): ReportBlock[] {
  const blocks: ReportBlock[] = [];

  pack.buildArc.forEach((phase, index) => {
    blocks.push({
      id: `arc:${phase.phase}:${index}`,
      kind: "timeline",
      section: "narrativeArc",
      eyebrow: `CHAPTER ${String(index + 1).padStart(2, "0")} · ${phase.phase.toUpperCase()}`,
      title: phase.headline,
      summary: phase.summary,
      data: { phase: phase.phase, index },
      sourceRefs: uniqueRefs(phase.sourceRefs),
    });
  });

  pack.moments.forEach((moment, index) => {
    blocks.push({
      id: `moment:${index}:${stableKey(moment.title)}`,
      kind: "timeline",
      section: "narrativeMoments",
      eyebrow: `${moment.kind.toUpperCase()} · ${moment.phase.toUpperCase()}`,
      title: moment.title,
      summary: moment.whatHappened,
      data: { detail: moment.whatHappened, whyItMattered: moment.whyItMattered, phase: moment.phase, kind: moment.kind },
      sourceRefs: uniqueRefs(moment.sourceRefs),
    });
  });

  if (pack.turningPoint.quote) {
    blocks.push({
      id: "turning-point",
      kind: "quote",
      section: "narrativeInsights",
      eyebrow: "TURNING POINT",
      title: "What changed the build",
      summary: pack.turningPoint.quote,
      data: { quote: pack.turningPoint.quote },
      sourceRefs: uniqueRefs(pack.turningPoint.sourceRefs),
    });
  }

  pack.decisions.forEach((decision, index) => {
    blocks.push({
      id: `decision:${index}:${stableKey(decision.title)}`,
      kind: "decision",
      section: "narrativeInsights",
      eyebrow: "DECISION",
      title: decision.title,
      summary: decision.rationale,
      data: { rationale: decision.rationale, outcome: decision.outcome },
      sourceRefs: uniqueRefs(decision.sourceRefs),
    });
  });

  pack.learnings.forEach((finding, index) => {
    blocks.push({
      id: `learning:${index}:${stableKey(finding.title)}`,
      kind: "quote",
      section: "narrativeInsights",
      eyebrow: "LEARNING",
      title: finding.title,
      summary: finding.detail,
      data: { detail: finding.detail },
      sourceRefs: uniqueRefs(finding.sourceRefs),
    });
  });
  pack.standoutTraits.forEach((finding, index) => {
    blocks.push({
      id: `trait:${index}:${stableKey(finding.title)}`,
      kind: "comparison",
      section: "narrativeInsights",
      eyebrow: "STANDOUT TRAIT",
      title: finding.title,
      summary: finding.detail,
      data: { detail: finding.detail },
      sourceRefs: uniqueRefs(finding.sourceRefs),
    });
  });
  if (pack.growthEdge.title) {
    blocks.push({
      id: "growth-edge",
      kind: "comparison",
      section: "narrativeInsights",
      eyebrow: "GROWTH EDGE",
      title: pack.growthEdge.title,
      summary: pack.growthEdge.observation,
      data: { detail: pack.growthEdge.observation },
      sourceRefs: uniqueRefs(pack.growthEdge.sourceRefs),
    });
  }

  if (options.includeSignals !== false) {
    pack.signals.forEach((signal, index) => blocks.push(signalToReportBlock(signal, index)));
  }

  if (options.includeDeep !== false && pack.version === "3.0.0" && pack.deepAnalysis) {
    const deep = pack.deepAnalysis;
    if (deep.openingLine?.title) {
      blocks.push(findingBlock("deep:opening-line", "narrativeInsights", "quote", "DEEP SIGNAL", deep.openingLine));
    }
    deep.signatureMoves?.forEach((finding, index) => {
      blocks.push(findingBlock(`deep:signature:${index}`, "narrativeInsights", "comparison", "SIGNATURE MOVE", finding));
    });
    deep.whereItGotHard?.forEach((finding, index) => {
      blocks.push(findingBlock(`deep:friction:${index}`, "narrativeMoments", "timeline", "WHERE IT GOT HARD", finding));
    });
    deep.chapterChanges?.forEach((finding, index) => {
      blocks.push(findingBlock(`deep:change:${index}`, "narrativeMoments", "timeline", "WHAT CHANGED", finding));
    });
    deep.byTheNumbers?.forEach((finding, index) => {
      const signal = pack.signals.find((candidate) => candidate.id === finding.signalId);
      if (signal) {
        const block = signalToReportBlock(signal, index);
        blocks.push({ ...block, id: `deep:signal:${finding.signalId}`, summary: finding.summary, eyebrow: "DEEP FACT" });
      }
    });
  }

  return dedupeReportBlocks(blocks, options.against ?? [pack.hero.headline, pack.hero.summary]);
}

export function buildSignalBlocks(signals: Signal[]): ReportBlock[] {
  return dedupeReportBlocks(signals.map(signalToReportBlock));
}

export function blockData<T>(block: ReportBlock): T {
  return block.data as T;
}
