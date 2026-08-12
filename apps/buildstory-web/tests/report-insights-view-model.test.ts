import assert from "node:assert/strict";
import test from "node:test";
import { buildStoryFromSnapshot, publicBuildStoryFromSnapshot } from "../lib/build-story";
import { reportSnapshotFromScanner } from "../lib/ingestion/report-adapter";
import type { ScannerProjectSnapshot } from "../lib/ingestion/scanner-project-snapshot";
import { defaultStoryPack } from "../lib/narrative/story-pack";
import { createAskBuildIndex, createBuildConstellation, createDecisionAtlas, createLongitudinalPatterns, createOutcomeLab, createReportMapV4, verifyStoryPackClaims } from "../lib/narrative/v4";
import { buildReportInsightsViewModel, summarizeDistribution } from "../lib/report/report-insights-view-model";
import scannerFixture from "./fixtures/scanner-project-snapshot.json";

const scanner = () => structuredClone(scannerFixture) as unknown as ScannerProjectSnapshot;

test("session distributions handle quartiles, invalid values, small samples, and identical values", () => {
  const distribution = summarizeDistribution([30, Number.NaN, -1, 10, 50, 20, 40], "duration", "Duration", "minutes");
  assert.deepEqual(distribution && {
    values: distribution.values,
    minimum: distribution.minimum,
    q1: distribution.q1,
    median: distribution.median,
    q3: distribution.q3,
    maximum: distribution.maximum,
    useBoxPlot: distribution.useBoxPlot,
  }, { values: [10, 20, 30, 40, 50], minimum: 10, q1: 20, median: 30, q3: 40, maximum: 50, useBoxPlot: true });
  assert.equal(summarizeDistribution([2, 4, 8, 16], "turns", "Turns", "turns")?.useBoxPlot, false);
  assert.equal(summarizeDistribution([7, 7, 7, 7, 7], "toolCalls", "Calls", "calls")?.useBoxPlot, false);
  assert.equal(summarizeDistribution([Number.NaN, -2], "duration", "Duration", "minutes"), null);
});

test("public insight models use only projected story-pack fields", () => {
  const input = scanner();
  const report = reportSnapshotFromScanner(input, { id: "insights-project", slug: "insights-project" }, { id: "owner", name: "Owner", handle: "owner", role: "Builder" });
  const privatePack = defaultStoryPack(input);
  report.narrative = {
    headline: privatePack.hero.headline,
    narrative: privatePack.hero.summary,
    turningPoint: privatePack.turningPoint.quote,
    learnings: privatePack.learnings.map((item) => item.detail),
    decisionPatterns: [],
    standoutTraits: [],
    growthEdge: privatePack.growthEdge.observation,
    storyPack: privatePack,
  };
  const projected = publicBuildStoryFromSnapshot(report, ["narrative", "storyBuildArc", "storyMoments", "storyTurningPoint"]);
  const preview = buildReportInsightsViewModel({ story: projected, surface: "preview", pack: projected.storyPack });
  const published = buildReportInsightsViewModel({ story: projected, surface: "public", pack: projected.storyPack });
  assert.deepEqual({ ...preview, surface: "public" }, published);
  assert.equal(preview.dossier.length, 0, "hidden decisions must not be reconstructed");
  assert.equal(preview.sessionShape.length, 0);
  assert.equal(preview.outcomes.length, 0);
  const serialized = JSON.stringify(preview);
  assert.equal(serialized.includes("snapshotHash"), false);
  assert.equal(serialized.includes("remotePath"), false);
  assert.equal(serialized.includes("excerpt"), false);
});

test("private insight model consolidates arc, moments, model phases, sessions, and outcomes once", () => {
  const input = scanner();
  const report = reportSnapshotFromScanner(input, { id: "insights-private", slug: "insights-private" }, { id: "owner", name: "Owner", handle: "owner", role: "Builder" });
  const pack = defaultStoryPack(input);
  const intelligence = {
    reportMap: createReportMapV4(input, "standard"),
    claimVerification: verifyStoryPackClaims(pack, input),
    qualityComparison: { baseline: { citationCoverage: 100, issueCount: 0, fallbackCount: 0 }, candidate: { citationCoverage: 100, issueCount: 0, fallbackCount: 0 }, delta: { citationCoverage: 0, issueCount: 0, fallbackCount: 0 } },
    decisionAtlas: createDecisionAtlas(pack, input),
    searchIndex: createAskBuildIndex(pack, input),
    patterns: createLongitudinalPatterns(pack, input),
    outcomeLab: createOutcomeLab(input),
    constellation: createBuildConstellation(input),
    pipelineMode: "dark" as const,
  };
  report.narrative = { headline: pack.hero.headline, narrative: pack.hero.summary, turningPoint: pack.turningPoint.quote, learnings: [], decisionPatterns: [], standoutTraits: [], growthEdge: "", storyPack: pack, reportIntelligence: intelligence };
  const story = buildStoryFromSnapshot(report);
  const model = buildReportInsightsViewModel({ story, surface: "private", pack, intelligence });
  assert.deepEqual(model.journey.map((phase) => phase.phase), pack.buildArc.map((phase) => phase.phase));
  assert.equal(model.journey.flatMap((phase) => phase.moments).length, pack.moments.filter((moment) => pack.buildArc.some((phase) => phase.phase === moment.phase)).length);
  assert.ok(model.sessionShape.length > 0);
  assert.deepEqual(model.outcomes.map((outcome) => outcome.id), intelligence.outcomeLab.metrics.map((metric) => metric.metricId));
  assert.equal("modelPhaseHeatmap" in model, false);
  assert.equal("buildReplay" in model, false);
  assert.equal("constellation" in model, false);
});
