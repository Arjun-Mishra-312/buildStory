import assert from "node:assert/strict";
import test from "node:test";
import { orbitNotesSnapshot } from "../lib/mock-projects";
import { computeChapterDelta, publicChapterDelta } from "../lib/story/chapter-delta";
import type { ProjectSnapshot } from "../lib/project-snapshot";
import type { BuilderProfile } from "../lib/ingestion/profile";

const baseProfile: BuilderProfile = {
  scores: {
    planning: { value: 60, rawInputs: {}, formula: "x" },
    steering: { value: 60, rawInputs: {}, formula: "x" },
    execution: { value: 60, rawInputs: {}, formula: "x" },
    engineering: { value: 60, rawInputs: {}, formula: "x" },
    productInstinct: { value: 60, rawInputs: {}, formula: "x" },
  },
  archetype: { name: "Velocity Machine", rationale: ["Ships fast."] },
  workPatterns: {
    peakHours: [9, 10],
    preferredDays: ["Monday"],
    medianSessionMinutes: 40,
    longestSessionMinutes: 90,
    primaryModel: "gpt-5.4-codex",
    timezoneLabel: "UTC",
  },
};

function chapterOne(): ProjectSnapshot {
  const snapshot = { ...(structuredClone(orbitNotesSnapshot) as ProjectSnapshot), builderProfile: structuredClone(baseProfile) };
  // This helper models a baseline chapter with no generated narrative. Keep
  // that premise explicit now that the public Orbit Notes showcase includes one.
  delete snapshot.narrative;
  return snapshot;
}

test("cumulative window: same start date, more of everything, produces a real delta", () => {
  const previous = chapterOne();
  const current = chapterOne();
  current.git.commits += 20;
  current.git.additions += 5_000;
  current.git.deletions += 1_000;
  current.usage.cost = { totalMicroUsd: (previous.usage.cost?.totalMicroUsd ?? 0) + 500_000, pricedTokens: 100, unpricedTokens: 0, pricingTableVersion: "v1" };

  const delta = computeChapterDelta(previous, current, 1, 2);
  assert.equal(delta.windowRelation, "cumulative");
  assert.equal(delta.build.commits.change, 20);
  assert.equal(delta.build.commits.previous, previous.git.commits);
  assert.equal(delta.spend.totalMicroUsd?.change, 500_000);
});

test("incremental window: new window starts at/after the previous window ended", () => {
  const previous = chapterOne();
  const current = chapterOne();
  current.timeWindow = {
    ...previous.timeWindow,
    startedAt: previous.timeWindow.endedAt,
    endedAt: new Date(Date.parse(previous.timeWindow.endedAt) + 3 * 86_400_000).toISOString(),
    activeDays: 3,
  };
  current.sessions = previous.sessions.slice(0, 1);

  const delta = computeChapterDelta(previous, current, 1, 2);
  assert.equal(delta.windowRelation, "incremental");
  assert.equal(delta.window.newActiveDays, current.timeWindow.activeDays, "incremental chapters report their own totals as 'new', not a subtraction");
});

test("overlapping window: neither same-start nor fully sequential", () => {
  const previous = chapterOne();
  const current = chapterOne();
  const previousStart = Date.parse(previous.timeWindow.startedAt);
  const previousEnd = Date.parse(previous.timeWindow.endedAt);
  current.timeWindow = {
    ...previous.timeWindow,
    startedAt: new Date(previousStart + (previousEnd - previousStart) / 2).toISOString(),
    endedAt: new Date(previousEnd + 86_400_000).toISOString(),
  };

  const delta = computeChapterDelta(previous, current, 1, 2);
  assert.equal(delta.windowRelation, "overlapping");
});

test("model mix: detects added, removed, and meaningfully shifted models", () => {
  const previous = chapterOne();
  const current = chapterOne();
  // Previous: two models roughly balanced. Current: drop one, add a new one, keep the other with a shifted share.
  current.usage.models = [
    { ...previous.usage.models[0]!, requests: previous.usage.models[0]!.requests + 500 },
    { id: "claude-opus-5", label: "Claude Opus 5", provider: "Anthropic", requests: 40, tokenUsage: null, costMicroUsd: null },
  ];

  const delta = computeChapterDelta(previous, current, 1, 2);
  assert.deepEqual(delta.models.removed.map((m) => m.id), ["claude-sonnet-4"]);
  assert.deepEqual(delta.models.added.map((m) => m.id), ["claude-opus-5"]);
});

test("spend delta is null unless BOTH chapters priced their usage - never a fabricated $ change", () => {
  const previous = chapterOne();
  const current = chapterOne();
  previous.usage.cost = { totalMicroUsd: null, pricedTokens: 0, unpricedTokens: 500, pricingTableVersion: "v1" };
  current.usage.cost = { totalMicroUsd: 900_000, pricedTokens: 500, unpricedTokens: 0, pricingTableVersion: "v1" };

  const delta = computeChapterDelta(previous, current, 1, 2);
  assert.equal(delta.spend.totalMicroUsd, null);
});

test("archetype change is reported by name, not diffed", () => {
  const previous = chapterOne();
  const current = chapterOne();
  current.builderProfile = { ...structuredClone(baseProfile), archetype: { name: "Architect", rationale: ["Plans deliberately."] } };

  const delta = computeChapterDelta(previous, current, 1, 2);
  assert.deepEqual(delta.profile?.archetypeChanged, { from: "Velocity Machine", to: "Architect" });
});

test("narrativeReplaced reflects only whether the new chapter carries its own narrative", () => {
  const previous = chapterOne();
  const current = chapterOne();
  assert.equal(computeChapterDelta(previous, current, 1, 2).narrativeReplaced, false);
  current.narrative = {
    headline: "h", narrative: "n", turningPoint: "t", learnings: [], decisionPatterns: [], standoutTraits: [], growthEdge: "g",
  };
  assert.equal(computeChapterDelta(previous, current, 1, 2).narrativeReplaced, true);
});

test("publicChapterDelta zeroes out every field the creator hasn't selected, mirroring the publication boundary", () => {
  const previous = chapterOne();
  const current = chapterOne();
  current.git.commits += 30;
  current.usage.cost = { totalMicroUsd: (previous.usage.cost?.totalMicroUsd ?? 0) + 1_000_000, pricedTokens: 1, unpricedTokens: 0, pricingTableVersion: "v1" };
  current.builderProfile = { ...structuredClone(baseProfile), archetype: { name: "Architect", rationale: ["x"] } };

  const delta = computeChapterDelta(previous, current, 1, 2);

  const fullyGated = publicChapterDelta(delta, ["tagline"]);
  assert.deepEqual(fullyGated.build.commits, { previous: null, current: 0, change: null });
  assert.equal(fullyGated.spend.totalMicroUsd, null);
  assert.equal(fullyGated.profile?.archetypeChanged, null);

  const gitOnly = publicChapterDelta(delta, ["tagline", "gitAggregates"]);
  assert.equal(gitOnly.build.commits.change, 30, "gitAggregates alone must still surface the commits delta");
  assert.equal(gitOnly.spend.totalMicroUsd, null, "costEstimate was not selected, so spend must stay hidden");
});
