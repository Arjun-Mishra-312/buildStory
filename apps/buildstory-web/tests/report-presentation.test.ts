import assert from "node:assert/strict";
import test from "node:test";
import { buildSignalBlocks, buildStoryMetricBlocks, dedupeReportBlocks, type ReportBlock } from "../lib/report/presentation";
import { buildProjectStoryManifest } from "../lib/story/project-story";
import type { Signal } from "../lib/ingestion/scanner-project-snapshot";

const signal = (overrides: Partial<Signal> = {}): Signal => ({
  id: "night-owl-share",
  family: "rhythm",
  headline: "27% of sessions started after 10pm",
  detail: "14 of 51 sessions began in that window.",
  value: 27,
  unit: "%",
  notability: 75,
  formula: "round(100 * nightSessions / sessions)",
  sourceRefs: [],
  ...overrides,
});

test("signal presentation chooses semantic visual variants", () => {
  const blocks = buildSignalBlocks([
    signal(),
    signal({ id: "token-heaviest-session", family: "spend", headline: "One session used 4.2B tokens", unit: "tokens", value: 4_200_000_000 }),
    signal({ id: "most-talkative-session", family: "conversation", headline: "The busiest session had 40 turns", unit: "turns", value: 40 }),
  ]);
  assert.deepEqual(blocks.map((block) => block.kind), ["distribution", "metric", "comparison"]);
});

test("semantic deduplication keeps the first editorial occurrence", () => {
  const base: ReportBlock = {
    id: "first",
    kind: "quote",
    section: "narrativeInsights",
    eyebrow: "TURNING POINT",
    title: "The build changed direction",
    summary: "The build changed direction after testing.",
    data: {},
    sourceRefs: [],
  };
  const duplicate = { ...base, id: "duplicate", eyebrow: "DEEP SIGNAL" };
  const unique = { ...base, id: "unique", title: "A different outcome", summary: "A different outcome emerged." };
  assert.deepEqual(dedupeReportBlocks([base, duplicate, unique]).map((block) => block.id), ["first", "unique"]);
});

test("project story manifest is built only from the public projection", () => {
  const story = {
    id: "report_1",
    name: "Vibe-social",
    tagline: "A social product built through AI sessions.",
    description: "A report.",
    owner: { name: "Arjun", handle: "arjun", role: "Builder" },
    storyPack: null,
    signals: [signal()],
    sessionCount: 51,
    activeDays: 12,
    git: { commits: 78, additions: 0, deletions: 0, filesTouched: 0, branches: 0, contributors: 1, firstCommitSha: "not-collected", lastCommitSha: "not-collected" },
    tokenUsage: { inputTokens: 10, cachedInputTokens: 0, outputTokens: 20, reasoningOutputTokens: 0, totalTokens: 30 },
  } as never;
  const manifest = buildProjectStoryManifest(story, "/u/arjun/vibe-social");
  assert.equal(manifest.version, "1.0");
  assert.equal(manifest.frames[0]?.title, "Vibe-social");
  assert.ok(manifest.frames.some((frame) => frame.kind === "fact"));
  assert.ok(manifest.frames.some((frame) => frame.kind === "receipt"));
});

test("metric presentation uses a model-mix block and omits withheld zero sentinels", () => {
  const blocks = buildStoryMetricBlocks({
    activeDays: 12,
    sessionCount: 51,
    subagentCount: 4,
    buildHours: 18.5,
    modelRequests: 20,
    models: [{ id: "model-a", label: "Model A", requests: 20, tokenUsage: { totalTokens: 100 }, costMicroUsd: null, share: null }],
    tokenUsage: { totalTokens: 100, inputTokens: 40, cachedInputTokens: 0, outputTokens: 60, reasoningOutputTokens: 0 },
    cost: { totalMicroUsd: 1200, unpricedTokens: 0 },
    git: { commits: 3, additions: 1, deletions: 0, filesTouched: 1, branches: 1, contributors: 1, firstCommitSha: "not-collected", lastCommitSha: "not-collected" },
    redaction: { tokensRemoved: 2 },
  } as never);
  assert.ok(blocks.some((block) => block.kind === "model-mix"));
  assert.ok(blocks.some((block) => block.kind === "comparison"));

  const withheld = buildStoryMetricBlocks({
    activeDays: 0,
    sessionCount: 0,
    subagentCount: 0,
    buildHours: 0,
    modelRequests: 0,
    models: [],
    tokenUsage: null,
    cost: null,
    git: { commits: 0, additions: 0, deletions: 0, filesTouched: 0, branches: 0, contributors: 0, firstCommitSha: "not-collected", lastCommitSha: "not-collected" },
    redaction: { tokensRemoved: 0 },
  } as never);
  assert.equal(withheld.length, 0);
});

test("project story honors a featured public signal without exposing withheld metrics", () => {
  const story = {
    id: "report_2",
    name: "Signal build",
    tagline: "",
    description: "",
    owner: { name: "Arjun", handle: "arjun", role: "Builder" },
    storyPack: null,
    signals: [signal({ id: "first", headline: "First public fact" }), signal({ id: "featured", headline: "Featured public fact" })],
    sessionCount: 0,
    activeDays: 0,
    git: { commits: 0, additions: 0, deletions: 0, filesTouched: 0, branches: 0, contributors: 0, firstCommitSha: "not-collected", lastCommitSha: "not-collected" },
    tokenUsage: null,
  } as never;
  const manifest = buildProjectStoryManifest(story, "/u/arjun/signal-build", { version: "1.0", enabled: true, frameOrder: [], hiddenFrameIds: [], featuredSignalId: "featured" });
  assert.equal(manifest.frames.find((frame) => frame.id === "fact")?.title, "Featured public fact");
  assert.equal(manifest.frames.find((frame) => frame.id === "fact")?.summary, "14 of 51 sessions began in that window.");
  assert.equal(manifest.frames.find((frame) => frame.id === "at-a-glance")?.metric, undefined);
});
