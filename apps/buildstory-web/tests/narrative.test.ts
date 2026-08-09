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
import { defaultStoryPack } from "../lib/narrative/story-pack";
import { generateNarrative, NarrativeProviderError } from "../lib/narrative/provider";
import { buildDeepSynthesisMessages } from "../lib/narrative/prompt";
import type { ReportStoryPackV2, ScannerProjectSnapshot } from "../lib/ingestion/scanner-project-snapshot";
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
async function acceptFreshSnapshot(snapshot: unknown, narrativeMode: "local" | "byok" | "cloud" | "off" = "cloud", narrativeModel: string | null = null) {
  const created = await createUploadSession(creatorId, "Narrative pipeline test", "http://localhost/", null, narrativeModel, narrativeMode);
  const { sessionId, userCode } = created.deviceAuthorization;
  const claim = await claimUploadSession(sessionId, userCode);
  const raw = JSON.stringify(snapshot);
  const receipt = await acceptSnapshot(sessionId, claim.uploadGrant.bearerToken, await sha256Digest(raw), snapshot);
  return receipt.reportEndpoint!.split("/").at(-1)!;
}

function stubFetchOnce(responseBody: unknown | unknown[], status = 200) {
  const original = globalThis.fetch;
  let calls = 0;
  const requestBodies: string[] = [];
  globalThis.fetch = (async (_input, init) => {
    requestBodies.push(typeof init?.body === "string" ? init.body : "");
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
    requestBodies: () => requestBodies,
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

function combinedStoryOutput(): Omit<ReportStoryPackV2, "version" | "sources"> {
  const pack = defaultStoryPack(scannerFixture as unknown as ScannerProjectSnapshot);
  return {
    hero: pack.hero,
    buildArc: pack.buildArc,
    moments: pack.moments,
    turningPoint: pack.turningPoint,
    decisions: pack.decisions,
    learnings: pack.learnings,
    standoutTraits: pack.standoutTraits,
    growthEdge: pack.growthEdge,
  };
}

test("a scan with no narrative evidence never calls the LLM and has no narrative", async () => {
  const stub = stubFetchOnce({});
  const previousKey = process.env.BUILDSTORY_OPENROUTER_API_KEY;
  const previousBaseUrl = process.env.BUILDSTORY_LLM_BASE_URL;
  process.env.BUILDSTORY_OPENROUTER_API_KEY = "test-key";
  process.env.BUILDSTORY_LLM_BASE_URL = "https://openrouter.ai/api/v1";
  try {
    const reportId = await acceptFreshSnapshot(structuredClone(scannerFixture));
    const report = await getReport(creatorId, reportId);
    assert.equal(report.narrative, null);
    assert.equal(stub.callCount(), 0);
  } finally {
    stub.restore();
    process.env.BUILDSTORY_OPENROUTER_API_KEY = previousKey;
    process.env.BUILDSTORY_LLM_BASE_URL = previousBaseUrl;
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
    }, "local");
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

test("the upload session mode rejects content that belongs to a different narrative path", async () => {
  const local = await createUploadSession(creatorId, "Local evidence mismatch", "http://localhost/", null, null, "local");
  const localClaim = await claimUploadSession(local.deviceAuthorization.sessionId, local.deviceAuthorization.userCode);
  const evidenceSnapshot = { ...structuredClone(scannerFixture), narrativeEvidence };
  const evidenceRaw = JSON.stringify(evidenceSnapshot);
  const evidenceDigest = await sha256Digest(evidenceRaw);
  await assert.rejects(
    () => acceptSnapshot(local.deviceAuthorization.sessionId, localClaim.uploadGrant.bearerToken, evidenceDigest, evidenceSnapshot),
    /./,
  );

  const cloud = await createUploadSession(creatorId, "Cloud generated mismatch", "http://localhost/", null, null, "cloud");
  const cloudClaim = await claimUploadSession(cloud.deviceAuthorization.sessionId, cloud.deviceAuthorization.userCode);
  const generatedSnapshot = {
    ...structuredClone(scannerFixture),
    generatedNarrative: {
      version: "1.0.0",
      generatedAt: "2026-08-03T12:00:00.000Z",
      mode: "local",
      provider: "ollama",
      model: "gemma4:12b",
      sections: {
        headline: "Wrong path",
        narrative: "This must not enter a cloud session.",
        turningPoint: "The server rejected it.",
        learnings: ["Bind payloads to the selected mode."],
        decisionPatterns: ["Fail closed."],
        standoutTraits: ["Careful."],
        growthEdge: "Keep testing boundaries.",
      },
      fallbacksUsed: [],
    },
  };
  const generatedRaw = JSON.stringify(generatedSnapshot);
  const generatedDigest = await sha256Digest(generatedRaw);
  await assert.rejects(
    () => acceptSnapshot(cloud.deviceAuthorization.sessionId, cloudClaim.uploadGrant.bearerToken, generatedDigest, generatedSnapshot),
    /./,
  );
});

test("Buildstory Cloud rejects an evidence policy above the disclosed server caps", () => {
  const oversized = {
    ...structuredClone(scannerFixture),
    narrativeEvidence: {
      ...structuredClone(narrativeEvidence),
      policy: { ...narrativeEvidence.policy, maxExcerpts: 81 },
    },
  };
  const result = validateProjectSnapshot(oversized);
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.errors.some((message) => message.includes("$.narrativeEvidence")));
});

test("an evidence-bearing scan generates a narrative and sanitizes the model's output before storage", async () => {
  const combined = combinedStoryOutput();
  combined.hero = { headline: "Shipped the job queue", summary: "Built a lease-based job queue instead of a hosted broker." };
  combined.turningPoint = { ...combined.turningPoint, quote: "Committed after testing it at /Users/dev/private/repo worked end to end." };
  combined.decisions[0] = { ...combined.decisions[0]!, title: "Queue testing", rationale: "Tested the queue before committing.", outcome: "Kept retry behavior bounded." };
  const stub = stubFetchOnce(openAiEnvelope(combined));
  const previousKey = process.env.BUILDSTORY_OPENROUTER_API_KEY;
  const previousBaseUrl = process.env.BUILDSTORY_LLM_BASE_URL;
  process.env.BUILDSTORY_OPENROUTER_API_KEY = "test-key";
  process.env.BUILDSTORY_LLM_BASE_URL = "https://openrouter.ai/api/v1";
  try {
    const reportId = await acceptFreshSnapshot({
      ...structuredClone(scannerFixture),
      narrativeEvidence,
    }, "cloud");
    const report = await getReport(creatorId, reportId);
    assert.ok(report.narrative);
    assert.equal(report.narrative!.status, "ready");
    assert.equal(report.narrative!.mode, "cloud");
    assert.ok(report.narrative!.costMicroUsd > 0);
    assert.equal(report.narrative!.sections!.headline, "Shipped the job queue");
    assert.match(report.narrative!.sections!.decisionPatterns?.[0] ?? "", /Tested the queue before committing/);
    // The scanner already redacts excerpts, but this proves the server-side
    // sanitizer still runs on the model's own generated prose as well - a
    // leaked-looking path in LLM output must not reach storage untouched.
    assert.match(report.narrative!.sections!.turningPoint, /\[REDACTED:absolute-path\]/);
    assert.doesNotMatch(report.narrative!.sections!.turningPoint, /\/Users\/dev\/private\/repo/);
    assert.equal(stub.callCount(), 1);
    const request = JSON.parse(stub.requestBodies()[0]!) as { store?: boolean; provider?: unknown; model?: string };
    assert.equal(request.store, undefined);
    assert.equal(request.model, "deepseek/deepseek-v4-flash");
    assert.deepEqual(request.provider, { zdr: true, data_collection: "deny", require_parameters: true, allow_fallbacks: true });
  } finally {
    stub.restore();
    process.env.BUILDSTORY_OPENROUTER_API_KEY = previousKey;
    process.env.BUILDSTORY_LLM_BASE_URL = previousBaseUrl;
  }
});

test("Buildstory Cloud always requests the one supported model, even if a session somehow carries a different one", async () => {
  // The upload-sessions route never stores a model for a cloud-mode session
  // (model choice only means anything for local/BYOK), but this proves the
  // generation call itself ignores a stale/tampered value too - defense in
  // depth against any path other than that route.
  const combined = combinedStoryOutput();
  combined.hero = { headline: "Ignored the requested model", summary: "Still used the one supported model." };
  const stub = stubFetchOnce(openAiEnvelope(combined));
  const previousKey = process.env.BUILDSTORY_OPENROUTER_API_KEY;
  const previousBaseUrl = process.env.BUILDSTORY_LLM_BASE_URL;
  process.env.BUILDSTORY_OPENROUTER_API_KEY = "test-key";
  process.env.BUILDSTORY_LLM_BASE_URL = "https://openrouter.ai/api/v1";
  try {
    const reportId = await acceptFreshSnapshot(
      { ...structuredClone(scannerFixture), narrativeEvidence },
      "cloud",
      "gpt-5.6-terra",
    );
    const report = await getReport(creatorId, reportId);
    assert.equal(report.narrative!.status, "ready");
    assert.equal(report.narrative!.model, "deepseek/deepseek-v4-flash");
    for (const body of stub.requestBodies()) {
      assert.equal((JSON.parse(body) as { model?: string }).model, "deepseek/deepseek-v4-flash");
    }
    assert.equal(stub.callCount(), 1);
  } finally {
    stub.restore();
    process.env.BUILDSTORY_OPENROUTER_API_KEY = previousKey;
    process.env.BUILDSTORY_LLM_BASE_URL = previousBaseUrl;
  }
});

test("deep hosted generation uses two high-reasoning OpenRouter calls and emits StoryPackV3", async () => {
  const snapshot = { ...structuredClone(scannerFixture), narrativeEvidence } as unknown as ScannerProjectSnapshot;
  const base = combinedStoryOutput();
  const sourceRef = defaultStoryPack(snapshot).sources[0]!.ref;
  const finding = { title: "Evidence synthesis", summary: "The reviewed evidence supports this finding.", sourceRefs: [sourceRef], confidence: "high" };
  const deepAnalysis = {
    executiveSynthesis: finding,
    decisionReview: [finding],
    frictionAndRecovery: [],
    engineeringPatterns: [finding],
    risksAndEvidenceGaps: [],
    nextBuildActions: [{ ...finding, priority: "next", rationale: "Validate it in the next chapter." }],
    chapterChanges: [],
  };
  const stub = stubFetchOnce([openAiEnvelope(deepAnalysis), openAiEnvelope({ ...base, deepAnalysis })]);
  const previousKey = process.env.BUILDSTORY_OPENROUTER_API_KEY;
  const previousBaseUrl = process.env.BUILDSTORY_LLM_BASE_URL;
  process.env.BUILDSTORY_OPENROUTER_API_KEY = "test-key";
  process.env.BUILDSTORY_LLM_BASE_URL = "https://openrouter.ai/api/v1";
  try {
    const result = await generateNarrative(snapshot, null, { analysisTier: "deep" });
    assert.equal(result.storyPack.version, "3.0.0");
    assert.equal(stub.callCount(), 2);
    const requests = stub.requestBodies().map((body) => JSON.parse(body) as { model?: string; max_tokens?: number; reasoning?: unknown; provider?: unknown });
    assert.deepEqual(requests.map((request) => request.max_tokens), [24_000, 40_000]);
    assert.ok(requests.every((request) => request.model === "deepseek/deepseek-v4-flash"));
    assert.ok(requests.every((request) => JSON.stringify(request.reasoning) === JSON.stringify({ effort: "high", exclude: true })));
    assert.ok(requests.every((request) => JSON.stringify(request.provider) === JSON.stringify({ zdr: true, data_collection: "deny", require_parameters: true, allow_fallbacks: true })));
  } finally {
    stub.restore();
    process.env.BUILDSTORY_OPENROUTER_API_KEY = previousKey;
    process.env.BUILDSTORY_LLM_BASE_URL = previousBaseUrl;
  }
});

test("failed deep validation preserves charged usage and generation IDs without retaining response content", async () => {
  const snapshot = { ...structuredClone(scannerFixture), narrativeEvidence } as unknown as ScannerProjectSnapshot;
  const sourceRef = defaultStoryPack(snapshot).sources[0]!.ref;
  const finding = { title: "Evidence synthesis", summary: "The reviewed evidence supports this finding.", sourceRefs: [sourceRef], confidence: "high" };
  const deepAnalysis = {
    executiveSynthesis: finding,
    decisionReview: [],
    frictionAndRecovery: [],
    engineeringPatterns: [],
    risksAndEvidenceGaps: [],
    nextBuildActions: [],
    chapterChanges: [],
  };
  const envelope = (id: string, value: Record<string, unknown>) => ({
    id,
    choices: [{ message: { content: JSON.stringify(value) } }],
    usage: { prompt_tokens: 500, completion_tokens: 150, cost: 0.001 },
  });
  const stub = stubFetchOnce([
    envelope("gen_analysis", deepAnalysis),
    envelope("gen_synthesis", {}),
    envelope("gen_repair", {}),
  ]);
  const previousKey = process.env.BUILDSTORY_OPENROUTER_API_KEY;
  const previousBaseUrl = process.env.BUILDSTORY_LLM_BASE_URL;
  process.env.BUILDSTORY_OPENROUTER_API_KEY = "test-key";
  process.env.BUILDSTORY_LLM_BASE_URL = "https://openrouter.ai/api/v1";
  try {
    await assert.rejects(
      generateNarrative(snapshot, null, { analysisTier: "deep" }),
      (error: unknown) => error instanceof NarrativeProviderError
        && error.code === "llm_invalid_schema"
        && error.usage?.inputTokens === 1_500
        && error.usage.outputTokens === 450
        && error.usage.costMicroUsd === 3_000
        && JSON.stringify(error.usage.requestIds) === JSON.stringify(["gen_analysis", "gen_synthesis", "gen_repair"]),
    );
    assert.equal(stub.callCount(), 3);
  } finally {
    stub.restore();
    process.env.BUILDSTORY_OPENROUTER_API_KEY = previousKey;
    process.env.BUILDSTORY_LLM_BASE_URL = previousBaseUrl;
  }
});

test("an evidence-bearing scan with no provider configured fails the narrative after bounded retries", async () => {
  const stub = stubFetchOnce({});
  const previousKey = process.env.BUILDSTORY_OPENROUTER_API_KEY;
  const previousBaseUrl = process.env.BUILDSTORY_LLM_BASE_URL;
  delete process.env.BUILDSTORY_OPENROUTER_API_KEY;
  process.env.BUILDSTORY_LLM_BASE_URL = "https://openrouter.ai/api/v1";
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
    process.env.BUILDSTORY_OPENROUTER_API_KEY = previousKey;
    process.env.BUILDSTORY_LLM_BASE_URL = previousBaseUrl;
  }
});

test("OpenRouter requests enforce ZDR routing and deny provider data collection", async () => {
  const combined = combinedStoryOutput();
  const stub = stubFetchOnce(openAiEnvelope(combined));
  const previous = {
    openRouterKey: process.env.BUILDSTORY_OPENROUTER_API_KEY,
    llmKey: process.env.BUILDSTORY_LLM_API_KEY,
    cloudProvider: process.env.BUILDSTORY_CLOUD_PROVIDER,
    baseUrl: process.env.BUILDSTORY_LLM_BASE_URL,
  };
  process.env.BUILDSTORY_OPENROUTER_API_KEY = "test-openrouter-key";
  delete process.env.BUILDSTORY_LLM_API_KEY;
  process.env.BUILDSTORY_CLOUD_PROVIDER = "openrouter";
  process.env.BUILDSTORY_LLM_BASE_URL = "https://openrouter.ai/api/v1";
  try {
    await generateNarrative({ ...structuredClone(scannerFixture), narrativeEvidence } as unknown as ScannerProjectSnapshot, null, { analysisTier: "standard" });
    const body = JSON.parse(stub.requestBodies()[0]!) as Record<string, unknown>;
    assert.equal(body.model, "deepseek/deepseek-v4-flash");
    assert.deepEqual(body.provider, { zdr: true, data_collection: "deny", require_parameters: true, allow_fallbacks: true });
    assert.equal("store" in body, false);
  } finally {
    stub.restore();
    process.env.BUILDSTORY_OPENROUTER_API_KEY = previous.openRouterKey;
    process.env.BUILDSTORY_LLM_API_KEY = previous.llmKey;
    process.env.BUILDSTORY_CLOUD_PROVIDER = previous.cloudProvider;
    process.env.BUILDSTORY_LLM_BASE_URL = previous.baseUrl;
  }
});

test("deep synthesis does not resend reviewed excerpt text", () => {
  const marker = "PRIVATE_EXCERPT_MARKER_9b77";
  const snapshot = {
    ...structuredClone(scannerFixture),
    narrativeEvidence: {
      ...structuredClone(narrativeEvidence),
      excerpts: [{ ...narrativeEvidence.excerpts[0]!, text: marker }],
    },
  } as unknown as ScannerProjectSnapshot;
  const serialized = JSON.stringify(buildDeepSynthesisMessages(snapshot, { supportedFinding: "bounded" }));
  assert.doesNotMatch(serialized, new RegExp(marker));
  assert.match(serialized, /ANALYSIS MAP/);
});
