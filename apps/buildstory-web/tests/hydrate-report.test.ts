import assert from "node:assert/strict";
import test from "node:test";
import { orbitNotesSnapshot } from "../lib/mock-projects";
import { reportSnapshotFromScanner } from "../lib/ingestion/report-adapter";
import type { BuilderProfile } from "../lib/ingestion/profile";
import type { ScannerProjectSnapshot } from "../lib/ingestion/scanner-project-snapshot";
import { hydrateReportSnapshot, isScannerProjectSnapshot, planReportUiPort } from "../lib/report/hydrate-report";
import type { ProjectSnapshot } from "../lib/project-snapshot";
import type { GeneratedReport } from "../lib/ingestion/contracts";
import scannerFixture from "./fixtures/scanner-project-snapshot.json";

const scanner = scannerFixture as unknown as ScannerProjectSnapshot;
const owner = { id: "usr_test", name: "Mina Park", handle: "mina-park", role: "Builder" };

test("scanner snapshots are distinguished from stored ProjectSnapshot JSON", () => {
  assert.equal(isScannerProjectSnapshot(scannerFixture), true);
  assert.equal(isScannerProjectSnapshot(orbitNotesSnapshot), false);
});

test("hydrate fills current work patterns and drops the Velocity Machine alias", () => {
  const snapshot = reportSnapshotFromScanner(scanner, { id: "prj_sample", slug: "sample-project" }, owner);
  snapshot.builderProfile = {
    scores: snapshot.builderProfile!.scores,
    archetype: { name: "Velocity Machine", rationale: ["Execution was the clearest signal."] },
    workPatterns: {
      peakHours: [22],
      preferredDays: ["Monday"],
      medianSessionMinutes: 30,
      longestSessionMinutes: 30,
      primaryModel: "example-model",
      timezoneLabel: "UTC",
    } as BuilderProfile["workPatterns"],
  };
  snapshot.signals = [];
  const hydrated = hydrateReportSnapshot(scanner, snapshot);
  assert.ok(hydrated.builderProfile);
  assert.notEqual(hydrated.builderProfile.archetype.name, "Velocity Machine");
  assert.equal(typeof hydrated.builderProfile.workPatterns.nightShare, "number");
  assert.equal(typeof hydrated.builderProfile.workPatterns.morningShare, "number");
  assert.equal(typeof hydrated.builderProfile.workPatterns.weekendShare, "number");
  assert.equal(typeof hydrated.builderProfile.workPatterns.distinctToolCount, "number");
  assert.ok(hydrated.signals.length >= 0);
});

test("a ProjectSnapshot stuffed into source_snapshot_json only canonicalizes legacy fields", () => {
  const snapshot = structuredClone(orbitNotesSnapshot) as ProjectSnapshot;
  snapshot.builderProfile = {
    ...snapshot.builderProfile!,
    archetype: { name: "Velocity Machine", rationale: ["Legacy alias."] },
    workPatterns: {
      peakHours: [22],
      preferredDays: ["Sunday"],
      medianSessionMinutes: 40,
      longestSessionMinutes: 90,
      primaryModel: "claude-sonnet-5",
      timezoneLabel: "UTC",
    } as BuilderProfile["workPatterns"],
  };
  const hydrated = hydrateReportSnapshot(snapshot, snapshot);
  assert.equal(hydrated.builderProfile?.archetype.name, "Shipping Machine");
  assert.equal(hydrated.builderProfile?.workPatterns.nightShare, 0);
});

test("the UI port plan unions recap fields and rebuilds published indexes", () => {
  const snapshot = reportSnapshotFromScanner(scanner, { id: "prj_sample", slug: "sample-project" }, owner);
  const report = {
    id: "rpt_legacy",
    creatorId: "dev:mina-park",
    projectId: "prj_sample",
    uploadSessionId: "upl_legacy",
    status: "ready",
    createdAt: "2026-08-01T00:00:00.000Z",
    readyAt: "2026-08-01T00:01:00.000Z",
    sourceSnapshot: scanner,
    snapshot,
    selectedPublicFields: ["tagline", "description", "modelMix"],
    editorial: { tagline: snapshot.identity.tagline, description: snapshot.identity.description, reflection: "" },
    category: "web-apps",
    storyBackgroundId: "repository-topography",
    artifact: { projectUrl: null, repoUrl: null, videoUrl: null },
    publication: { status: "published", slug: "sample-project", publishedAt: "2026-08-01T00:02:00.000Z", publicUrl: "https://buildstory.dev/u/mina-park/sample-project", chapterIndex: 1 },
    narrative: null,
    chapterDelta: null,
  } as GeneratedReport;
  const { next, plan } = planReportUiPort(report);
  assert.equal(plan.updatePublicFields, true);
  assert.equal(plan.refreshPublicIndex, true);
  assert.ok(next.selectedPublicFields.includes("storyRecap"));
  assert.ok(next.selectedPublicFields.includes("storySignals"));
  assert.ok(next.selectedPublicFields.includes("signalHeadline"));
});
