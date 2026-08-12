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
import { buildCombinedMessages, buildDeepAnalysisMessages, buildDeepSynthesisMessages } from "../lib/narrative/prompt";
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

function responsesEnvelope(sections: Record<string, unknown>) {
  return {
    id: "resp_test_v4",
    model: "gpt-5.6-luna",
    output_text: JSON.stringify(sections),
    usage: { input_tokens: 500, output_tokens: 150, output_tokens_details: { reasoning_tokens: 25 }, input_tokens_details: { cached_tokens: 40 } },
  };
}

function combinedStoryOutput(): Omit<ReportStoryPackV2, "version" | "sources" | "signals"> {
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

test("deep hosted generation composes validated analysis with a separate high-quality narrative into StoryPackV3", async () => {
  const snapshot = { ...structuredClone(scannerFixture), narrativeEvidence } as unknown as ScannerProjectSnapshot;
  const base = combinedStoryOutput();
  base.moments = Array.from({ length: 8 }, (_, index) => ({
    ...base.moments[index % base.moments.length]!,
    title: `Supported build moment ${index + 1}`,
  }));
  const sourceRef = defaultStoryPack(snapshot).sources[0]!.ref;
  const signalId = defaultStoryPack(snapshot).signals[0]?.id ?? "fallback-signal-id";
  const finding = { title: "Evidence synthesis", summary: "The reviewed evidence supports this finding.", sourceRefs: [sourceRef], confidence: "high" };
  const signatureMoves = [
    { ...finding, title: "Signature move one", summary: "The first distinctive pattern is supported by the reviewed evidence." },
    { ...finding, title: "Signature move two", summary: "The second distinctive pattern is supported by the reviewed evidence." },
  ];
  const deepAnalysis = {
    openingLine: finding,
    signatureMoves,
    byTheNumbers: [{ ...finding, signalId }],
    whereItGotHard: [],
    chapterChanges: [],
  };
  const synthesis = { ...base } as Record<string, unknown>;
  delete synthesis.standoutTraits;
  const stub = stubFetchOnce([openAiEnvelope(deepAnalysis), openAiEnvelope(synthesis)]);
  const previousKey = process.env.BUILDSTORY_OPENROUTER_API_KEY;
  const previousBaseUrl = process.env.BUILDSTORY_LLM_BASE_URL;
  process.env.BUILDSTORY_OPENROUTER_API_KEY = "test-key";
  process.env.BUILDSTORY_LLM_BASE_URL = "https://openrouter.ai/api/v1";
  try {
    const result = await generateNarrative(snapshot, null, { analysisTier: "deep" });
    assert.equal(result.storyPack.version, "3.0.0");
    assert.equal(result.storyPack.moments.length, 8, "Deep synthesis keeps supported moments beyond the Standard five-moment cap");
    assert.equal(result.storyPack.version === "3.0.0" && result.storyPack.deepAnalysis?.openingLine.summary, finding.summary);
    assert.deepEqual(result.storyPack.version === "3.0.0" && result.storyPack.deepAnalysis?.signatureMoves, deepAnalysis.signatureMoves);
    assert.equal(result.storyPack.version === "3.0.0" && result.storyPack.deepAnalysis?.byTheNumbers[0]?.signalId, signalId);
    assert.deepEqual(result.storyPack.standoutTraits.slice(0, 2), signatureMoves.map((move) => ({ title: move.title, detail: move.summary, sourceRefs: move.sourceRefs })));
    assert.equal(stub.callCount(), 2);
    const requests = stub.requestBodies().map((body) => JSON.parse(body) as {
      model?: string;
      max_tokens?: number;
      reasoning?: unknown;
      provider?: unknown;
      messages?: Array<{ content?: string }>;
      response_format?: { json_schema?: { schema?: { required?: string[]; properties?: Record<string, { maxItems?: number }> } } };
    });
    assert.deepEqual(requests.map((request) => request.max_tokens), [24_000, 40_000]);
    assert.ok(requests.every((request) => request.model === "deepseek/deepseek-v4-flash"));
    assert.ok(requests.every((request) => JSON.stringify(request.reasoning) === JSON.stringify({ effort: "high", exclude: true })));
    assert.ok(requests.every((request) => JSON.stringify(request.provider) === JSON.stringify({ zdr: true, data_collection: "deny", require_parameters: true, allow_fallbacks: true })));
    const synthesisSchema = requests[1]!.response_format?.json_schema?.schema;
    assert.equal(synthesisSchema?.properties?.moments?.maxItems, 12);
    assert.equal(synthesisSchema?.required?.includes("standoutTraits"), false, "pass 2 must not be required to write standoutTraits");
    assert.equal("deepAnalysis" in (synthesisSchema?.properties ?? {}), false, "the synthesis pass does not regenerate private analysis");
    assert.match(requests[1]!.messages?.at(-1)?.content ?? "", /Do not write standoutTraits or deepAnalysis/);
  } finally {
    stub.restore();
    process.env.BUILDSTORY_OPENROUTER_API_KEY = previousKey;
    process.env.BUILDSTORY_LLM_BASE_URL = previousBaseUrl;
  }
});

test("failed deep validation preserves charged usage and generation IDs without retaining response content", async () => {
  const snapshot = { ...structuredClone(scannerFixture), narrativeEvidence } as unknown as ScannerProjectSnapshot;
  const sourceRef = defaultStoryPack(snapshot).sources[0]!.ref;
  const signalId = defaultStoryPack(snapshot).signals[0]?.id ?? "fallback-signal-id";
  const finding = { title: "Evidence synthesis", summary: "The reviewed evidence supports this finding.", sourceRefs: [sourceRef], confidence: "high" };
  const deepAnalysis = {
    openingLine: finding,
    signatureMoves: [],
    byTheNumbers: [{ ...finding, signalId }],
    whereItGotHard: [],
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
        && error.validationDiagnostic?.stage === "synthesis"
        && error.validationDiagnostic.issues.includes("hero:type")
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

test("OpenAI BYOK uses the Responses API with structured output and no retention", async () => {
  const stub = stubFetchOnce(responsesEnvelope(combinedStoryOutput()));
  const previous = {
    openRouterKey: process.env.BUILDSTORY_OPENROUTER_API_KEY,
    llmKey: process.env.BUILDSTORY_LLM_API_KEY,
    cloudProvider: process.env.BUILDSTORY_CLOUD_PROVIDER,
    baseUrl: process.env.BUILDSTORY_LLM_BASE_URL,
    v4Mode: process.env.BUILDSTORY_REPORT_V4_MODE,
  };
  delete process.env.BUILDSTORY_OPENROUTER_API_KEY;
  process.env.BUILDSTORY_LLM_API_KEY = "test-openai-key";
  process.env.BUILDSTORY_CLOUD_PROVIDER = "openai";
  process.env.BUILDSTORY_LLM_BASE_URL = "https://api.openai.com/v1";
  process.env.BUILDSTORY_REPORT_V4_MODE = "on";
  try {
    const result = await generateNarrative({ ...structuredClone(scannerFixture), narrativeEvidence } as unknown as ScannerProjectSnapshot, null, { analysisTier: "standard" });
    const body = JSON.parse(stub.requestBodies()[0]!) as Record<string, unknown>;
    assert.ok("input" in body);
    assert.ok("text" in body);
    assert.equal(body.store, false);
    assert.equal("messages" in body, false);
    assert.equal("response_format" in body, false);
    assert.equal(result.pipelineMode, "on");
    assert.equal(result.requestIds[0], "resp_test_v4");
    assert.equal(result.reasoningTokens, 25);
    assert.equal(result.cachedTokens, 40);
  } finally {
    stub.restore();
    if (previous.openRouterKey === undefined) delete process.env.BUILDSTORY_OPENROUTER_API_KEY; else process.env.BUILDSTORY_OPENROUTER_API_KEY = previous.openRouterKey;
    if (previous.llmKey === undefined) delete process.env.BUILDSTORY_LLM_API_KEY; else process.env.BUILDSTORY_LLM_API_KEY = previous.llmKey;
    if (previous.cloudProvider === undefined) delete process.env.BUILDSTORY_CLOUD_PROVIDER; else process.env.BUILDSTORY_CLOUD_PROVIDER = previous.cloudProvider;
    if (previous.baseUrl === undefined) delete process.env.BUILDSTORY_LLM_BASE_URL; else process.env.BUILDSTORY_LLM_BASE_URL = previous.baseUrl;
    if (previous.v4Mode === undefined) delete process.env.BUILDSTORY_REPORT_V4_MODE; else process.env.BUILDSTORY_REPORT_V4_MODE = previous.v4Mode;
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

test("the OUTPUT CONTRACT block states the schema's own cardinality and length bounds, derived from the schema itself", () => {
  const snapshot = { ...structuredClone(scannerFixture), narrativeEvidence } as unknown as ScannerProjectSnapshot;
  const combined = buildCombinedMessages(snapshot).map((message) => message.content).join("\n");
  assert.match(combined, /buildArc: exactly 3 items/);
  assert.match(combined, /moments: 3-5 items/);
  assert.match(combined, /hero\.headline: 1-120 chars/);
  assert.match(combined, /buildArc must contain exactly one discover, one decide, and one deliver phase entry\./);
  assert.match(combined, /Every sourceRefs entry must be copied exactly.*SOURCE CATALOG/);

  const deepAnalysis = buildDeepAnalysisMessages(snapshot, []).map((message) => message.content).join("\n");
  assert.match(deepAnalysis, /signatureMoves: 0-6 items/);
  assert.match(deepAnalysis, /byTheNumbers: 1-8 items/);
  assert.match(deepAnalysis, /openingLine\.confidence: one of high\/medium\/low/);
  // The cut, advice-shaped sections must never appear anywhere in a Deep
  // prompt - not the contract, not the system framing. (The word
  // "recommendation" itself is expected to appear exactly once, in
  // SYSTEM_PROMPT's rule *forbidding* one - that's checked separately below.)
  for (const cut of ["decisionReview", "risksAndEvidenceGaps", "nextBuildActions", "next-build action"]) {
    assert.doesNotMatch(deepAnalysis, new RegExp(cut, "i"), `Deep analysis prompt must not mention "${cut}"`);
  }
  assert.match(deepAnalysis, /never give advice, a recommendation, a next step/i);

  const deepSynthesis = buildDeepSynthesisMessages(snapshot, {}).map((message) => message.content).join("\n");
  assert.match(deepSynthesis, /moments: 3-12 items/);
});

test("every excerpt label in the prompt resolves to a real SOURCE CATALOG ref", () => {
  const snapshot = { ...structuredClone(scannerFixture), narrativeEvidence } as unknown as ScannerProjectSnapshot;
  const allowedRefs = defaultStoryPack(snapshot).sources.map((source) => source.ref);
  const combined = buildCombinedMessages(snapshot).map((message) => message.content).join("\n");
  const labels = [...combined.matchAll(/\[(S\d\d|GIT) \| [a-z-]+\]/g)].map((match) => match[1]!);
  assert.ok(labels.length > 0, "expected at least one labelled excerpt in the prompt");
  for (const label of labels) assert.ok(allowedRefs.includes(label), `excerpt label ${label} must be a real SOURCE CATALOG ref`);
});

test("a repair turn echoes the model's own failed output back as an assistant message, not just prose feedback", async () => {
  const tooFewMoments = { ...combinedStoryOutput(), moments: combinedStoryOutput().moments.slice(0, 2) };
  const valid = combinedStoryOutput();
  const stub = stubFetchOnce([openAiEnvelope(tooFewMoments), openAiEnvelope(valid)]);
  const previousKey = process.env.BUILDSTORY_OPENROUTER_API_KEY;
  const previousBaseUrl = process.env.BUILDSTORY_LLM_BASE_URL;
  process.env.BUILDSTORY_OPENROUTER_API_KEY = "test-key";
  process.env.BUILDSTORY_LLM_BASE_URL = "https://openrouter.ai/api/v1";
  try {
    const snapshot = { ...structuredClone(scannerFixture), narrativeEvidence } as unknown as ScannerProjectSnapshot;
    const result = await generateNarrative(snapshot, null, { analysisTier: "standard" });
    assert.equal(result.storyPack.moments.length, valid.moments.length);
    assert.equal(stub.callCount(), 2);
    const secondBody = JSON.parse(stub.requestBodies()[1]!) as { messages?: Array<{ role: string; content: string }> };
    const assistantMessages = secondBody.messages?.filter((message) => message.role === "assistant") ?? [];
    assert.equal(assistantMessages.length, 1, "the repair turn must include the model's own failed output as an assistant message");
    assert.match(assistantMessages[0]!.content, /"moments"/);
    assert.equal(secondBody.messages?.at(-1)?.role, "user");
    assert.match(secondBody.messages?.at(-1)?.content ?? "", /moments/);
  } finally {
    stub.restore();
    process.env.BUILDSTORY_OPENROUTER_API_KEY = previousKey;
    process.env.BUILDSTORY_LLM_BASE_URL = previousBaseUrl;
  }
});

test("an over-length Deep synthesis string is truncated as a recoverable warning, not spent on a repair call", async () => {
  const snapshot = { ...structuredClone(scannerFixture), narrativeEvidence } as unknown as ScannerProjectSnapshot;
  const sourceRef = defaultStoryPack(snapshot).sources[0]!.ref;
  const signalId = defaultStoryPack(snapshot).signals[0]?.id ?? "fallback-signal-id";
  const finding = { title: "Evidence synthesis", summary: "The reviewed evidence supports this finding.", sourceRefs: [sourceRef], confidence: "high" };
  const deepAnalysis = {
    openingLine: finding,
    signatureMoves: [],
    byTheNumbers: [{ ...finding, signalId }],
    whereItGotHard: [],
    chapterChanges: [],
  };
  const base = combinedStoryOutput();
  base.buildArc = base.buildArc.map((entry) => ({ ...entry, summary: "x".repeat(400) })); // buildArc[].summary maxLength is 260
  const stub = stubFetchOnce([openAiEnvelope(deepAnalysis), openAiEnvelope(base)]);
  const previousKey = process.env.BUILDSTORY_OPENROUTER_API_KEY;
  const previousBaseUrl = process.env.BUILDSTORY_LLM_BASE_URL;
  process.env.BUILDSTORY_OPENROUTER_API_KEY = "test-key";
  process.env.BUILDSTORY_LLM_BASE_URL = "https://openrouter.ai/api/v1";
  try {
    const result = await generateNarrative(snapshot, null, { analysisTier: "deep" });
    assert.equal(stub.callCount(), 2, "an over-length string must not spend a repair call - normalization already truncates it losslessly");
    assert.ok(result.storyPack.buildArc.every((entry) => entry.summary.length <= 260));
    assert.ok(result.fallbacksUsed.some((path) => path.includes("buildArc") && path.includes("summary")));
  } finally {
    stub.restore();
    process.env.BUILDSTORY_OPENROUTER_API_KEY = previousKey;
    process.env.BUILDSTORY_LLM_BASE_URL = previousBaseUrl;
  }
});

test("a legacy flat narrative shape is validated strictly for Deep instead of silently passing", async () => {
  const snapshot = { ...structuredClone(scannerFixture), narrativeEvidence } as unknown as ScannerProjectSnapshot;
  const sourceRef = defaultStoryPack(snapshot).sources[0]!.ref;
  const signalId = defaultStoryPack(snapshot).signals[0]?.id ?? "fallback-signal-id";
  const finding = { title: "Evidence synthesis", summary: "The reviewed evidence supports this finding.", sourceRefs: [sourceRef], confidence: "high" };
  const deepAnalysis = {
    openingLine: finding,
    signatureMoves: [],
    byTheNumbers: [{ ...finding, signalId }],
    whereItGotHard: [],
    chapterChanges: [],
  };
  // Pre-V2 flat shape: no hero/buildArc/moments/turningPoint object, no
  // decisions/standoutTraits objects. Before gating the legacy bypass off
  // for Deep (see validateStoryComponent/validateInsightsComponent in
  // story-pack.ts), this shape passed "deep-narrative" validation with zero
  // errors and shipped as a billed, "ready" Deep report.
  const legacyFlat = {
    headline: "Legacy shape",
    narrative: "This is the old pre-V2 flat shape the model might still emit.",
    turningPoint: "A flat string turning point, not an object.",
    decisionPatterns: ["Some pattern"],
    standoutTraits: ["Some trait"],
    growthEdge: "A flat string growth edge.",
  };
  const stub = stubFetchOnce([openAiEnvelope(deepAnalysis), openAiEnvelope(legacyFlat), openAiEnvelope(legacyFlat)]);
  const previousKey = process.env.BUILDSTORY_OPENROUTER_API_KEY;
  const previousBaseUrl = process.env.BUILDSTORY_LLM_BASE_URL;
  process.env.BUILDSTORY_OPENROUTER_API_KEY = "test-key";
  process.env.BUILDSTORY_LLM_BASE_URL = "https://openrouter.ai/api/v1";
  try {
    await assert.rejects(
      generateNarrative(snapshot, null, { analysisTier: "deep" }),
      (error: unknown) => error instanceof NarrativeProviderError && error.code === "llm_invalid_schema",
    );
    assert.equal(stub.callCount(), 3);
  } finally {
    stub.restore();
    process.env.BUILDSTORY_OPENROUTER_API_KEY = previousKey;
    process.env.BUILDSTORY_LLM_BASE_URL = previousBaseUrl;
  }
});
