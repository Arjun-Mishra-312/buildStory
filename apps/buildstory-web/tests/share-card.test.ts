import assert from "node:assert/strict";
import test from "node:test";
import { publicBuildStoryFromSnapshot } from "../lib/build-story";
import { reportSnapshotFromScanner } from "../lib/ingestion/report-adapter";
import type { PublicFieldKey } from "../lib/ingestion/contracts";
import { formatShareCardData } from "../lib/share-card/format";
import type { ScannerProjectSnapshot } from "../lib/ingestion/scanner-project-snapshot";
import scannerFixture from "./fixtures/scanner-project-snapshot.json";

const snapshot = scannerFixture as unknown as ScannerProjectSnapshot;
const privateSnapshot = reportSnapshotFromScanner(
  snapshot,
  { id: "project_test", slug: "test-project" },
  { id: "usr_test", name: "Test Builder", handle: "test", role: "Builder" },
);

const FULL_FIELDS: PublicFieldKey[] = ["tagline", "timeWindow", "sessionSummary", "modelMix", "costEstimate", "gitAggregates", "archetype"];

function statLabels(fields: readonly PublicFieldKey[]) {
  const story = publicBuildStoryFromSnapshot(privateSnapshot, [...fields]);
  return formatShareCardData(story).stats.map((stat) => stat.label);
}

test("formatShareCardData shows every opted-in stat for a fully-published story", () => {
  const story = publicBuildStoryFromSnapshot(privateSnapshot, [...FULL_FIELDS]);
  const data = formatShareCardData(story);
  assert.ok(data.stats.some((stat) => stat.label.includes("active day")), "active days is shown when timeWindow is selected");
  assert.ok(data.stats.some((stat) => stat.label === "AI sessions"), "session count is shown when sessionSummary is selected");
  assert.ok(data.stats.some((stat) => stat.label === "commits"), "commit count is shown when gitAggregates is selected");
  assert.ok(data.tagline, "tagline is shown when selected");
  assert.equal(typeof data.name, "string");
  assert.ok(data.name.length > 0);
});

test("formatShareCardData never shows a stat for a field the creator didn't opt into publishing", () => {
  const hiddenAll = statLabels([]);
  assert.deepEqual(hiddenAll, [], "no PublicFieldKeys selected means no stats at all, not zeroed ones");

  assert.ok(!statLabels(["sessionSummary", "modelMix", "gitAggregates"]).some((label) => label.includes("active day")), "active days is hidden without timeWindow, even though the underlying value is zeroed rather than absent");
  assert.ok(!statLabels(["timeWindow", "modelMix", "gitAggregates"]).some((label) => label === "AI sessions"), "session count is hidden without sessionSummary");
  assert.ok(!statLabels(["timeWindow", "sessionSummary", "modelMix"]).some((label) => label === "commits"), "commit count is hidden without gitAggregates");
});

test("formatShareCardData hides the spend stat when cost is null (costEstimate not selected)", () => {
  const withoutCost = formatShareCardData(publicBuildStoryFromSnapshot(privateSnapshot, ["timeWindow", "sessionSummary", "gitAggregates"]));
  assert.ok(!withoutCost.stats.some((stat) => stat.label === "est. spend"));
});

test("formatShareCardData empties the model list when modelMix isn't selected, rather than showing a fake zero-model row", () => {
  const withoutModels = formatShareCardData(publicBuildStoryFromSnapshot(privateSnapshot, [...FULL_FIELDS.filter((field) => field !== "modelMix")]));
  assert.deepEqual(withoutModels.models, []);
});

test("formatShareCardData treats an unselected tagline as absent (null), not the empty-string sentinel", () => {
  const withoutTagline = formatShareCardData(publicBuildStoryFromSnapshot(privateSnapshot, [...FULL_FIELDS.filter((field) => field !== "tagline")]));
  assert.equal(withoutTagline.tagline, null);
});

test("formatShareCardData hides the archetype badge when archetype isn't selected", () => {
  const withoutArchetype = formatShareCardData(publicBuildStoryFromSnapshot(privateSnapshot, [...FULL_FIELDS.filter((field) => field !== "archetype")]));
  assert.equal(withoutArchetype.archetype, null);
});
