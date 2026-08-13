import assert from "node:assert/strict";
import test from "node:test";
import { publicBuildStoryFromSnapshot } from "../lib/build-story";
import { reportSnapshotFromScanner } from "../lib/ingestion/report-adapter";
import { validateProjectSnapshot } from "../lib/ingestion/validation";
import { defaultStoryPack, normalizeDeepStoryPack, normalizeStoryPack, validateDeepAnalysisComponent, validateStoryPackComponent } from "../lib/narrative/story-pack";
import type { ScannerProjectSnapshot } from "../lib/ingestion/scanner-project-snapshot";
import scannerFixture from "./fixtures/scanner-project-snapshot.json";
import legacyScannerFixture from "./fixtures/legacy-scanner-project-snapshot.json";

const snapshot = scannerFixture as unknown as ScannerProjectSnapshot;
// Deliberately schemaVersion 1.2.0, kept only for the legacy-rejection test
// below. The shared `snapshot` fixture above must stay on the CURRENT schema:
// tests/d1-runtime-smoke.mjs uploads it through the real API in CI and needs
// it to actually validate, which a fixture crafted to be rejected cannot do.
const legacySnapshot = legacyScannerFixture as unknown as ScannerProjectSnapshot;

test("story-pack component validation rejects malformed structure, enums, cardinality, and provenance", () => {
  const pack = defaultStoryPack(snapshot);
  const refs = new Set(pack.sources.map((source) => source.ref));
  assert.equal(validateStoryPackComponent({
    hero: pack.hero,
    buildArc: pack.buildArc,
    moments: pack.moments,
    turningPoint: pack.turningPoint,
  }, "story", refs).ok, true);

  const malformed = structuredClone(pack) as Record<string, unknown>;
  const moments = malformed.moments as Array<Record<string, unknown>>;
  moments[0]!.kind = "invented-kind";
  moments.push(...moments.slice(0, 3));
  const firstRefs = (moments[1]!.sourceRefs as string[]);
  moments[1]!.sourceRefs = [...firstRefs, firstRefs[0] ?? "unknown"];
  const result = validateStoryPackComponent({
    hero: malformed.hero,
    buildArc: malformed.buildArc,
    moments,
    turningPoint: malformed.turningPoint,
  }, "story", refs);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("unsupported")));
  assert.ok(result.errors.some((error) => error.includes("at most 5")));
  assert.ok(result.errors.some((error) => error.includes("duplicates") || error.includes("unknown")));
});

test("normalization always emits one build arc per phase and records component fallbacks", () => {
  const result = normalizeStoryPack({ hero: { headline: "Only a headline" }, buildArc: [{ phase: "discover" }] }, snapshot);
  assert.deepEqual(result.storyPack.buildArc.map((phase) => phase.phase), ["discover", "decide", "deliver"]);
  assert.equal(result.storyPack.moments.length, 3);
  assert.ok(result.fallbacksUsed.includes("moments"));
  assert.ok(result.fallbacksUsed.includes("decisions"));
  assert.ok(result.fallbacksUsed.includes("learnings"));
});

test("deep findings accept the six source references allowed by their response schema", () => {
  const allowed = new Set(["S01", "S02", "S03", "S04", "S05", "S06"]);
  const finding = { title: "Cross-session finding", summary: "Supported across the selected sessions.", sourceRefs: [...allowed], confidence: "high" };
  const result = validateDeepAnalysisComponent({
    openingLine: finding,
    signatureMoves: [finding],
    byTheNumbers: [{ ...finding, signalId: "night-owl-share" }],
    whereItGotHard: [],
    chapterChanges: [],
  }, allowed);
  assert.equal(result.ok, true, result.errors.join("; "));
});

test("a byTheNumbers finding citing an unknown signalId fails validation", () => {
  const allowed = new Set(["S01"]);
  const finding = { title: "Fabricated stat", summary: "A number with no computed signal behind it.", sourceRefs: ["S01"], confidence: "high" };
  const allowedSignalIds = new Set(["night-owl-share"]);
  const result = validateDeepAnalysisComponent({
    openingLine: finding,
    signatureMoves: [],
    byTheNumbers: [{ ...finding, signalId: "a-signal-that-was-never-computed" }],
    whereItGotHard: [],
    chapterChanges: [],
  }, allowed, allowedSignalIds);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("references unknown signal")));
});

