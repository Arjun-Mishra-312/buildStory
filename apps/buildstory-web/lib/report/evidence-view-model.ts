import type { PublicBuildStoryViewModel } from "@/lib/build-story";
import type { ReportStoryPack, Signal } from "@/lib/ingestion/scanner-project-snapshot";
import { footnoteForMetric } from "./public-brief";

export type ReportSurface = "private" | "preview" | "public";

export type EvidenceMetric = {
  id: "activeDays" | "sessions" | "commits" | "linesAdded" | "models" | "tokens" | "cost";
  label: string;
  value: string;
  tone: "coral" | "cobalt" | "ochre" | "sage" | "lilac" | "ink";
  note?: string;
};

export type EvidenceDistributionRow = {
  id: string;
  label: string;
  value: string;
  percent: number;
};

export type EvidenceSource = {
  ref: string;
  label: string;
  occurredAt: string;
  evidenceCount: number;
};

export type EvidenceViewModel = {
  surface: ReportSurface;
  metrics: EvidenceMetric[];
  modelDistribution: EvidenceDistributionRow[];
  modelDistributionBasis: "estimated cost share" | "observed model calls" | null;
  toolDistribution: EvidenceDistributionRow[];
  gitDiff: { additions: number; deletions: number; additionPercent: number } | null;
  timeline: Array<{ id: string; title: string; date: string; kind: string }>;
  sources: EvidenceSource[];
  signals: Signal[];
};

type EvidenceStory = Pick<
  PublicBuildStoryViewModel,
  "activeDays" | "sessionCount" | "models" | "tools" | "tokenUsage" | "cost" | "git" | "milestones" | "signals"
>;

const compactNumber = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const usdFormat = new Intl.NumberFormat("en", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function providerName(provider: string): string {
  if (provider === "claude-code") return "Claude Code";
  if (provider === "gemini-antigravity") return "Gemini Antigravity";
  if (provider === "cursor") return "Cursor";
  if (provider === "git") return "Git";
  return "Codex";
}

function distribution(
  entries: Array<{ id: string; label: string; amount: number }>,
  total: number,
): EvidenceDistributionRow[] {
  if (total <= 0) return [];
  return entries
    .filter((entry) => entry.amount > 0)
    .sort((left, right) => right.amount - left.amount || left.label.localeCompare(right.label))
    .map((entry) => ({
      id: entry.id,
      label: entry.label,
      value: entry.amount.toLocaleString(),
      percent: Math.max(2, Math.round((entry.amount / total) * 100)),
    }));
}

export function buildEvidenceViewModel(
  story: EvidenceStory,
  surface: ReportSurface,
  pack: ReportStoryPack | null = null,
): EvidenceViewModel {
  const signals = pack?.signals ?? story.signals;
  const metrics: EvidenceMetric[] = [];
  const pushMetric = (metric: EvidenceMetric) => {
    const note = footnoteForMetric(metric.id, signals);
    metrics.push(note ? { ...metric, note } : metric);
  };
  if (story.activeDays > 0) pushMetric({ id: "activeDays", label: "active days", value: story.activeDays.toLocaleString(), tone: "cobalt" });
  if (story.sessionCount > 0) pushMetric({ id: "sessions", label: "AI sessions", value: story.sessionCount.toLocaleString(), tone: "coral" });
  if (story.git.commits > 0) pushMetric({ id: "commits", label: "commits", value: story.git.commits.toLocaleString(), tone: "ochre" });
  if (story.git.additions > 0) pushMetric({ id: "linesAdded", label: "lines added", value: story.git.additions.toLocaleString(), tone: "sage" });
  if (story.models.length > 0) pushMetric({ id: "models", label: "models in mix", value: story.models.length.toLocaleString(), tone: "lilac" });
  if (story.tokenUsage?.totalTokens) pushMetric({ id: "tokens", label: "tokens processed", value: compactNumber.format(story.tokenUsage.totalTokens), tone: "ink" });
  if (story.cost?.totalMicroUsd != null) pushMetric({ id: "cost", label: "est. API-equivalent", value: usdFormat.format(story.cost.totalMicroUsd / 1_000_000), tone: "coral" });

  const pricedModels = story.models.filter((model) => model.share != null);
  const useCostShare = pricedModels.length > 0 && pricedModels.length === story.models.length;
  const requestTotal = story.models.reduce((sum, model) => sum + model.requests, 0);
  const modelDistribution = useCostShare
    ? pricedModels
        .filter((model) => (model.share ?? 0) > 0)
        .sort((left, right) => (right.share ?? 0) - (left.share ?? 0))
        .map((model) => ({ id: model.id, label: model.label, value: `${model.share}%`, percent: Math.max(2, model.share ?? 0) }))
    : distribution(story.models.map((model) => ({ id: model.id, label: model.label, amount: model.requests })), requestTotal);

  const toolTotal = story.tools.reduce((sum, tool) => sum + tool.sessions, 0);
  const toolDistribution = distribution(
    story.tools.map((tool) => ({ id: tool.id, label: tool.label, amount: tool.sessions })),
    toolTotal,
  );

  const diffTotal = story.git.additions + story.git.deletions;
  const gitDiff = diffTotal > 0
    ? { additions: story.git.additions, deletions: story.git.deletions, additionPercent: Math.round((story.git.additions / diffTotal) * 100) }
    : null;

  return {
    surface,
    metrics,
    modelDistribution,
    modelDistributionBasis: story.models.length ? (useCostShare ? "estimated cost share" : "observed model calls") : null,
    toolDistribution,
    gitDiff,
    timeline: story.milestones.map((milestone) => ({ id: milestone.id, title: milestone.title, date: milestone.date, kind: milestone.kind })),
    sources: (pack?.sources ?? []).map((source) => ({
      ref: source.ref,
      label: providerName(source.provider),
      occurredAt: source.occurredAt,
      evidenceCount: source.evidenceRefs.length,
    })),
    signals,
  };
}
