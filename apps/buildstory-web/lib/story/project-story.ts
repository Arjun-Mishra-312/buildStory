import type { PublicBuildStoryViewModel } from "@/lib/build-story";
import { buildReportBlocks, buildSignalBlocks, type ReportBlock } from "@/lib/report/presentation";

export type ProjectStoryFrameKind = "cover" | "metric" | "fact" | "moment" | "decision" | "receipt" | "outcome";

export type ProjectStoryFrame = {
  id: string;
  kind: ProjectStoryFrameKind;
  eyebrow: string;
  title: string;
  summary?: string;
  metric?: { value: string; label: string };
  block?: ReportBlock;
};

export type StoryDeckConfigV1 = {
  version: "1.0";
  enabled: boolean;
  frameOrder: string[];
  hiddenFrameIds: string[];
  featuredSignalId: string | null;
};

export type ProjectStoryManifestV1 = {
  version: "1.0";
  reportId: string;
  reportPath: string;
  projectName: string;
  ownerHandle: string;
  frames: ProjectStoryFrame[];
};

export type PublishedStoryWithManifest = PublicBuildStoryViewModel & {
  storyManifest?: ProjectStoryManifestV1 | null;
};

export function defaultStoryDeckConfig(): StoryDeckConfigV1 {
  return { version: "1.0", enabled: true, frameOrder: [], hiddenFrameIds: [], featuredSignalId: null };
}

export function normalizeStoryDeckConfig(value: unknown): StoryDeckConfigV1 {
  if (!value || typeof value !== "object") return defaultStoryDeckConfig();
  const candidate = value as Partial<StoryDeckConfigV1>;
  if (candidate.version !== "1.0") return defaultStoryDeckConfig();
  return {
    version: "1.0",
    enabled: candidate.enabled !== false,
    frameOrder: Array.isArray(candidate.frameOrder) ? [...new Set(candidate.frameOrder.filter((item): item is string => typeof item === "string"))] : [],
    hiddenFrameIds: Array.isArray(candidate.hiddenFrameIds) ? [...new Set(candidate.hiddenFrameIds.filter((item): item is string => typeof item === "string"))] : [],
    featuredSignalId: typeof candidate.featuredSignalId === "string" ? candidate.featuredSignalId : null,
  };
}

function compactNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return Math.round(value).toLocaleString("en-US");
}

function firstBlock(blocks: ReportBlock[], predicate: (block: ReportBlock) => boolean): ReportBlock | undefined {
  return blocks.find(predicate);
}

export function applyStoryDeckConfig(frames: ProjectStoryFrame[], configValue?: unknown): ProjectStoryFrame[] {
  const config = normalizeStoryDeckConfig(configValue);
  if (!config.enabled) return [];
  const hidden = new Set(config.hiddenFrameIds);
  const byId = new Map(frames.map((frame) => [frame.id, frame]));
  const ordered = [
    ...config.frameOrder.map((id) => byId.get(id)).filter((frame): frame is ProjectStoryFrame => Boolean(frame)),
    ...frames.filter((frame) => !config.frameOrder.includes(frame.id)),
  ];
  return ordered.filter((frame) => !hidden.has(frame.id));
}