test("recap slides must cite real signalIds when they name one", () => {
  const allowed = new Set(["S01"]);
  const finding = { title: "Evidence synthesis", summary: "The reviewed evidence supports this finding.", sourceRefs: ["S01"], confidence: "high" };
  const slide = { kind: "title", kicker: "Your build", headline: "Here's how this one went.", body: "A true detail from this build.", sourceRefs: [] };
  const result = validateDeepAnalysisComponent({
    openingLine: finding,
    signatureMoves: [],
    byTheNumbers: [{ ...finding, signalId: "night-owl-share" }],
    whereItGotHard: [],
    chapterChanges: [],
    recap: {
      slides: [
        slide,
        { ...slide, kind: "scale" },
        { ...slide, kind: "signature", signalId: "night-owl-share", sourceRefs: ["S01"] },
        { ...slide, kind: "close" },
      ],
    },
  }, allowed, new Set(["night-owl-share"]));
  assert.equal(result.ok, true, result.errors.join("; "));

  const unknown = validateDeepAnalysisComponent({
    openingLine: finding,
    signatureMoves: [],
    byTheNumbers: [{ ...finding, signalId: "night-owl-share" }],
    whereItGotHard: [],
    chapterChanges: [],
    recap: {
      slides: [
        slide,
        { ...slide, kind: "scale" },
        { ...slide, kind: "signature", signalId: "invented-signal", sourceRefs: ["S01"] },
        { ...slide, kind: "close" },
      ],
    },
  }, allowed, new Set(["night-owl-share"]));
  assert.equal(unknown.ok, false);
  assert.ok(unknown.errors.some((error) => error.includes("unknown signal")));
});

test("omitting recap stays valid and normalizeRecap drops empty headlines instead of padding them", () => {
  const pack = defaultStoryPack(snapshot);
  const refs = new Set(pack.sources.map((source) => source.ref));
  assert.equal(validateStoryPackComponent({
    hero: pack.hero,
    buildArc: pack.buildArc,
    moments: pack.moments,
    turningPoint: pack.turningPoint,
  }, "story", refs).ok, true);

  const normalized = normalizeStoryPack({
    ...pack,
    recap: {
      slides: [
        { kind: "title", kicker: "Your build", headline: "Kept hook", sourceRefs: [] },
        { kind: "scale", kicker: "Scale", headline: "   ", sourceRefs: [] },
        { kind: "signature", kicker: "Sig", headline: "A true beat", sourceRefs: [], layout: "cubes" },
        { kind: "turning", kicker: "Turn", headline: "The night it clicked", sourceRefs: [] },
        { kind: "receipt", kicker: "Receipt", headline: "Itemized", sourceRefs: [] },
        { kind: "close", kicker: "Close", headline: "Done", sourceRefs: [], layout: "stat-grid" },
      ],
    },
  }, snapshot);
  assert.ok(normalized.storyPack.recap);
  assert.equal(normalized.storyPack.recap.slides.some((slide) => !slide.headline.trim()), false);
  assert.equal(normalized.storyPack.recap.slides.find((slide) => slide.kind === "signature")?.layout, undefined);
  assert.equal(normalized.storyPack.recap.slides.find((slide) => slide.kind === "close")?.layout, "stat-grid");

  const thin = normalizeStoryPack({
    recap: {
      slides: [
        { kind: "title", kicker: "Your build", headline: "", sourceRefs: [] },
        { kind: "scale", kicker: "Scale", headline: "", sourceRefs: [] },
        { kind: "close", kicker: "Close", headline: "Only one real line", sourceRefs: [] },
      ],
    },
  }, snapshot);
  assert.equal(thin.storyPack.recap, undefined);
});

test("Deep synthesis keeps analysis-pass recap slides", () => {
  const pack = defaultStoryPack(snapshot);
  const finding = {
    title: "Evidence synthesis",
    summary: "The reviewed evidence supports this finding.",
    sourceRefs: pack.sources[0] ? [pack.sources[0].ref] : [],
    confidence: "high" as const,
  };
  const result = normalizeDeepStoryPack({
    ...pack,
    deepAnalysis: {
      openingLine: finding,
      signatureMoves: [finding],
      byTheNumbers: pack.signals[0] ? [{ ...finding, signalId: pack.signals[0].id }] : [],
      whereItGotHard: [],
      chapterChanges: [],
      recap: {
        slides: [
          { kind: "title", kicker: "Your build", headline: "Analysis recap hook", sourceRefs: [] },
          { kind: "scale", kicker: "Scale", headline: "The shape of it", sourceRefs: [], layout: "stat-grid" },
          { kind: "receipt", kicker: "Receipt", headline: "Itemized", sourceRefs: [] },
          { kind: "close", kicker: "Close", headline: "Ready", sourceRefs: [] },
        ],
      },
    },
  }, snapshot);
  assert.equal(result.storyPack.recap?.slides[0]?.headline, "Analysis recap hook");
  assert.equal(result.storyPack.recap?.slides[1]?.layout, "stat-grid");
});

test("Deep narrative validation preserves up to twelve supported moments while Standard remains compact", () => {
  const pack = defaultStoryPack(snapshot);
  const refs = new Set(pack.sources.map((source) => source.ref));
  const moments = Array.from({ length: 12 }, (_, index) => ({
    ...pack.moments[index % pack.moments.length]!,
    title: `Supported Deep moment ${index + 1}`,
  }));
  const narrative = { ...pack, moments };
  assert.equal(validateStoryPackComponent(narrative, "deep-narrative", refs).ok, true);
  assert.equal(validateStoryPackComponent(narrative, "story", refs).ok, false);
});

