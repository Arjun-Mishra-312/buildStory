import assert from "node:assert/strict";
import test from "node:test";
import { vibeSocialSnapshot } from "../lib/mock-projects";
import { buildRecapScript, durationForSlide, findRecapSlide, formatRecapCount, parseRecapNumber, recapShowsArt, textScaleForSlide } from "../lib/report/recap";
import { computeRecapWidgets } from "../lib/report/recap-widgets";
import { featuredSignals, formatSignalValue, illustrationForSignal, kickerForFamily } from "../lib/report/poster-art";

test("deterministic recap builds a second-person show from signals and the turning beat", () => {
  const pack = vibeSocialSnapshot.narrative?.storyPack ?? null;
  const script = buildRecapScript({
    projectName: vibeSocialSnapshot.identity.name,
    sessionCount: vibeSocialSnapshot.sessions.length,
    activeDays: vibeSocialSnapshot.timeWindow.activeDays,
    commits: vibeSocialSnapshot.git.commits,
    buildHours: 40,
    status: "shipped",
    archetypeName: vibeSocialSnapshot.builderProfile?.archetype.name,
    pack,
    signals: pack?.signals ?? [],
  });
  assert.ok(script.slides.length >= 5);
  assert.equal(script.slides[0]?.kind, "title");
  assert.match(script.slides[0]?.headline ?? "", /Vibe Social|vibe/i);
  assert.equal(script.slides.some((slide) => slide.kind === "scale"), true);
  assert.equal(script.slides.some((slide) => slide.kind === "signature"), true);
  assert.equal(script.slides.some((slide) => slide.kind === "receipt"), true);
  assert.equal(script.slides.at(-1)?.kind, "close");
  assert.match(script.slides.at(-1)?.headline ?? "", /private recap is ready/i);
  const signature = script.slides.find((slide) => slide.kind === "signature" && slide.beat === "reveal");
  assert.ok(signature?.signalId);
  assert.ok(signature?.howWeKnow);
  assert.equal(signature?.textScale, "medium");
  assert.equal(recapShowsArt(signature!), false);
  assert.ok(signature?.visual.startsWith("/assets/illustrations/"));
  assert.notEqual(signature?.kicker, "The thing you'll remember");
  const setup = script.slides.find((slide) => slide.kind === "signature" && slide.beat === "setup");
  assert.ok(setup?.headline);
  assert.equal(setup?.giantValue, undefined);
});

test("featured signals prefer higher notability", () => {
  const pack = vibeSocialSnapshot.narrative?.storyPack ?? null;
  const featured = featuredSignals(pack?.signals ?? [], 3);
  assert.equal(featured.length, 3);
  assert.ok(featured[0]!.notability >= featured[1]!.notability);
  assert.ok(illustrationForSignal(featured[0]!).includes("/assets/illustrations/"));
});

test("poster art matches token and longest facts by id, not only canonical scanner ids", () => {
  assert.ok(illustrationForSignal({ id: "vibe-tokens", family: "conversation" }).includes("token-stacks"));
  assert.ok(illustrationForSignal({ id: "vibe-longest", family: "rhythm" }).includes("marathon-coder"));
  assert.ok(illustrationForSignal({ id: "vibe-night", family: "rhythm" }).includes("night-owl"));
  assert.ok(illustrationForSignal({ id: "vibe-tools", family: "tooling" }).includes("tool-box"));
  assert.ok(illustrationForSignal({ id: "vibe-lines", family: "output" }).includes("commit-tree"));
});

test("family kickers and minute formatting are unique and readable", () => {
  assert.equal(kickerForFamily("rhythm"), "Night work");
  assert.equal(kickerForFamily("conversation"), "The talk");
  assert.notEqual(kickerForFamily("rhythm"), kickerForFamily("conversation"));
  assert.equal(formatSignalValue({ value: 2330, unit: "minutes" }), "38h 50m");
  assert.equal(formatSignalValue({ value: 734154854, unit: "tokens" }), "734.2M");
});

