import assert from "node:assert/strict";
import test from "node:test";
import { dedupeFindings, mergeDeepIntoPack, normalizeTitle } from "../lib/narrative/dedupe";
import type { ReportStoryPackV2, ReportStoryPackV3 } from "../lib/ingestion/scanner-project-snapshot";

const v2Pack: ReportStoryPackV2 = {
  version: "2.0.0",
  sources: [],
  hero: { headline: "How it went", summary: "It went fine." },
  buildArc: [{ phase: "discover", headline: "Discover", summary: "Explored.", sourceRefs: [] }],
  moments: [],
  turningPoint: { quote: "", sourceRefs: [] },
  decisions: [],
  learnings: [],
  standoutTraits: [{ title: "Methodical", detail: "Checked every path.", sourceRefs: [] }],
  growthEdge: { title: "", observation: "", sourceRefs: [] },
  signals: [],
};

function deepPack(overrides: Partial<NonNullable<ReportStoryPackV3["deepAnalysis"]>> = {}): ReportStoryPackV3 {
  return {
    ...v2Pack,
    version: "3.0.0",
    analysisTier: "deep",
    deepAnalysis: {
      openingLine: { title: "Opening line", summary: "The central finding.", sourceRefs: [], confidence: "high" },
      signatureMoves: [{ title: "Signature move", summary: "A distinct pattern.", sourceRefs: [], confidence: "high" }],
      byTheNumbers: [],
      whereItGotHard: [{ title: "Where it got hard", summary: "A recovery story.", sourceRefs: [], confidence: "medium" }],
      chapterChanges: [{ title: "Chapter change", summary: "What changed.", sourceRefs: [], confidence: "high" }],
      coverage: { sessionsSeen: 1, excerptsUsed: 1, evidenceBytes: 10, windowStart: "2026-01-01T00:00:00.000Z", windowEnd: "2026-01-02T00:00:00.000Z" },
      ...overrides,
    },
  };
}

test("normalizeTitle lowercases, strips punctuation, and collapses whitespace", () => {
  assert.equal(normalizeTitle("  Shipped the Sync Engine!  "), "shipped the sync engine");
  assert.equal(normalizeTitle("A/B Testing"), "ab testing");
});

test("dedupeFindings drops candidates matching an existing title or title+summary-prefix", () => {
  const existing = [{ title: "Methodical builder", summary: "Checked every merge path before shipping." }];
  const candidates = [
    { title: "Methodical Builder", summary: "Something else entirely." }, // same title, different summary -> still a dup by title
    { title: "Decisive under pressure", summary: "Checked every merge path before shipping fast." }, // different title, near-identical summary prefix -> dup
    { title: "Ships in small steps", summary: "Broke every change into reviewable slices." }, // genuinely new
  ];
  const result = dedupeFindings(existing, candidates);
  assert.deepEqual(result.map((item) => item.title), ["Ships in small steps"]);
});

test("dedupeFindings also dedupes candidates against each other, preserving order", () => {
  const candidates = [
    { title: "Fixed the flaky test", summary: "Root-caused a timing issue." },
    { title: "fixed the FLAKY test", summary: "Root-caused a timing issue in CI." },
    { title: "Shipped the sync engine", summary: "Local-first from day one." },
  ];
  const result = dedupeFindings([], candidates);
  assert.deepEqual(result.map((item) => item.title), ["Fixed the flaky test", "Shipped the sync engine"]);
});

test("mergeDeepIntoPack is a no-op for V2 packs", () => {
  const merged = mergeDeepIntoPack(v2Pack, { hasLivePreviewDelta: false });
  assert.equal(merged.openingLineKicker, null);
  assert.equal(merged.standoutTraits.length, 0);
  assert.equal(merged.extraBreakthroughs.length, 0);
  assert.equal(merged.chapterChanges.length, 0);
  assert.equal(merged.coverage, null);
});

test("mergeDeepIntoPack is a no-op for V3 packs with no deepAnalysis (the field is optional)", () => {
  const pack: ReportStoryPackV3 = { ...v2Pack, version: "3.0.0", analysisTier: "standard" };
  const merged = mergeDeepIntoPack(pack, { hasLivePreviewDelta: false });
  assert.equal(merged.openingLineKicker, null);
  assert.equal(merged.coverage, null);
});

test("mergeDeepIntoPack suppresses the opening-line kicker when it restates the hero headline", () => {
  const pack = deepPack({ openingLine: { title: "How it went", summary: "Restated.", sourceRefs: [], confidence: "high" } });
  const merged = mergeDeepIntoPack(pack, { hasLivePreviewDelta: false });
  assert.equal(merged.openingLineKicker, null);
});

test("mergeDeepIntoPack surfaces a genuinely distinct opening line", () => {
  const pack = deepPack();
  const merged = mergeDeepIntoPack(pack, { hasLivePreviewDelta: false });
  assert.equal(merged.openingLineKicker?.title, "Opening line");
});

test("mergeDeepIntoPack folds non-duplicate signatureMoves into standoutTraits and drops duplicates", () => {
  const pack = deepPack({ signatureMoves: [{ title: "Methodical", summary: "Same trait, restated.", sourceRefs: [], confidence: "high" }] });
  const merged = mergeDeepIntoPack(pack, { hasLivePreviewDelta: false });
  assert.deepEqual(merged.standoutTraits.map((trait) => trait.title), ["Methodical"]);

  const distinctPack = deepPack();
  const distinctMerged = mergeDeepIntoPack(distinctPack, { hasLivePreviewDelta: false });
  assert.deepEqual(distinctMerged.standoutTraits.map((trait) => trait.title), ["Methodical", "Signature move"]);
  assert.equal(distinctMerged.standoutTraits[1]?.confidence, "high");
});

test("mergeDeepIntoPack dedupes whereItGotHard against existing breakthrough moments and the turning point", () => {
  const pack: ReportStoryPackV3 = {
    ...deepPack({ whereItGotHard: [{ title: "Recovered from the outage", summary: "Rolled back and re-deployed.", sourceRefs: [], confidence: "medium" }] }),
    moments: [{ phase: "deliver", kind: "breakthrough", title: "Recovered from the outage", whatHappened: "Rolled back and re-deployed.", whyItMattered: "Kept the demo on track.", sourceRefs: [] }],
  };
  const merged = mergeDeepIntoPack(pack, { hasLivePreviewDelta: false });
  assert.equal(merged.extraBreakthroughs.length, 0);
});

test("mergeDeepIntoPack suppresses chapterChanges when a live preview delta is already shown", () => {
  const pack = deepPack();
  const withDelta = mergeDeepIntoPack(pack, { hasLivePreviewDelta: true });
  const withoutDelta = mergeDeepIntoPack(pack, { hasLivePreviewDelta: false });
  assert.equal(withDelta.chapterChanges.length, 0);
  assert.equal(withoutDelta.chapterChanges.length, 1);
});
