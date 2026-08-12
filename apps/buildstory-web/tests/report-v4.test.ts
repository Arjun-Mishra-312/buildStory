import assert from "node:assert/strict";
import test from "node:test";
import { buildStoryFromSnapshot, publicBuildStoryFromSnapshot } from "../lib/build-story";
import { reportSnapshotFromScanner } from "../lib/ingestion/report-adapter";
import type { NarrativeExcerpt, ScannerProjectSnapshot } from "../lib/ingestion/scanner-project-snapshot";
import { defaultStoryPack } from "../lib/narrative/story-pack";
import { adaptiveReportPolicy, createAskBuildIndex, createBuildConstellation, createDecisionAtlas, createLongitudinalPatterns, createOutcomeLab, createReportMapV4, searchAskBuildIndex, selectAdaptiveExcerpts, verifyStoryPackClaims } from "../lib/narrative/v4";
import scannerFixture from "./fixtures/scanner-project-snapshot.json";

const snapshot = () => structuredClone(scannerFixture) as unknown as ScannerProjectSnapshot;

test("V4 report maps and policies are deterministic for identical sanitized inputs", () => {
  const input = snapshot();
  assert.deepEqual(createReportMapV4(input, "deep"), createReportMapV4(structuredClone(input), "deep"));
  assert.deepEqual(adaptiveReportPolicy(input, "standard"), adaptiveReportPolicy(structuredClone(input), "standard"));
});

test("adaptive excerpt selection preserves session diversity before depth", () => {
  const excerpts: NarrativeExcerpt[] = [
    { excerptId: "exc_a0000000000000000001", sessionRef: "ses_a0000000000000000001", occurredAt: "2026-08-01T00:00:00.000Z", role: "user-intent", text: "First session intent." },
    { excerptId: "exc_a0000000000000000002", sessionRef: "ses_a0000000000000000001", occurredAt: "2026-08-01T00:01:00.000Z", role: "outcome", text: "First session outcome." },
    { excerptId: "exc_b0000000000000000001", sessionRef: "ses_b0000000000000000001", occurredAt: "2026-08-02T00:00:00.000Z", role: "user-intent", text: "Second session intent." },
  ];
  const selected = selectAdaptiveExcerpts(excerpts, {
    complexityScore: 10,
    complexityBand: "compact",
    reasoningEffort: "low",
    maxOutputTokens: 3_000,
    maxExcerpts: 2,
    maxEvidenceCharacters: 1_000,
  });
  assert.equal(selected.length, 2);
  assert.equal(new Set(selected.map((excerpt) => excerpt.sessionRef)).size, 2);
});

test("claim verification rejects citations outside the frozen source set", () => {
  const input = snapshot();
  const pack = defaultStoryPack(input);
  pack.moments[0]!.sourceRefs = ["src_unknown000000000000"];
  const verification = verifyStoryPackClaims(pack, input);
  assert.equal(verification.status, "fail");
  assert.ok(verification.issues.some((issue) => issue.code === "unknown_citation"));
});

test("Ask Your Build resolves conceptual questions only to cited indexed documents", () => {
  const input = snapshot();
  const documents = createAskBuildIndex(defaultStoryPack(input), input);
  const results = searchAskBuildIndex("Which decision was verified with a test fixture?", documents);
  assert.ok(results.every((document) => document.sourceRefs.length > 0));
  assert.deepEqual(searchAskBuildIndex("unrelated astrophysics", documents), []);
});

test("Decision Atlas nodes and edges are stable, cited, and linked to replay events when available", () => {
  const input = snapshot();
  const pack = defaultStoryPack(input);
  const atlas = createDecisionAtlas(pack, input);
  assert.deepEqual(atlas, createDecisionAtlas(structuredClone(pack), structuredClone(input)));
  assert.ok(atlas.nodes.every((node) => node.sourceRefs.length > 0 && node.chapterValid));
  assert.equal(atlas.edges.length, Math.max(0, atlas.nodes.length - 1));
});

test("Pattern Ledger promotes a pattern repeated across chapters even when each chapter has one observation", () => {
  const input = snapshot();
  const current = defaultStoryPack(input);
  const previous = structuredClone(current);
  current.standoutTraits = [{ title: "Fixture-first debugging", detail: "Current chapter repeated the pattern.", sourceRefs: [current.sources[0]!.ref] }];
  current.learnings = [];
  previous.standoutTraits = [{ title: "Fixture first debugging", detail: "Previous chapter observed the pattern.", sourceRefs: [previous.sources[0]!.ref] }];
  previous.learnings = [];
  const patterns = createLongitudinalPatterns(current, input, [previous]);
  assert.equal(patterns.length, 1);
  assert.equal(patterns[0]!.observationCount, 2);
});

test("V4 report intelligence remains creator-only in public projections", () => {
  const input = snapshot();
  const report = reportSnapshotFromScanner(input, { id: "project-v4", slug: "project-v4" }, { id: "owner", name: "Owner", handle: "owner", role: "Builder" });
  const pack = defaultStoryPack(input);
  report.narrative = {
    headline: pack.hero.headline,
    narrative: pack.hero.summary,
    turningPoint: pack.turningPoint.quote,
    learnings: pack.learnings.map((item) => item.detail),
    decisionPatterns: [],
    standoutTraits: [],
    growthEdge: pack.growthEdge.observation,
    storyPack: pack,
    reportIntelligence: {
      reportMap: createReportMapV4(input, "standard"),
      claimVerification: verifyStoryPackClaims(pack, input),
      qualityComparison: { baseline: { citationCoverage: 100, issueCount: 0, fallbackCount: 0 }, candidate: { citationCoverage: 100, issueCount: 0, fallbackCount: 0 }, delta: { citationCoverage: 0, issueCount: 0, fallbackCount: 0 } },
      decisionAtlas: createDecisionAtlas(pack, input),
      searchIndex: createAskBuildIndex(pack, input),
      patterns: createLongitudinalPatterns(pack, input),
      outcomeLab: createOutcomeLab(input),
      constellation: createBuildConstellation(input),
      pipelineMode: "dark",
    },
  };
  assert.ok(buildStoryFromSnapshot(report).narrative?.reportIntelligence);
  const publicStory = publicBuildStoryFromSnapshot(report, ["narrative"]);
  assert.equal(Boolean(publicStory.narrative && "reportIntelligence" in publicStory.narrative), false);
});
