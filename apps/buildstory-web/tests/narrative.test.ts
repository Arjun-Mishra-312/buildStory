import assert from "node:assert/strict";
import test from "node:test";
import {
  acceptSnapshot,
  claimUploadSession,
  createUploadSession,
  getReport,
} from "../lib/ingestion/mock-store";
import { sha256Digest } from "../lib/ingestion/local-contract";
import scannerFixture from "./fixtures/scanner-project-snapshot.json";

// Pre-seeded by mock-store's createSeedStore() - reusing it means acceptSnapshot
// finds an already-provisioned owner without a separate ensureUser call.
const creatorId = "dev:mina-park";

const narrativeEvidence = {
  bundleVersion: "1.0.0" as const,
  generatedAt: "2026-08-03T11:31:00.000Z",
  policy: {
    maxExcerpts: 40,
    maxCharsPerExcerpt: 600,
    maxTotalChars: 20_000,
    excerptSelection: "deterministic-heuristic-v1" as const,
  },
  consent: {
    mode: "explicit-cli-review" as const,
    statementVersion: "1.0" as const,
    approvedActions: ["send-redacted-excerpts-to-configured-cloud-model"] as const,
  },
  excerpts: [
    {
      excerptId: "exc_aaaaaaaaaaaaaaaaaaaa",
      sessionRef: scannerFixture.sessions[0]!.sessionRef,
      occurredAt: "2026-08-03T11:31:00.000Z",
      role: "user-intent" as const,
      text: "I want to add a background job queue for report generation.",
    },
  ],
  discarded: { candidates: 1, rejectedByRedaction: 0, rejectedByBudget: 0 },
};

async function acceptFreshSnapshot(snapshot: unknown) {
  const created = await createUploadSession(creatorId, "Narrative pipeline test", "http://localhost/");
  const { sessionId, userCode } = created.deviceAuthorization;
  const claim = await claimUploadSession(sessionId, userCode);
  const raw = JSON.stringify(snapshot);
  const receipt = await acceptSnapshot(sessionId, claim.uploadGrant.bearerToken, await sha256Digest(raw), snapshot);
  return receipt.reportEndpoint!.split("/").at(-1)!;
}

function stubFetchOnce(responseBody: unknown, status = 200) {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(JSON.stringify(responseBody), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return {
    callCount: () => calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

function openAiEnvelope(sections: Record<string, unknown>) {
  return {
    choices: [{ message: { content: JSON.stringify(sections) } }],
    usage: { prompt_tokens: 500, completion_tokens: 150 },
  };
}

test("a scan with no narrative evidence never calls the LLM and has no narrative", async () => {
  const stub = stubFetchOnce({});
  const previousKey = process.env.BUILDSTORY_LLM_API_KEY;
  process.env.BUILDSTORY_LLM_API_KEY = "test-key";
  try {
    const reportId = await acceptFreshSnapshot(structuredClone(scannerFixture));
    const report = await getReport(creatorId, reportId);
    assert.equal(report.narrative, null);
    assert.equal(stub.callCount(), 0);
  } finally {
    stub.restore();
    process.env.BUILDSTORY_LLM_API_KEY = previousKey;
  }
});

test("an evidence-bearing scan generates a narrative and sanitizes the model's output before storage", async () => {
  const stub = stubFetchOnce(
    openAiEnvelope({
      headline: "Shipped the job queue",
      narrative: "Built a lease-based job queue instead of a hosted broker.",
      turningPoint: "Committed after testing it at /Users/dev/private/repo worked end to end.",
      learnings: ["Bounded retries beat unbounded ones."],
    }),
  );
  const previousKey = process.env.BUILDSTORY_LLM_API_KEY;
  process.env.BUILDSTORY_LLM_API_KEY = "test-key";
  try {
    const reportId = await acceptFreshSnapshot({
      ...structuredClone(scannerFixture),
      narrativeEvidence,
    });
    const report = await getReport(creatorId, reportId);
    assert.ok(report.narrative);
    assert.equal(report.narrative!.status, "ready");
    assert.equal(report.narrative!.mode, "cloud");
    assert.ok(report.narrative!.costMicroUsd > 0);
    assert.equal(report.narrative!.sections!.headline, "Shipped the job queue");
    // The scanner already redacts excerpts, but this proves the server-side
    // sanitizer still runs on the model's own generated prose as well - a
    // leaked-looking path in LLM output must not reach storage untouched.
    assert.match(report.narrative!.sections!.turningPoint, /\[REDACTED:absolute-path\]/);
    assert.doesNotMatch(report.narrative!.sections!.turningPoint, /\/Users\/dev\/private\/repo/);
    assert.equal(stub.callCount(), 1);
  } finally {
    stub.restore();
    process.env.BUILDSTORY_LLM_API_KEY = previousKey;
  }
});

test("an evidence-bearing scan with no provider configured fails the narrative after bounded retries", async () => {
  const stub = stubFetchOnce({});
  const previousKey = process.env.BUILDSTORY_LLM_API_KEY;
  delete process.env.BUILDSTORY_LLM_API_KEY;
  try {
    const reportId = await acceptFreshSnapshot({
      ...structuredClone(scannerFixture),
      narrativeEvidence,
    });
    let report = await getReport(creatorId, reportId);
    for (let attempt = 0; attempt < 3 && report.narrative?.status !== "failed"; attempt += 1) {
      report = await getReport(creatorId, reportId);
    }
    assert.ok(report.narrative);
    assert.equal(report.narrative!.status, "failed");
    assert.equal(report.narrative!.sections, null);
    assert.equal(stub.callCount(), 0);
  } finally {
    stub.restore();
    process.env.BUILDSTORY_LLM_API_KEY = previousKey;
  }
});
