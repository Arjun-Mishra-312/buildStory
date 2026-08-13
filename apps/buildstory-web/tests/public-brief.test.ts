import assert from "node:assert/strict";
import test from "node:test";
import { vibeSocialSnapshot } from "../lib/mock-projects";
import {
  SCANNER_DEFAULT_DESCRIPTION,
  SCANNER_DEFAULT_TAGLINE,
  buildPublicBrief,
  buildPublicHeroCopy,
  buildTurningBeat,
  footnoteForMetric,
  isScannerDefaultTagline,
  isSessionActivityTitle,
} from "../lib/report/public-brief";
import { reportSnapshotFromScanner } from "../lib/ingestion/report-adapter";
import { buildStoryFromSnapshot } from "../lib/build-story";
import { buildReportInsightsViewModel } from "../lib/report/report-insights-view-model";
import { buildEvidenceViewModel } from "../lib/report/evidence-view-model";
import type { ScannerProjectSnapshot } from "../lib/ingestion/scanner-project-snapshot";
import scannerFixture from "./fixtures/scanner-project-snapshot.json";

test("legacy session-count taglines are treated as scanner defaults", () => {
  assert.equal(isScannerDefaultTagline("A private build report generated from 51 repository-scoped AI sessions."), true);
  assert.equal(isScannerDefaultTagline("A private build report generated from 1 repository-scoped AI session."), true);
  assert.equal(isScannerDefaultTagline(SCANNER_DEFAULT_TAGLINE), true);
  assert.equal(isScannerDefaultTagline("The social publishing platform for evidence-backed build stories."), false);
});

test("hero copy prefers a real product description over the session-count tagline", () => {
  const pack = vibeSocialSnapshot.narrative?.storyPack ?? null;
  const copy = buildPublicHeroCopy({
    tagline: "A private build report generated from 51 repository-scoped AI sessions.",
    description: vibeSocialSnapshot.identity.description,
    pack,
    activeDays: 7,
    sessionCount: 51,
    commits: 78,
  });
  assert.equal(copy.productLine, vibeSocialSnapshot.identity.description);
  assert.equal(copy.scaleLine, "Built in 7 days across 51 AI sessions · 78 commits");
  assert.ok(copy.storyHook?.toLowerCase().includes("privacy-first publishing"));
});

test("hero copy falls back to the pack summary when description is scanner boilerplate", () => {
  const pack = vibeSocialSnapshot.narrative?.storyPack ?? null;
  const copy = buildPublicHeroCopy({
    tagline: SCANNER_DEFAULT_TAGLINE,
    description: SCANNER_DEFAULT_DESCRIPTION,
    pack,
    activeDays: 7,
    sessionCount: 51,
    commits: 0,
  });
  assert.equal(copy.productLine, pack?.hero.summary);
  assert.equal(copy.scaleLine, "Built in 7 days across 51 AI sessions");
});

test("the 30-second brief is composed from existing pack fields", () => {
  const pack = vibeSocialSnapshot.narrative?.storyPack ?? null;
  const brief = buildPublicBrief({ pack, sessionCount: 51, commits: 78, status: "shipped" });
  assert.ok(brief);
  assert.equal(brief.headline, pack?.hero.headline);
  assert.equal(brief.goal, pack?.hero.summary);
  assert.ok(brief.wentWrong.length >= 1);
  assert.ok(brief.changed.includes("Surface concrete publish errors"));
  assert.equal(brief.result, "51 AI sessions → 78 commits → production-ready");
});

test("turning beat uses the first discover moment and first decision", () => {
  const pack = vibeSocialSnapshot.narrative?.storyPack ?? null;
  const beat = buildTurningBeat(pack);
  assert.ok(beat);
  assert.match(beat.failure, /Publish|disabled|swallowed/i);
  assert.ok(beat.investigation.length > 0);
  assert.ok(beat.outcome.length > 0);
  assert.ok(beat.occurredAt);
});

test("session-activity milestone titles are recognized", () => {
  assert.equal(isSessionActivityTitle("Claude Code session activity"), true);
  assert.equal(isSessionActivityTitle("Codex session activity"), true);
  assert.equal(isSessionActivityTitle("The publish button was disabled"), false);
});

test("new scanner reports no longer use the session-count tagline", () => {
  const report = reportSnapshotFromScanner(
    structuredClone(scannerFixture) as unknown as ScannerProjectSnapshot,
    { id: "brief-project", slug: "brief-project" },
    { id: "owner", name: "Owner", handle: "owner", role: "Builder" },
  );
  assert.equal(report.identity.tagline, SCANNER_DEFAULT_TAGLINE);
  assert.equal(isScannerDefaultTagline(report.identity.tagline), true);
});

test("journey view models drop session-activity milestones from Discover", () => {
  const snapshot = structuredClone(vibeSocialSnapshot);
  snapshot.milestones = [
    { id: "ms_session", occurredAt: "2026-08-05T10:00:00.000Z", title: "Claude Code session activity", description: "A session.", kind: "breakthrough", evidenceRefs: [] },
    ...snapshot.milestones,
  ];
  const story = buildStoryFromSnapshot(snapshot);
  const pack = snapshot.narrative?.storyPack ?? null;
  const model = buildReportInsightsViewModel({ story, surface: "public", pack });
  const discover = model.journey.find((phase) => phase.phase === "discover");
  assert.ok(discover);
  assert.equal(discover.milestones.some((milestone) => isSessionActivityTitle(milestone.title)), false);
  assert.ok(discover.moments.length > 0);
  assert.ok(model.turningBeat);
});

test("cost and token metrics carry interpretation footnotes", () => {
  const story = buildStoryFromSnapshot(structuredClone(vibeSocialSnapshot));
  const pack = vibeSocialSnapshot.narrative?.storyPack ?? null;
  const model = buildEvidenceViewModel(story, "public", pack);
  assert.match(model.metrics.find((metric) => metric.id === "cost")?.note ?? "", /published API rates/i);
  assert.ok(model.metrics.find((metric) => metric.id === "tokens")?.note);
  assert.equal(model.metrics.find((metric) => metric.id === "linesAdded")?.note, undefined);
  assert.ok(footnoteForMetric("cost", pack?.signals ?? []));
});
