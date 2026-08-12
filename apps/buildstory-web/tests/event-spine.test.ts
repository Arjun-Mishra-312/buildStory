import assert from "node:assert/strict";
import test from "node:test";
import { buildStoryFromSnapshot, publicBuildStoryFromSnapshot } from "../lib/build-story";
import { reportSnapshotFromScanner } from "../lib/ingestion/report-adapter";
import type { ScannerProjectSnapshot } from "../lib/ingestion/scanner-project-snapshot";
import { validateProjectSnapshot } from "../lib/ingestion/validation";
import scannerFixture from "./fixtures/scanner-project-snapshot.json";

function fixtureWithSpine(): ScannerProjectSnapshot {
  const snapshot = structuredClone(scannerFixture) as unknown as ScannerProjectSnapshot;
  const session = snapshot.sessions[0]!;
  const evidence = snapshot.evidence.find((item) => item.sessionRef === session.sessionRef)!;
  snapshot.eventSpine = {
    version: "1.0.0",
    generatedAt: snapshot.generatedAt,
    events: [{
      eventId: "evt_11111111111111111111",
      occurredAt: session.startedAt,
      kind: "session-start",
      phase: "discover",
      label: "Session opened",
      sessionRef: session.sessionRef,
      provider: session.provider,
      magnitude: session.turns,
      measurement: "turns",
      temporalPrecision: "exact",
      sourceRefs: [evidence.evidenceId],
      privacy: "metadata-only",
    }],
    coverage: { sessions: snapshot.sessions.length, milestones: snapshot.milestones.length, events: 1 },
  };
  return snapshot;
}

test("event spine survives private report adaptation but never enters the public projection", () => {
  const raw = fixtureWithSpine();
  const validation = validateProjectSnapshot(raw);
  assert.equal(validation.ok, true, validation.ok ? undefined : validation.errors.join("\n"));
  const report = reportSnapshotFromScanner(raw, { id: "project-spine", slug: "project-spine" }, { id: "owner", name: "Owner", handle: "owner", role: "Builder" });
  const privateStory = buildStoryFromSnapshot(report);
  const publicStory = publicBuildStoryFromSnapshot(report, ["sessionSummary", "milestones"]);
  assert.equal(privateStory.eventSpine?.events.length, 1);
  assert.equal("eventSpine" in publicStory, false);
});

test("upload validation rejects an event citation that does not exist", () => {
  const raw = fixtureWithSpine();
  raw.eventSpine!.events[0]!.sourceRefs = ["ev_99999999999999999999"];
  const result = validateProjectSnapshot(raw);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.errors.join("\n"), /unknown evidence/);
});
