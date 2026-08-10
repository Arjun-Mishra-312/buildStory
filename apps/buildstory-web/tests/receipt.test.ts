import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import { buildStoryFromSnapshot, publicBuildStoryFromSnapshot } from "../lib/build-story";
import type { ReportStoryPack } from "../lib/ingestion/scanner-project-snapshot";
import { reportSnapshotFromScanner } from "../lib/ingestion/report-adapter";
import type { ScannerProjectSnapshot } from "../lib/ingestion/scanner-project-snapshot";
import { ReceiptCard } from "../components/receipt-card";

async function receiptFixture() {
  const raw = JSON.parse(
    await readFile(path.resolve(process.cwd(), "tests/fixtures/scanner-project-snapshot.json"), "utf8"),
  ) as ScannerProjectSnapshot;
  raw.usage.models.push({ provider: "anthropic", name: "<synthetic>", turnCount: 10, sessionCount: 1, tokenUsage: null, costMicroUsd: null });
  raw.sessions[0]!.modelRefs.push("<synthetic>");
  const snapshot = reportSnapshotFromScanner(raw, { id: "project-receipt", slug: "project-receipt" }, {
    id: "creator-receipt",
    name: "Receipt Tester",
    handle: "receipt-tester",
    role: "Builder",
  });
  assert.equal(snapshot.usage.models.some((model) => model.label === "<synthetic>"), false);
  assert.equal(snapshot.sessions[0]!.modelIds.includes("<synthetic>"), false);
  assert.equal(snapshot.timeWindow.startedAt, "2026-08-03T11:30:00.000Z");
  assert.equal(snapshot.timeWindow.endedAt, "2026-08-03T12:00:00.000Z");
  snapshot.sessions[0]!.subagentInvocations = 14;
  snapshot.usage.models = [
    { id: "openai:gpt-5.6-sol", label: "gpt-5.6-sol", provider: "openai", requests: 1, tokenUsage: null, costMicroUsd: 1 },
    { id: "anthropic:claude-sonnet-5", label: "claude-sonnet-5", provider: "anthropic", requests: 1, tokenUsage: null, costMicroUsd: 1 },
    { id: "zai:glm-5.2", label: "glm-5.2", provider: "zai", requests: 1, tokenUsage: null, costMicroUsd: null },
  ];
  snapshot.usage.cost = {
    totalMicroUsd: 2,
    pricedTokens: 2,
    unpricedTokens: 42,
    pricingTableVersion: "test-rate-card",
  };
  return snapshot;
}

test("receipt uses deterministic cost shares and keeps unpriced models outside the denominator", async () => {
  const story = buildStoryFromSnapshot(await receiptFixture());
  assert.equal(story.dateRange, "Aug 3 — Aug 3, 2026");
  assert.equal(story.sessionCount, 1);
  assert.equal(story.subagentCount, 14);
  assert.deepEqual(story.models.map((model) => [model.label, model.share]), [
    ["gpt-5.6-sol", 50],
    ["claude-sonnet-5", 50],
    ["glm-5.2", null],
  ]);

  const html = renderToStaticMarkup(createElement(ReceiptCard, { story }));
  assert.match(html, /1 sessions/);
  assert.match(html, /14 subagent runs/);
  assert.match(html, /model calls/);
  assert.match(html, /API-equivalent spend/);
  assert.match(html, /unpriced models are excluded from the cost-share denominator/);
});

test("receipt surfaces skipped sessions and partially-priced models instead of presenting a silently partial total", async () => {
  const snapshot = await receiptFixture();
  snapshot.usage.coverage = {
    sessionsDiscovered: 17,
    sessionsIncluded: 12,
    sessionsSkipped: 5,
    skipped: [{ reason: "outside-window", count: 5 }],
    partiallyPricedModels: 1,
  };
  const story = buildStoryFromSnapshot(snapshot);

  const html = renderToStaticMarkup(createElement(ReceiptCard, { story }));
  assert.match(html, /5 sessions outside the selected window aren&#x27;t reflected in these totals\./);
  assert.match(html, /1 model priced only part of its observed usage\./);
});

test("receipt shows no coverage caveat when nothing was skipped or partially priced", async () => {
  const snapshot = await receiptFixture();
  snapshot.usage.coverage = {
    sessionsDiscovered: 1,
    sessionsIncluded: 1,
    sessionsSkipped: 0,
    skipped: [],
    partiallyPricedModels: 0,
  };
  const story = buildStoryFromSnapshot(snapshot);

  const html = renderToStaticMarkup(createElement(ReceiptCard, { story }));
  assert.doesNotMatch(html, /reflected in these totals/);
  assert.doesNotMatch(html, /priced only part of its observed usage/);
});

test("legacy narrative packs without signals remain renderable", async () => {
  const snapshot = await receiptFixture();
  snapshot.narrative = {
    headline: "A legacy build story",
    narrative: "Stored before deterministic signals were added.",
    turningPoint: "The report still has a valid evidence trail.",
    learnings: [],
    decisionPatterns: [],
    standoutTraits: [],
    growthEdge: "Keep the evidence close.",
    storyPack: {
      version: "2.0.0",
      sources: [],
      hero: { headline: "A legacy build story", summary: "Stored before deterministic signals were added." },
      buildArc: [],
      moments: [],
      turningPoint: { quote: "The report still has a valid evidence trail.", sourceRefs: [] },
      decisions: [],
      learnings: [],
      standoutTraits: [],
      growthEdge: { title: "Keep the evidence close.", observation: "The report still has a valid evidence trail.", sourceRefs: [] },
    } as unknown as ReportStoryPack,
  };

  const story = buildStoryFromSnapshot(snapshot);
  assert.deepEqual(story.narrative?.storyPack?.signals, []);
  const publicStory = publicBuildStoryFromSnapshot(snapshot, ["narrative", "storyBuildArc"]);
  assert.equal(publicStory.storyPack?.signals.length, 0);
});

test("two distinct models never collapse onto the same id just because one's name contains a colon", async () => {
  const raw = JSON.parse(
    await readFile(path.resolve(process.cwd(), "tests/fixtures/scanner-project-snapshot.json"), "utf8"),
  ) as ScannerProjectSnapshot;
  // Naive `${provider}:${name}` joining collides these two onto the same
  // string ("a:b:c") even though they're different models - see
  // report-adapter.ts's escapeIdPart.
  raw.usage.models = [
    { provider: "a", name: "b:c", turnCount: 1, sessionCount: 1, tokenUsage: null, costMicroUsd: 1_000_000 },
    { provider: "a:b", name: "c", turnCount: 1, sessionCount: 1, tokenUsage: null, costMicroUsd: 1_000_000 },
  ];
  raw.sessions[0]!.modelRefs = ["b:c", "c"];

  const snapshot = reportSnapshotFromScanner(raw, { id: "project-collision", slug: "project-collision" }, {
    id: "creator-collision",
    name: "Collision Tester",
    handle: "collision-tester",
    role: "Builder",
  });

  const ids = snapshot.usage.models.map((model) => model.id);
  assert.equal(new Set(ids).size, ids.length, `expected distinct ids, got: ${ids.join(", ")}`);

  const story = buildStoryFromSnapshot(snapshot);
  assert.deepEqual(story.models.map((model) => model.share).sort(), [50, 50], "each model must get its own cost share, not one collapsed entry");
});