test("deep recap slides win when they are valid and cite real signals", () => {
  const pack = structuredClone(vibeSocialSnapshot.narrative?.storyPack);
  assert.ok(pack && pack.version === "3.0.0");
  const signal = pack.signals[0]!;
  pack.deepAnalysis = {
    ...pack.deepAnalysis!,
    recap: {
      slides: [
        { kind: "title", kicker: "Your build", headline: "A custom hook", body: "Second person, specific.", sourceRefs: [] },
        { kind: "scale", kicker: "Scale", headline: "You showed up.", body: "Sessions and days.", sourceRefs: [] },
        { kind: "signature", kicker: "Signature", headline: signal.headline, body: signal.detail, signalId: signal.id, sourceRefs: signal.sourceRefs },
        { kind: "signature", kicker: "Dropped", headline: "Invented", body: "Should not appear.", signalId: "not-a-real-signal", sourceRefs: [] },
        { kind: "close", kicker: "Close", headline: "Your private recap is ready.", body: "Keep it.", sourceRefs: [] },
      ],
    },
  };
  const script = buildRecapScript({
    projectName: "Custom",
    sessionCount: 3,
    activeDays: 2,
    commits: 1,
    buildHours: 4,
    pack,
    signals: pack.signals,
  });
  assert.equal(script.source, "authored");
  assert.equal(script.slides[0]?.headline, "A custom hook");
  assert.equal(script.slides.some((slide) => slide.headline === "Invented"), false);
  assert.ok(script.slides.some((slide) => slide.signalId === signal.id));
});

test("standard pack recap slides win the same way Deep recap does", () => {
  const base = structuredClone(vibeSocialSnapshot.narrative?.storyPack);
  assert.ok(base);
  const signal = base.signals[0]!;
  const pack = {
    ...base,
    version: "2.0.0" as const,
    recap: {
      slides: [
        { kind: "title" as const, kicker: "Your build", headline: "A local-model hook", sourceRefs: [], textScale: "large" as const },
        { kind: "scale" as const, kicker: "Scale", headline: "You showed up.", sourceRefs: [] },
        { kind: "signature" as const, kicker: "Signature", headline: signal.headline, signalId: signal.id, sourceRefs: signal.sourceRefs, textScale: "medium" as const },
        { kind: "close" as const, kicker: "Close", headline: "Your private recap is ready.", sourceRefs: [] },
      ],
    },
  };
  const script = buildRecapScript({
    projectName: "Custom",
    sessionCount: 3,
    activeDays: 2,
    commits: 1,
    buildHours: 4,
    pack,
    signals: pack.signals,
  });
  assert.equal(script.source, "authored");
  assert.equal(script.slides[0]?.headline, "A local-model hook");
  assert.equal(textScaleForSlide(script.slides[0]!), "large");
});

test("recap-shape: slide count stays in range and numbered signature slides bind a signalId", () => {
  const pack = vibeSocialSnapshot.narrative?.storyPack ?? null;
  const script = buildRecapScript({
    projectName: vibeSocialSnapshot.identity.name,
    sessionCount: vibeSocialSnapshot.sessions.length,
    activeDays: vibeSocialSnapshot.timeWindow.activeDays,
    commits: vibeSocialSnapshot.git.commits,
    buildHours: 40,
    status: "shipped",
    pack,
    signals: pack?.signals ?? [],
  });
  assert.ok(script.slides.length >= 4 && script.slides.length <= 12);
  const numbered = script.slides.filter((slide) => (
    slide.kind === "signature" && slide.giantValue && slide.layout !== "streak" && slide.layout !== "ranked"
  ));
  assert.ok(numbered.length > 0);
  for (const slide of numbered) {
    assert.ok(slide.signalId, `${slide.headline} must bind a signalId`);
  }
});

test("fact slides hold longer than title and close, and setups linger before the number", () => {
  assert.equal(durationForSlide("title"), 5500);
  assert.equal(durationForSlide("close"), 5500);
  assert.equal(durationForSlide("receipt"), 8500);
  assert.equal(durationForSlide("signature", "setup"), 6800);
  assert.equal(durationForSlide("signature", "reveal"), 7800);
  assert.equal(durationForSlide("turning", undefined, "hour-bars"), 7500);
  assert.ok(durationForSlide("signature", "reveal") > durationForSlide("title"));
  assert.ok(durationForSlide("signature", "setup") > durationForSlide("title"));
});

test("wow facts play as a setup line, then a separate numbered reveal", () => {
  const pack = vibeSocialSnapshot.narrative?.storyPack ?? null;
  const script = buildRecapScript({
    projectName: vibeSocialSnapshot.identity.name,
    sessionCount: vibeSocialSnapshot.sessions.length,
    activeDays: vibeSocialSnapshot.timeWindow.activeDays,
    commits: vibeSocialSnapshot.git.commits,
    buildHours: 40,
    pack,
    signals: pack?.signals ?? [],
  });
  const tokensSetup = script.slides.find((slide) => slide.id === "signature-vibe-tokens-setup");
  const tokensReveal = script.slides.find((slide) => slide.id === "signature-vibe-tokens");
  assert.ok(tokensSetup);
  assert.ok(tokensReveal);
  assert.equal(tokensSetup?.beat, "setup");
  assert.equal(tokensReveal?.beat, "reveal");
  assert.match(tokensSetup?.headline ?? "", /blew it out of the park on August 5/i);
  assert.equal(tokensReveal?.giantValue, "734.2M");
  const setupIndex = script.slides.findIndex((slide) => slide.id === tokensSetup?.id);
  const revealIndex = script.slides.findIndex((slide) => slide.id === tokensReveal?.id);
  assert.equal(revealIndex, setupIndex + 1);
});

