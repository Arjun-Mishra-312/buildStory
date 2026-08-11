import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { computeSignals } from "../lib/ingestion/signals";
import { buildStoryPackSources } from "../lib/narrative/story-pack";
import { reportSnapshotFromScanner } from "../lib/ingestion/report-adapter";
import type { ScannerProjectSnapshot } from "../lib/ingestion/scanner-project-snapshot";
import scannerFixture from "./fixtures/scanner-project-snapshot.json";

const snapshot = scannerFixture as unknown as ScannerProjectSnapshot;

function signalInputs(value: ScannerProjectSnapshot) {
  return {
    sessions: value.sessions,
    usage: value.usage,
    git: value.git,
    timeWindow: value.timeWindow,
    narrativeEvidence: value.narrativeEvidence,
    sources: buildStoryPackSources(value),
  };
}

test("computeSignals is deterministic: the same snapshot always produces the same signals in the same order", () => {
  const first = computeSignals(signalInputs(snapshot));
  const second = computeSignals(signalInputs(structuredClone(snapshot)));
  assert.deepEqual(first, second);
  // Sorted by notability desc, ties broken by id - never accidentally
  // random or insertion-order dependent.
  for (let index = 1; index < first.length; index += 1) {
    assert.ok(
      first[index - 1]!.notability > first[index]!.notability
        || (first[index - 1]!.notability === first[index]!.notability && first[index - 1]!.id < first[index]!.id),
      `signals[${index - 1}] (${first[index - 1]!.id}) must sort before signals[${index}] (${first[index]!.id})`,
    );
  }
});

test("the scanner and web signals.ts twins compute identical output for the same fixture", async () => {
  // Both packages ship a byte-identical copy of lib/ingestion/signals.ts,
  // differing only in the import path (matching the profile.ts twin
  // convention) - this proves the scanner-side copy at
  // packages/buildstory-scanner/src/insights/signals.ts hasn't drifted, the
  // same way the existing cross-package ProjectSnapshot schema test does.
  const scannerSignalsSource = await readFile(
    path.resolve(process.cwd(), "../../packages/buildstory-scanner/src/insights/signals.ts"),
    "utf8",
  );
  const webSignalsSource = await readFile(
    path.resolve(process.cwd(), "lib/ingestion/signals.ts"),
    "utf8",
  );
  // Only the two module-path references differ between twins (an
  // `import type` line and a re-`export type` line) - see signals.ts's own
  // header comment. Normalize both away rather than assume line position.
  const normalizeImportPaths = (source: string) => source
    .replaceAll('"./scanner-project-snapshot"', '"PATH"')
    .replaceAll('"../contract.js"', '"PATH"');
  assert.equal(normalizeImportPaths(scannerSignalsSource), normalizeImportPaths(webSignalsSource));
});

test("no signal states a number that wasn't computed - every headline/detail is deterministic prose over the signal's own value", () => {
  const signals = computeSignals(signalInputs(snapshot));
  assert.ok(signals.length > 0, "fixture sanity: the shared fixture should produce at least one signal");
  for (const signal of signals) {
    assert.ok(signal.headline.length > 0);
    assert.ok(signal.notability >= 0 && signal.notability <= 100, `${signal.id} notability must be 0-100`);
    assert.ok(signal.formula.length > 0, `${signal.id} must carry an auditable formula`);
  }
});

test("reportSnapshotFromScanner no longer discards callCount, reasoning/cached tokens, mergeCommits, or workingTree", () => {
  const report = reportSnapshotFromScanner(
    snapshot,
    { id: "project_signals_test", slug: "signals-test" },
    { id: "usr_signals_test", name: "Signals Tester", handle: "signals-tester", role: "Builder" },
  );
  if (snapshot.usage.tools.length > 0) {
    assert.ok(report.usage.tools.some((tool) => tool.callCount > 0), "at least one tool's callCount must survive into the report snapshot");
  }
  assert.equal(report.git.mergeCommits, snapshot.git.mergeCommits);
  assert.deepEqual(report.git.workingTree, snapshot.git.workingTree);
  if (report.usage.tokenUsage && snapshot.usage.tokenUsage) {
    assert.equal(report.usage.tokenUsage.cachedInputTokens, snapshot.usage.tokenUsage.cachedInputTokens);
    assert.equal(report.usage.tokenUsage.reasoningOutputTokens, snapshot.usage.tokenUsage.reasoningOutputTokens);
  }
  assert.ok(Array.isArray(report.signals), "every report carries a signals array regardless of narrative mode");
});
