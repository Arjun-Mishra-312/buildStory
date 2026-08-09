import assert from "node:assert/strict";
import test from "node:test";
import {
  acceptSnapshot,
  claimUploadSession,
  createUploadSession,
  getReport,
} from "../lib/ingestion/mock-store";
import { sha256Digest } from "../lib/ingestion/local-contract";
import { validateProjectSnapshot } from "../lib/ingestion/validation";
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

/**
 * Defaults to "cloud": this file's fixtures exercise the cloud
 * evidence-processing path unless a test overrides the mode (e.g. the
 * locally generated narrative test, whose snapshot already carries a
 * complete generatedNarrative and so takes the mode-independent branch
 * regardless). createUploadSession's own internal default changed to
 * "local" for defense in depth (the real POST /api/creator/upload-sessions
 * route already always passes an explicit mode, defaulting to "local"
 * itself, so this never mattered for real traffic) - tests that care about
 * a specific session mode must say so explicitly rather than lean on either
 * default.
 */
async function acceptFreshSnapshot(snapshot: unknown, narrativeMode: "local" | "byok" | "cloud" | "off" = "cloud") {
  const created = await createUploadSession(creatorId, "Narrative pipeline test", "http://localhost/", null, null, narrativeMode);
  const { sessionId, userCode } = created.deviceAuthorization;
  const claim = await claimUploadSession(sessionId, userCode);
  const raw = JSON.stringify(snapshot);
  const receipt = await acceptSnapshot(sessionId, claim.uploadGrant.bearerToken, await sha256Digest(raw), snapshot);
  return receipt.reportEndpoint!.split("/").at(-1)!;
}

function stubFetchOnce(responseBody: unknown | unknown[], status = 200) {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    const response = Array.isArray(responseBody)
      ? responseBody[Math.min(calls, responseBody.length - 1)]
      : responseBody;
    calls += 1;
    return new Response(JSON.stringify(response), {
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

test("a locally generated narrative is stored ready without creating a cloud job", async () => {
  const stub = stubFetchOnce({});
  const previousKey = process.env.BUILDSTORY_LLM_API_KEY;
  delete process.env.BUILDSTORY_LLM_API_KEY;
  try {
    const reportId = await acceptFreshSnapshot({
      ...structuredClone(scannerFixture),
      schemaVersion: "1.6.0",
      generatedNarrative: {
        version: "1.0.0",
        generatedAt: "2026-08-03T12:00:00.000Z",
        mode: "local",
        provider: "ollama",
        model: "gemma4:12b",
        sections: {
          headline: "Local first",
          narrative: "The report prose was generated before upload.",
          turningPoint: "The model stayed on the builder's machine.",
          learnings: ["Keep private excerpts local."],
          decisionPatterns: ["Review before shipping."],
          standoutTraits: ["Protects the boundary."],
          growthEdge: "Validate the weak product-instinct proxy with more evidence.",
        },
        fallbacksUsed: [],
      },
    });
    const report = await getReport(creatorId, reportId);
    assert.ok(report.narrative);
    assert.equal(report.narrative!.status, "ready");
    assert.equal(report.narrative!.mode, "local");
    assert.equal(report.narrative!.provider, "ollama");
    assert.equal(report.narrative!.sections!.headline, "Local first");
    assert.equal(stub.callCount(), 0);
  } finally {
    stub.restore();
    process.env.BUILDSTORY_LLM_API_KEY = previousKey;
  }
});

test("local and cloud narrative generation are mutually exclusive - a snapshot claiming both is rejected", async () => {
  const conflicted = {
    ...structuredClone(scannerFixture),
    schemaVersion: "1.6.0",
    generatedNarrative: {
      version: "1.0.0",
      generatedAt: "2026-08-03T12:00:00.000Z",
      mode: "local",
      provider: "ollama",
      model: "gemma4:12b",
      sections: {
        headline: "Local first",
        narrative: "The report prose was generated before upload.",
        turningPoint: "The model stayed on the builder's machine.",
        learnings: ["Keep private excerpts local."],
        decisionPatterns: ["Review before shipping."],
        standoutTraits: ["Protects the boundary."],
        growthEdge: "Validate the weak product-instinct proxy with more evidence.",
      },
      fallbacksUsed: [],
    },
    narrativeEvidence,
  };

  const direct = validateProjectSnapshot(conflicted);
  assert.equal(direct.ok, false);
  if (!direct.ok) {
    assert.ok(
      direct.errors.some((message) => message.includes("mutually exclusive")),
      `expected a mutual-exclusivity error, got: ${direct.errors.join(" | ")}`,
    );
  }

  // Proves the check is actually wired into the upload path, not just the
  // standalone validator - a client that (by bug or tampering) claims local
  // mode while still attaching excerpts must never have those excerpts
  // accepted into storage.
  const created = await createUploadSession(creatorId, "Mutual-exclusivity test", "http://localhost/");
  const { sessionId, userCode } = created.deviceAuthorization;
  const claim = await claimUploadSession(sessionId, userCode);
  const raw = JSON.stringify(conflicted);
  const digest = await sha256Digest(raw);
  await assert.rejects(
    () => acceptSnapshot(sessionId, claim.uploadGrant.bearerToken, digest, conflicted),
    /./,
  );
});

test("an evidence-bearing scan generates a narrative and sanitizes the model's output before storage", async () => {
  const stub = stubFetchOnce([
    openAiEnvelope({
      headline: "Shipped the job queue",
      narrative: "Built a lease-based job queue instead of a hosted broker.",
      turningPoint: "Committed after testing it at /Users/dev/private/repo worked end to end.",
      learnings: ["Bounded retries beat unbounded ones."],
    }),
    openAiEnvelope({
      decisionPatterns: ["Tested the queue before committing."],
      standoutTraits: ["Keeps retry behavior bounded."],
      growthEdge: "Keep validating the product signal with more evidence.",
    }),
  ]);
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
    assert.deepEqual(report.narrative!.sections!.decisionPatterns, ["Tested the queue before committing."]);
    // The scanner already redacts excerpts, but this proves the server-side
    // sanitizer still runs on the model's own generated prose as well - a
    // leaked-looking path in LLM output must not reach storage untouched.
    assert.match(report.narrative!.sections!.turningPoint, /\[REDACTED:absolute-path\]/);
    assert.doesNotMatch(report.narrative!.sections!.turningPoint, /\/Users\/dev\/private\/repo/);
    assert.equal(stub.callCount(), 2);
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