test("parseRecapNumber splits stem and affix and leaves compound durations alone", () => {
  const plain = parseRecapNumber("58");
  assert.equal(plain?.value, 58);
  assert.equal(plain?.suffix, "");
  assert.equal(plain?.compound, false);
  assert.equal(formatRecapCount(plain!, 58), "58");

  const compact = parseRecapNumber("734.2M");
  assert.equal(compact?.value, 734.2);
  assert.equal(compact?.decimals, 1);
  assert.equal(compact?.suffix, "M");
  assert.equal(formatRecapCount(compact!, 734.2), "734.2M");

  const percent = parseRecapNumber("16%");
  assert.equal(percent?.suffix, "%");
  assert.equal(formatRecapCount(percent!, 16), "16%");

  const money = parseRecapNumber("$1,233.71");
  assert.equal(money?.prefix, "$");
  assert.equal(money?.commas, true);
  assert.equal(formatRecapCount(money!, 1233.71), "$1,233.71");

  const duration = parseRecapNumber("38h 50m");
  assert.equal(duration?.compound, true);
  assert.equal(formatRecapCount(duration!, 0), "38h 50m");
});

function widgetContext(overrides: Partial<Parameters<typeof computeRecapWidgets>[0]> = {}) {
  return {
    projectName: "Widget Lab",
    sessionCount: 6,
    activeDays: 5,
    commits: 12,
    buildHours: 8.5,
    filesTouched: 40,
    costMicroUsd: 2_500_000,
    pack: null,
    signals: [],
    sessions: [
      { startedAt: "2026-02-09T18:00:00.000Z" },
      { startedAt: "2026-02-10T18:00:00.000Z" },
      { startedAt: "2026-02-11T09:00:00.000Z" },
      { startedAt: "2026-02-20T18:00:00.000Z" },
      { startedAt: "2026-02-21T18:00:00.000Z" },
      { startedAt: "2026-04-08T04:00:00.000Z" },
    ],
    models: [
      { id: "opus", label: "Claude Opus 5", requests: 40, share: 61 },
      { id: "sonnet", label: "Claude Sonnet 4", requests: 20, share: 39 },
    ],
    utcOffsetMinutes: 0,
    ...overrides,
  };
}

test("recap widgets derive hours, weekdays, streaks, and skip when sessions are missing", () => {
  const widgets = computeRecapWidgets(widgetContext());
  assert.equal(widgets.statGrid?.tiles.length, 4);
  assert.equal(widgets.hourBars?.bars.length, 24);
  assert.equal(widgets.hourBars?.sparse, false);
  assert.equal(widgets.hourBars?.bars[18]?.count, 4);
  assert.equal(widgets.weekday?.bars.length, 7);
  assert.ok((widgets.weekday?.bars.reduce((sum, bar) => sum + bar.count, 0) ?? 0) >= 6);
  assert.equal(widgets.streak?.days, 3);
  assert.equal(widgets.streakOthers[0]?.days, 2);
  assert.equal(widgets.ranked?.items[0]?.title, "Claude Opus 5");
  assert.equal(widgets.ranked?.items[0]?.markSrc, "/assets/brands/claude.svg");

  const empty = computeRecapWidgets(widgetContext({ sessions: [], peakHours: [22, 10] }));
  assert.equal(empty.hourBars?.sparse, true);
  assert.equal(empty.hourBars?.bars[22]?.peak, true);
  assert.equal(empty.weekday, null);
  assert.equal(empty.streak, null);
});

function packWithoutRecap() {
  const pack = structuredClone(vibeSocialSnapshot.narrative?.storyPack);
  if (!pack) return null;
  delete pack.recap;
  if (pack.version === "3.0.0" && pack.deepAnalysis) {
    const deep = { ...pack.deepAnalysis };
    delete deep.recap;
    pack.deepAnalysis = deep;
  }
  return pack;
}

