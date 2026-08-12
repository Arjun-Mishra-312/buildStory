import assert from "node:assert/strict";
import test from "node:test";
import { buildStoryFromSnapshot, publicBuildStoryFromSnapshot } from "../lib/build-story";
import { orbitNotesSnapshot } from "../lib/mock-projects";
import { buildEvidenceViewModel } from "../lib/report/evidence-view-model";

test("formats private metrics and labels a complete priced model mix by cost share", () => {
  const story = buildStoryFromSnapshot(structuredClone(orbitNotesSnapshot));
  const model = buildEvidenceViewModel(story, "private");

  assert.equal(model.surface, "private");
  assert.equal(model.modelDistributionBasis, "estimated cost share");
  assert.equal(model.modelDistribution.reduce((sum, row) => sum + row.percent, 0), 100);
  assert.equal(model.metrics.find((metric) => metric.id === "linesAdded")?.value, "18,420");
  assert.equal(model.metrics.find((metric) => metric.id === "cost")?.value, "$3.16");
  assert.deepEqual(model.gitDiff, { additions: 18420, deletions: 6291, additionPercent: 75 });
});

test("labels a projected model mix by request share when cost is not public", () => {
  const story = publicBuildStoryFromSnapshot(structuredClone(orbitNotesSnapshot), ["modelMix"]);
  const model = buildEvidenceViewModel(story, "preview");

  assert.equal(model.modelDistributionBasis, "observed model calls");
  assert.equal(model.metrics.some((metric) => metric.id === "cost"), false);
  assert.equal(model.modelDistribution[0]?.label, "GPT-5.4 Codex");
});

test("empty public projections produce an empty, projection-safe evidence model", () => {
  const story = publicBuildStoryFromSnapshot(structuredClone(orbitNotesSnapshot), []);
  const model = buildEvidenceViewModel(story, "public");
  const serialized = JSON.stringify(model);

  assert.deepEqual(model.metrics, []);
  assert.deepEqual(model.modelDistribution, []);
  assert.deepEqual(model.toolDistribution, []);
  assert.equal(model.gitDiff, null);
  assert.deepEqual(model.timeline, []);
  assert.deepEqual(model.sources, []);
  assert.doesNotMatch(serialized, /a17cf09|4d2b8e7|remotePath|snapshotHash|machineScope|excerpt/i);
});

test("zero-valued git aggregates do not create a misleading comparison", () => {
  const snapshot = structuredClone(orbitNotesSnapshot);
  snapshot.git.additions = 0;
  snapshot.git.deletions = 0;
  const story = publicBuildStoryFromSnapshot(snapshot, ["gitAggregates"]);

  assert.equal(buildEvidenceViewModel(story, "public").gitDiff, null);
});