test("Deep narrative validation caps breakthrough moments at two", () => {
  const pack = defaultStoryPack(snapshot);
  const refs = new Set(pack.sources.map((source) => source.ref));
  const moments = pack.moments.map((moment) => ({ ...moment, kind: "breakthrough" as const }));
  const result = validateStoryPackComponent({ ...pack, moments }, "deep-narrative", refs);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("at most 2 breakthrough moments")));
});

test("an over-length string is a non-fatal warning, not a validation error", () => {
  const pack = defaultStoryPack(snapshot);
  const refs = new Set(pack.sources.map((source) => source.ref));
  const overLong = { ...pack.hero, summary: "x".repeat(500) }; // hero.summary maxLength is 480
  const result = validateStoryPackComponent({ ...pack, hero: overLong }, "story", refs);
  assert.equal(result.ok, true, result.errors.join("; "));
  assert.ok(result.warnings.some((warning) => warning.includes("hero.summary") && warning.includes("at most 480")));
});

test("the legacy flat-shape bypass only applies to story/insights, never deep-narrative or deep", () => {
  const legacy = { headline: "Legacy", narrative: "Flat pre-V2 shape.", turningPoint: "A flat string, not an object." };
  assert.equal(validateStoryPackComponent(legacy, "story", new Set()).ok, true, "story keeps the legacy bypass for backward compatibility");
  assert.equal(validateStoryPackComponent(legacy, "deep-narrative", new Set()).ok, false, "deep-narrative must reject the legacy shape instead of silently passing a paid Deep generation as unvalidated fallback content");
});

test("public story projection exposes only safe fallback metadata and strips session/excerpt references", () => {
  const pack = defaultStoryPack(snapshot);
  const privateSnapshot = reportSnapshotFromScanner({
    ...snapshot,
    generatedNarrative: {
      version: "2.0.0",
      generatedAt: snapshot.generatedAt,
      mode: "local",
      provider: "ollama",
      model: "gemma4:12b",
      sections: {
        headline: pack.hero.headline,
        narrative: pack.hero.summary,
        turningPoint: pack.turningPoint.quote,
        learnings: pack.learnings.map((item) => item.detail),
        decisionPatterns: pack.decisions.map((item) => item.rationale),
        standoutTraits: pack.standoutTraits.map((item) => item.detail),
        growthEdge: pack.growthEdge.observation,
      },
      storyPack: pack,
      fallbacksUsed: ["moments"],
    },
  }, { id: "project_test", slug: "test-project" }, { id: "usr_test", name: "Test Builder", handle: "test", role: "Builder" });
  const projection = publicBuildStoryFromSnapshot(privateSnapshot, ["narrative", "storyMoments"]);
  assert.deepEqual(projection.fallbacksUsed, ["moments"]);
  assert.deepEqual(projection.narrative?.fallbacksUsed, ["moments"]);
  assert.ok(projection.storyPack);
  assert.ok(projection.storyPack!.sources.every((source) => !("sessionRef" in source) && !("excerptRef" in source)));
});

test("artifact links and media are gated by the artifactLinks/artifactMedia PublicFieldKeys, and only well-formed https URLs cross the boundary", () => {
  const privateSnapshot = reportSnapshotFromScanner(
    snapshot,
    { id: "project_test", slug: "test-project" },
    { id: "usr_test", name: "Test Builder", handle: "test", role: "Builder" },
  );
  const artifact = {
    projectUrl: "https://example.com/app",
    repoUrl: "https://github.com/example/app",
    videoUrl: "javascript:alert(1)",
    media: [{ id: "med_1", url: "https://media.buildstory.dev/media/rpt_1/a.png", kind: "cover" as const }],
  };

  const hidden = publicBuildStoryFromSnapshot(privateSnapshot, ["tagline"], undefined, artifact);
  assert.deepEqual(hidden.artifactLinks, { projectUrl: null, repoUrl: null, videoUrl: null });
  assert.deepEqual(hidden.artifactMedia, []);

  const shown = publicBuildStoryFromSnapshot(privateSnapshot, ["artifactLinks", "artifactMedia"], undefined, artifact);
  assert.equal(shown.artifactLinks.projectUrl, "https://example.com/app");
  assert.equal(shown.artifactLinks.repoUrl, "https://github.com/example/app");
  assert.equal(shown.artifactLinks.videoUrl, null, "a non-https URL never crosses the publication boundary even when selected");
  assert.deepEqual(shown.artifactMedia, artifact.media);
});

test("production upload validation rejects legacy scanner contracts", () => {
  const previous = process.env.NODE_ENV;
  Reflect.set(process.env, "NODE_ENV", "production");
  try {
    const result = validateProjectSnapshot(legacySnapshot);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.errors[0] ?? "", /Production uploads require ProjectSnapshot 1\.7\.0/);
  } finally {
    if (previous === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
    else Reflect.set(process.env, "NODE_ENV", previous);
  }
});