export function buildProjectStoryManifest(
  story: PublicBuildStoryViewModel,
  reportPath: string,
  configValue?: unknown,
): ProjectStoryManifestV1 {
  const config = normalizeStoryDeckConfig(configValue);
  const pack = story.storyPack;
  const blocks = pack
    ? buildReportBlocks(pack, { includeDeep: true, includeSignals: true, against: [pack.hero.headline, pack.hero.summary] })
    : buildSignalBlocks(story.signals);
  const featuredFact = config.featuredSignalId
    ? firstBlock(blocks, (block) => block.id === `signal:${config.featuredSignalId}`)
    : undefined;
  const fact = featuredFact ?? firstBlock(blocks, (block) => block.kind === "metric" || block.kind === "distribution");
  const moment = firstBlock(blocks, (block) => block.kind === "timeline");
  const decision = firstBlock(blocks, (block) => block.kind === "decision" || block.kind === "quote");
  const tokenValue = story.tokenUsage?.totalTokens;
  const glanceMetrics = [
    story.sessionCount > 0 ? `${story.sessionCount} AI sessions` : null,
    story.git.commits > 0 ? `${story.git.commits} commits` : null,
    tokenValue && tokenValue > 0 ? `${compactNumber(tokenValue)} tokens` : null,
  ].filter((value): value is string => Boolean(value));
  const atAGlanceSummary = glanceMetrics.length > 0
    ? `${glanceMetrics.join(" · ")}.`
    : "Selected public report fields, ready to inspect.";
  const frames: ProjectStoryFrame[] = [
    {
      id: "cover",
      kind: "cover",
      eyebrow: "PROJECT STORY",
      title: story.name,
      summary: story.tagline || story.description || "A private report of how this build came together.",
    },
    {
      id: "at-a-glance",
      kind: "metric",
      eyebrow: "AT A GLANCE",
      title: "The shape of the build",
      summary: atAGlanceSummary,
      ...(story.sessionCount > 0 ? { metric: { value: `${story.sessionCount}`, label: "AI sessions" } } : {}),
      block: {
        id: "story:at-a-glance",
        kind: "comparison",
        section: "narrativeSignals",
        eyebrow: "AT A GLANCE",
        title: glanceMetrics.length ? glanceMetrics.join(" · ") : "Public build signals",
        summary: story.activeDays > 0 ? `${story.activeDays} active days across the build window.` : "Only fields selected for publication are shown here.",
        data: { sessions: story.sessionCount, commits: story.git.commits, tokens: tokenValue },
        sourceRefs: [],
      },
    },
    fact ? { id: "fact", kind: "fact", eyebrow: "COMPUTED FACT", title: fact.title, summary: fact.summary, block: fact } : {
      id: "fact",
      kind: "fact",
      eyebrow: "COMPUTED FACT",
      title: story.sessionCount > 0 ? `${story.sessionCount} AI sessions shaped this build` : "Computed facts are optional",
      summary: story.sessionCount > 0 ? "Computed from the selected report fields." : "Select a fact field when you are ready to publish one.",
    },
    moment ? { id: "moment", kind: "moment", eyebrow: "BUILD MOMENT", title: moment.title, summary: moment.summary, block: moment } : {
      id: "moment",
      kind: "moment",
      eyebrow: "BUILD MOMENT",
      title: "The build kept moving",
      summary: "Open the full report to inspect the evidence-backed moments.",
    },
    decision ? { id: "decision", kind: "decision", eyebrow: decision.eyebrow, title: decision.title, summary: decision.summary, block: decision } : {
      id: "decision",
      kind: "decision",
      eyebrow: "DECISION",
      title: "A choice became part of the story",
      summary: "The full report keeps the rationale and source context private until selected.",
    },
    {
      id: "receipt",
      kind: "receipt",
      eyebrow: "VERIFIED RECEIPT",
      title: "Private by default",
      summary: "This story is built from selected report fields. Sensitive patterns are redacted locally; publishing is optional.",
    },
    {
      id: "outcome",
      kind: "outcome",
      eyebrow: "KEEP EXPLORING",
      title: "See the full report",
      summary: "Open the evidence, chapters, and technical details behind this Project Story.",
    },
  ];
  return {
    version: "1.0",
    reportId: story.id,
    reportPath,
    projectName: story.name,
    ownerHandle: story.owner.handle,
    frames: applyStoryDeckConfig(frames, config),
  };
}

export function manifestForPublishedStory(
  story: PublishedStoryWithManifest,
  reportPath: string,
): ProjectStoryManifestV1 {
  return story.storyManifest?.version === "1.0"
    ? story.storyManifest
    : buildProjectStoryManifest(story, reportPath);
}