test("deterministic recap uses hours on scale and includes computed widget slides", () => {
  const pack = packWithoutRecap();
  const script = buildRecapScript({
    projectName: vibeSocialSnapshot.identity.name,
    sessionCount: vibeSocialSnapshot.sessions.length,
    activeDays: vibeSocialSnapshot.timeWindow.activeDays,
    commits: vibeSocialSnapshot.git.commits,
    buildHours: 40,
    filesTouched: vibeSocialSnapshot.git.filesTouched,
    pack,
    signals: pack?.signals ?? [],
    sessions: vibeSocialSnapshot.sessions,
    models: vibeSocialSnapshot.usage.models,
  });
  const scale = script.slides.find((slide) => slide.kind === "scale");
  assert.equal(scale?.layout, "stat-grid");
  assert.equal(scale?.giantLabel, "hours");
  assert.equal(scale?.giantValue, "40");
  assert.ok(script.slides.some((slide) => slide.layout === "ranked"));
  assert.ok(script.slides.some((slide) => slide.kind === "receipt"));
  assert.equal(recapShowsArt(scale!), false);
  assert.ok(findRecapSlide(script, "hours") || findRecapSlide(script, "ranked"));
});

test("authored signature copy is kept and a thin recap falls back to deterministic widgets", () => {
  const pack = structuredClone(vibeSocialSnapshot.narrative?.storyPack);
  assert.ok(pack && pack.version === "3.0.0");
  const signal = pack.signals[0]!;
  pack.deepAnalysis = {
    ...pack.deepAnalysis!,
    recap: {
      slides: [
        { kind: "title", kicker: "Your build", headline: "Keep this hook", sourceRefs: [] },
        { kind: "scale", kicker: "Scale", headline: "You showed up.", sourceRefs: [], layout: "stat-grid" },
        { kind: "signature", kicker: "Setup", headline: "A custom setup with no digits", signalId: signal.id, sourceRefs: signal.sourceRefs },
        { kind: "signature", kicker: "Reveal", headline: "A custom reveal line", signalId: signal.id, sourceRefs: signal.sourceRefs },
        { kind: "close", kicker: "Close", headline: "Your private recap is ready.", sourceRefs: [] },
      ],
    },
  };
  const script = buildRecapScript({
    projectName: "Custom",
    sessionCount: 6,
    activeDays: 5,
    commits: 12,
    buildHours: 8.5,
    pack,
    signals: pack.signals,
    sessions: widgetContext().sessions,
    models: widgetContext().models,
  });
  assert.equal(script.source, "authored");
  assert.equal(script.slides.find((slide) => slide.beat === "setup")?.headline, "A custom setup with no digits");
  assert.equal(script.slides.find((slide) => slide.beat === "reveal")?.headline, "A custom reveal line");
  assert.ok(script.slides.some((slide) => slide.layout === "hour-bars" || slide.layout === "ranked"));

  pack.deepAnalysis!.recap = {
    slides: [
      { kind: "title", kicker: "Your build", headline: "Too thin", sourceRefs: [] },
      { kind: "scale", kicker: "Scale", headline: "Nope", sourceRefs: [] },
      { kind: "signature", kicker: "Dropped", headline: "Invented", signalId: "not-a-real-signal", sourceRefs: [] },
    ],
  };
  const fallback = buildRecapScript({
    projectName: "Custom",
    sessionCount: 6,
    activeDays: 5,
    commits: 12,
    buildHours: 8.5,
    pack,
    signals: pack.signals,
    models: widgetContext().models,
  });
  assert.equal(fallback.source, "deterministic");
  assert.equal(fallback.slides[0]?.headline, "Custom");
});

test("art stays on title, setup, and close, and stays off widget number slides", () => {
  const script = buildRecapScript({
    ...widgetContext(),
    pack: packWithoutRecap(),
    signals: packWithoutRecap()?.signals ?? [],
  });
  const title = script.slides.find((slide) => slide.kind === "title");
  const scale = script.slides.find((slide) => slide.kind === "scale");
  const hours = script.slides.find((slide) => slide.layout === "hour-bars");
  const ranked = script.slides.find((slide) => slide.layout === "ranked");
  const setup = script.slides.find((slide) => slide.beat === "setup");
  const close = script.slides.find((slide) => slide.kind === "close");
  assert.equal(recapShowsArt(title!), true);
  assert.equal(recapShowsArt(scale!), false);
  assert.equal(recapShowsArt(hours!), false);
  assert.equal(recapShowsArt(ranked!), false);
  assert.equal(recapShowsArt(close!), true);
  if (setup) assert.equal(recapShowsArt(setup), true);
});
