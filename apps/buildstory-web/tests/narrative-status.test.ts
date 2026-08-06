import assert from "node:assert/strict";
import test from "node:test";
import { deriveNarrativeDisplayStatus } from "../lib/ingestion/narrative-status";
import type { NarrativeRecord } from "../lib/ingestion/contracts";
import type { NarrativeEvidenceBundle } from "../lib/ingestion/scanner-project-snapshot";

const emptyBundle = (excerpts: NarrativeEvidenceBundle["excerpts"] = []): NarrativeEvidenceBundle => ({
  bundleVersion: "1.0.0",
  generatedAt: "2026-08-05T00:00:00.000Z",
  policy: { maxExcerpts: 40, maxCharsPerExcerpt: 600, maxTotalChars: 20_000, excerptSelection: "deterministic-heuristic-v1" },
  consent: {
    mode: "explicit-cli-review",
    statementVersion: "1.0",
    approvedActions: ["send-redacted-excerpts-to-configured-cloud-model"],
  },
  excerpts,
  discarded: { candidates: 0, rejectedByRedaction: 0, rejectedByBudget: 0 },
});

const readyNarrative: NarrativeRecord = {
  id: "nar_1",
  reportId: "rep_1",
  mode: "cloud",
  provider: "openai",
  model: "gpt-test",
  status: "ready",
  sections: { headline: "h", narrative: "n", turningPoint: "t", learnings: ["l"] },
  costMicroUsd: 100,
};

test("narrative-status: no source snapshot at all is not_requested", () => {
  assert.equal(deriveNarrativeDisplayStatus(null, null), "narrative_not_requested");
});

test("narrative-status: a snapshot with no narrativeEvidence field is not_requested", () => {
  assert.equal(deriveNarrativeDisplayStatus({}, null), "narrative_not_requested");
});

test("narrative-status: an evidence bundle with zero excerpts is no_evidence, not silence", () => {
  assert.equal(deriveNarrativeDisplayStatus({ narrativeEvidence: emptyBundle() }, null), "narrative_no_evidence");
});

test("narrative-status: excerpts present but no NarrativeRecord yet is queued", () => {
  const bundle = emptyBundle([
    { excerptId: "exc_a", sessionRef: "ses_a", occurredAt: "2026-08-05T00:00:00.000Z", role: "user-intent", text: "hi" },
  ]);
  assert.equal(deriveNarrativeDisplayStatus({ narrativeEvidence: bundle }, null), "narrative_queued");
});

test("narrative-status: a NarrativeRecord always wins over the source snapshot's evidence presence", () => {
  assert.equal(deriveNarrativeDisplayStatus(null, readyNarrative), "narrative_ready");
  assert.equal(deriveNarrativeDisplayStatus(null, { ...readyNarrative, status: "failed", sections: null }), "narrative_failed");
  assert.equal(deriveNarrativeDisplayStatus(null, { ...readyNarrative, status: "generating", sections: null }), "narrative_generating");
  assert.equal(deriveNarrativeDisplayStatus(null, { ...readyNarrative, status: "queued", sections: null }), "narrative_queued");
});
