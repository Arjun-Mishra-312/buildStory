import {
  NARRATIVE_COMBINED_RESPONSE_FORMAT,
  NARRATIVE_DEEP_ANALYSIS_RESPONSE_FORMAT,
  NARRATIVE_DEEP_SYNTHESIS_RESPONSE_FORMAT,
  buildCombinedMessages,
  buildDeepAnalysisMessages,
  buildDeepSynthesisMessages,
} from "./prompt";
import type { NarrativeProfileSections, NarrativeSections } from "./schema";
import { isOllamaAutoModel, isOllamaBaseUrl, resolveOllamaModel } from "./ollama";
import type { AnalysisTier, NarrativeProvider, ReportStoryPack, ScannerProjectSnapshot } from "../ingestion/scanner-project-snapshot";
import { defaultStoryPack, normalizeDeepStoryPack, normalizeStoryPack, sectionsFromStoryPack, validateDeepAnalysisComponent, validateStoryPackComponent, type StoryPackComponent } from "./story-pack";
import { sanitizePublicText } from "../publication/sanitization";

export type NarrativeFailureUsage = {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedTokens: number;
  costMicroUsd: number | null;
  requestIds: string[];
};

export type NarrativeValidationDiagnostic = {
  stage: "analysis" | "synthesis" | "composition" | "standard";
  /** Content-free JSON paths and rule names only; never model output or source IDs. */
  issues: string[];
};

export class NarrativeProviderError extends Error {
  constructor(
    public code: string,
    message: string,
    public retryable = false,
    public status: number | null = null,
    public usage: NarrativeFailureUsage | null = null,
    public validationDiagnostic: NarrativeValidationDiagnostic | null = null,
    /** Raw provider content that failed JSON.parse, so a repair turn can echo it back. Never persisted. */
    public rawContent: string | null = null,
  ) {
    super(message);
  }
}

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type NarrativeGenerationResult = {
  sections: NarrativeSections & NarrativeProfileSections;
  storyPack: ReportStoryPack;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedTokens: number;
  actualCostMicroUsd: number | null;
  requestIds: string[];
  fallbacksUsed: string[];
  invalidReferenceCount: number;
  generationLatencyMs: number;
};

/**
 * Only meaningful for the cloud generation path: local mode's readiness is
 * established client-side (the CLI only ever ships `generatedNarrative` on
 * the snapshot if Ollama actually produced it), and local narratives are
 * persisted directly via storeLocalNarrative without ever reaching this
 * check. The `"local"` case below exists only to fail closed rather than
 * silently report ready if this is ever called from a local-mode path that
 * doesn't actually have a resolved model - it deliberately does NOT report
 * `true`, unlike the earlier version of this function.
 */
export function narrativeProviderConfigured(mode: "local" | "cloud" | "off" = "cloud"): boolean {
  if (mode !== "cloud") return false;
  const baseUrl = process.env.BUILDSTORY_LLM_BASE_URL;
  return Boolean(
    process.env.BUILDSTORY_OPENROUTER_API_KEY
    || process.env.BUILDSTORY_LLM_API_KEY
    || (baseUrl && isOllamaBaseUrl(baseUrl)),
  );
}

export function configuredCloudNarrativeProvider(): NarrativeProvider {
  const configuredProvider = process.env.BUILDSTORY_CLOUD_PROVIDER
    ?? (process.env.BUILDSTORY_OPENROUTER_API_KEY ? "openrouter" : process.env.BUILDSTORY_LLM_API_KEY ? "openai" : "openrouter");
  const defaultBaseUrl = configuredProvider === "openai"
    ? "https://api.openai.com/v1"
    : "https://openrouter.ai/api/v1";
  const baseUrl = process.env.BUILDSTORY_LLM_BASE_URL ?? defaultBaseUrl;
  if (isOllamaBaseUrl(baseUrl)) return "ollama";
  try {
    const hostname = new URL(baseUrl).hostname.toLocaleLowerCase("en-US");
    if (hostname === "openrouter.ai") return "openrouter";
    if (hostname === "api.openai.com") return "openai";
  } catch {
    // generateNarrative performs the authoritative URL validation and fails closed.
  }
  return "openai-compatible";
}

export function configuredCloudNarrativeModel(): string | null {
  const provider = configuredCloudNarrativeProvider();
  if (provider === "openrouter") return "deepseek/deepseek-v4-flash";
  if (provider === "openai") return process.env.BUILDSTORY_LLM_MODEL || "gpt-5.6-luna";
  return null;
}

let zdrReadinessCache: { ready: boolean; expiresAt: number } | null = null;
export async function openRouterZdrModelReady(): Promise<boolean> {
  if (zdrReadinessCache && zdrReadinessCache.expiresAt > Date.now()) return zdrReadinessCache.ready;
  const apiKey = process.env.BUILDSTORY_OPENROUTER_API_KEY;
  if (!apiKey) return false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch("https://openrouter.ai/api/v1/endpoints/zdr", {
      headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return false;
    }
    const catalog = await response.json() as unknown;
    const ready = JSON.stringify(catalog).includes("deepseek/deepseek-v4-flash");
    zdrReadinessCache = { ready, expiresAt: Date.now() + 60_000 };
    return ready;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

type Completion = {
  value: unknown;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedTokens: number;
  costMicroUsd: number | null;
  requestIds: string[];
  model: string;
  provider: string;
};

function emptyFailureUsage(): NarrativeFailureUsage {
  return { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cachedTokens: 0, costMicroUsd: null, requestIds: [] };
}

function addFailureUsage(target: NarrativeFailureUsage, source: NarrativeFailureUsage): NarrativeFailureUsage {
  return {
    inputTokens: target.inputTokens + source.inputTokens,
    outputTokens: target.outputTokens + source.outputTokens,
    reasoningTokens: target.reasoningTokens + source.reasoningTokens,
    cachedTokens: target.cachedTokens + source.cachedTokens,
    costMicroUsd: source.costMicroUsd === null
      ? target.costMicroUsd
      : (target.costMicroUsd ?? 0) + source.costMicroUsd,
    requestIds: [...new Set([...target.requestIds, ...source.requestIds])],
  };
}

function completionUsage(completion: Completion): NarrativeFailureUsage {
  return {
    inputTokens: completion.inputTokens,
    outputTokens: completion.outputTokens,
    reasoningTokens: completion.reasoningTokens,
    cachedTokens: completion.cachedTokens,
    costMicroUsd: completion.costMicroUsd,
    requestIds: completion.requestIds,
  };
}

function providerErrorWithUsage(error: NarrativeProviderError, usage: NarrativeFailureUsage): NarrativeProviderError {
  return new NarrativeProviderError(
    error.code,
    error.message,
    error.retryable,
    error.status,
    addFailureUsage(usage, error.usage ?? emptyFailureUsage()),
    error.validationDiagnostic,
    error.rawContent,
  );
}

// Keep repair-turn context small: this is provider-facing (goes back to the
// same ZDR/deny-data-collection endpoint that just produced it, never
// persisted), but an unbounded echo could blow past the request's own
// max_tokens budget on a pathologically large response.
function truncateForEcho(text: string, max = 12_000): string {
  return text.length > max ? `${text.slice(0, max)}\n…(truncated)` : text;
}

function legacyCompatiblePayload(storyValue: unknown, profileValue: unknown, snapshot: ScannerProjectSnapshot): Record<string, unknown> {
  const story = storyValue && typeof storyValue === "object" && !Array.isArray(storyValue) ? storyValue as Record<string, unknown> : {};
  const profile = profileValue && typeof profileValue === "object" && !Array.isArray(profileValue) ? profileValue as Record<string, unknown> : {};
  const fallbackRef = defaultStoryPack(snapshot).sources[0]?.ref;
  const refs = fallbackRef ? [fallbackRef] : [];
  const legacyList = (value: unknown, title: string, detailKey: "detail" | "rationale") => Array.isArray(value)
    ? value.map((entry) => ({ title, [detailKey]: typeof entry === "string" ? entry : "Observed in the selected evidence.", ...(detailKey === "rationale" ? { outcome: "Observed in the selected evidence." } : {}), sourceRefs: refs }))
    : undefined;
  const hero = story.hero ?? (story.headline || story.narrative ? { headline: story.headline, summary: story.narrative } : undefined);
  const turningPoint = story.turningPoint && typeof story.turningPoint === "object"
    ? story.turningPoint
    : (typeof story.turningPoint === "string" ? { quote: story.turningPoint, sourceRefs: refs } : undefined);
  return {
    ...story,
    ...profile,
    ...(hero ? { hero } : {}),
    ...(turningPoint ? { turningPoint } : {}),
    ...(story.learnings && Array.isArray(story.learnings) && typeof story.learnings[0] === "string" ? { learnings: legacyList(story.learnings, "Learning", "detail") } : {}),
    ...(profile.decisionPatterns && !profile.decisions ? { decisions: legacyList(profile.decisionPatterns, "Decision pattern", "rationale") } : {}),
    ...(profile.standoutTraits && Array.isArray(profile.standoutTraits) && typeof profile.standoutTraits[0] === "string" ? { standoutTraits: legacyList(profile.standoutTraits, "Standout trait", "detail") } : {}),
    ...(typeof profile.growthEdge === "string" ? { growthEdge: { title: "Growth edge", observation: profile.growthEdge, nextStep: "Review the next evidence window.", sourceRefs: refs } } : {}),
  };
}

async function requestCompletion(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  responseFormat: unknown,
  isOllama: boolean,
  analysisTier: AnalysisTier,
  maxTokens?: number,
): Promise<Completion> {
  const openRouter = !isOllama && new URL(baseUrl).hostname.toLocaleLowerCase("en-US") === "openrouter.ai";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
        ...(openRouter ? { "HTTP-Referer": process.env.BUILDSTORY_PUBLIC_ORIGIN ?? "https://buildstory.dev", "X-OpenRouter-Title": "Buildstory" } : {}),
      },
      body: JSON.stringify({
        model,
        messages,
        response_format: isOllama ? { type: "json_object" } : responseFormat,
        ...(isOllama ? { think: false } : {}),
        ...(openRouter ? {
          provider: { zdr: true, data_collection: "deny", require_parameters: true, allow_fallbacks: true },
          ...(analysisTier === "deep" ? { reasoning: { effort: "high", exclude: true } } : {}),
        } : !isOllama ? { store: false } : {}),
        max_tokens: maxTokens ?? (isOllama ? 3_000 : analysisTier === "deep" ? 40_000 : 4_000),
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
      throw new NarrativeProviderError("llm_timeout", "Narrative provider timed out.", true);
    }
    throw new NarrativeProviderError("llm_unavailable", "Narrative provider was unreachable.", true);
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
    const code = response.status === 401 || response.status === 403
      ? "llm_auth_failed"
      : response.status === 404
        ? "llm_model_or_zdr_unavailable"
        : "llm_request_failed";
    throw new NarrativeProviderError(code, `Narrative provider returned HTTP ${response.status}.`, retryable, response.status);
  }
  const payload = await response.json() as {
    id?: string;
    model?: string;
    provider?: string;
    choices?: Array<{ message?: { content?: string } }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      cost?: number;
      completion_tokens_details?: { reasoning_tokens?: number };
      prompt_tokens_details?: { cached_tokens?: number };
    };
  };
  const content = payload.choices?.[0]?.message?.content;
  const responseUsage: NarrativeFailureUsage = {
    inputTokens: payload.usage?.prompt_tokens ?? 0,
    outputTokens: payload.usage?.completion_tokens ?? 0,
    reasoningTokens: payload.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
    cachedTokens: payload.usage?.prompt_tokens_details?.cached_tokens ?? 0,
    costMicroUsd: typeof payload.usage?.cost === "number" && Number.isFinite(payload.usage.cost) ? Math.max(0, Math.round(payload.usage.cost * 1_000_000)) : null,
    requestIds: payload.id ? [payload.id] : [],
  };
  // Both are one repair attempt away from succeeding rather than a
  // structural failure: an empty response or truncated/malformed JSON is
  // often a one-off from the provider, and a blind retry - or, for invalid
  // JSON, a repair turn that can see the malformed content - regularly
  // recovers. Marking these non-retryable meant the very first miss ended
  // the narrative job and scrubbed the reviewed evidence bundle.
  if (!content) throw new NarrativeProviderError("llm_empty_response", "Narrative provider returned no message content.", true, null, responseUsage);
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    throw new NarrativeProviderError("llm_invalid_json", "Narrative provider response was not valid JSON.", true, null, responseUsage, null, content);
  }
  return {
    value,
    ...responseUsage,
    model: payload.model || model,
    provider: openRouter ? "openrouter" : isOllama ? "ollama" : "openai",
  };
}

function unknownSourceRefs(value: unknown, allowed: Set<string>): string[] {
  const found: string[] = [];
  const visit = (candidate: unknown) => {
    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }
    if (!candidate || typeof candidate !== "object") return;
    for (const [key, child] of Object.entries(candidate)) {
      if (key === "sourceRefs" && Array.isArray(child)) {
        for (const ref of child) if (typeof ref === "string" && !allowed.has(ref)) found.push(ref);
      } else visit(child);
    }
  };
  visit(value);
  return [...new Set(found)].slice(0, 8);
}

function validationDiagnostic(
  component: StoryPackComponent | "combined" | "analysis-map" | "deep-report",
  errors: string[],
  unknownReferenceCount: number,
): NarrativeValidationDiagnostic {
  const stage: NarrativeValidationDiagnostic["stage"] = component === "analysis-map"
    ? "analysis"
    : component === "deep-narrative" || component === "deep-report"
      ? "synthesis"
      : "standard";
  const rule = (error: string): string => {
    if (/references unknown source/i.test(error)) return "unknown_source_ref";
    if (/duplicates source/i.test(error)) return "duplicate_source_ref";
    if (/source reference/i.test(error) && /at most/i.test(error)) return "source_ref_max_items";
    if (/source reference/i.test(error) && /at least/i.test(error)) return "source_ref_min_items";
    if (/at most \d+ characters/i.test(error)) return "max_length";
    if (/at least \d+ character/i.test(error)) return "min_length";
    if (/at most \d+ items/i.test(error)) return "max_items";
    if (/at least \d+ items/i.test(error)) return "min_items";
    if (/exactly one/i.test(error)) return "cardinality";
    if (/unsupported/i.test(error)) return "unsupported_value";
    if (/must be an (array|object)/i.test(error) || /must be a string/i.test(error)) return "type";
    return "schema";
  };
  const issues = errors.map((error) => `${diagnosticPath(error)}:${rule(error)}`);
  if (unknownReferenceCount > 0 && !issues.some((issue) => issue.endsWith(":unknown_source_ref"))) {
    issues.push("sourceRefs:unknown_source_ref");
  }
  return { stage, issues: [...new Set(issues)].slice(0, 8) };
}

function diagnosticPath(error: string): string {
  const candidate = error.split(/ must | is unsupported| references | duplicates /i, 1)[0]?.trim() || "response";
  return candidate.replace(/\[\d+\]/g, "[]").replace(/[^A-Za-z0-9_.\[\]-]/g, "").slice(0, 120) || "response";
}

async function requestWithRepair(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  responseFormat: unknown,
  isOllama: boolean,
  analysisTier: AnalysisTier,
  allowedRefs: Set<string>,
  component: StoryPackComponent | "combined" | "analysis-map" | "deep-report",
  maxTokens?: number,
): Promise<Completion & { warnings: string[] }> {
  let currentMessages = messages;
  let totals = emptyFailureUsage();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let result: Completion;
    try {
      result = await requestCompletion(baseUrl, apiKey, model, currentMessages, responseFormat, isOllama, analysisTier, maxTokens);
    } catch (error) {
      if (!(error instanceof NarrativeProviderError)) throw error;
      if (error.code !== "llm_invalid_json" && error.code !== "llm_empty_response") throw providerErrorWithUsage(error, totals);
      totals = addFailureUsage(totals, error.usage ?? emptyFailureUsage());
      if (attempt === 1) throw new NarrativeProviderError(error.code, error.message, error.retryable, error.status, totals);
      // Echo the malformed content back as an assistant turn so the repair
      // request can see and fix what it actually wrote, rather than
      // regenerating blind from the original prompt with no memory of the
      // failed attempt.
      const echo: ChatMessage[] = error.code === "llm_invalid_json" && error.rawContent
        ? [{ role: "assistant", content: truncateForEcho(error.rawContent) }]
        : [];
      currentMessages = [...messages, ...echo, { role: "user", content: "Validation feedback: return a single valid JSON object matching the supplied schema. Do not include prose or markdown." }];
      continue;
    }
    totals = addFailureUsage(totals, completionUsage(result));
    const invalid = unknownSourceRefs(result.value, allowedRefs);
    let validation: ReturnType<typeof validateStoryPackComponent>;
    if (component === "combined") {
      const storyValidation = validateStoryPackComponent(result.value, "story", allowedRefs);
      const insightValidation = validateStoryPackComponent(result.value, "insights", allowedRefs);
      validation = {
        ok: storyValidation.ok && insightValidation.ok,
        errors: [...storyValidation.errors, ...insightValidation.errors],
        warnings: [...storyValidation.warnings, ...insightValidation.warnings],
      };
    } else if (component === "analysis-map") {
      validation = validateDeepAnalysisComponent(result.value, allowedRefs);
    } else if (component === "deep-report") {
      const storyValidation = validateStoryPackComponent(result.value, "story", allowedRefs);
      const insightValidation = validateStoryPackComponent(result.value, "insights", allowedRefs);
      const deepValidation = validateStoryPackComponent(result.value, "deep", allowedRefs);
      validation = {
        ok: storyValidation.ok && insightValidation.ok && deepValidation.ok,
        errors: [...storyValidation.errors, ...insightValidation.errors, ...deepValidation.errors],
        warnings: [...storyValidation.warnings, ...insightValidation.warnings, ...deepValidation.warnings],
      };
    } else if (component === "deep-narrative") {
      validation = validateStoryPackComponent(result.value, "deep-narrative", allowedRefs);
    } else {
      validation = validateStoryPackComponent(result.value, component, allowedRefs);
    }
    if (!invalid.length && validation.ok) return { ...result, ...totals, warnings: validation.warnings };
    if (attempt === 1) {
      throw new NarrativeProviderError(
        "llm_invalid_schema",
        "Narrative provider returned an invalid schema after repair.",
        // A schema miss is a one-off in practice (see the audit that led to
        // this fix: the model was never told the cardinality/length rules it
        // was being graded on). Marking it non-retryable meant the very
        // first miss was terminal, scrubbing the reviewed evidence bundle
        // and forcing a full re-scan for what is usually a recoverable
        // generation. The queue's own attempt cap still bounds total cost.
        true,
        null,
        totals,
        validationDiagnostic(component, validation.errors, invalid.length),
      );
    }
    const feedback = [
      invalid.length ? `unknown sourceRefs: ${invalid.join(", ")}` : "",
      validation.errors.length ? `schema issues: ${validation.errors.slice(0, 8).join("; ")}` : "",
    ].filter(Boolean).join(". ");
    // Echo the model's own failed output back as an assistant turn instead
    // of discarding it. Without this the "repair" was a blind regeneration
    // from identical priors - the model could not see what it had actually
    // produced, only a prose description of what was wrong with it.
    currentMessages = [
      ...messages,
      { role: "assistant", content: truncateForEcho(JSON.stringify(result.value)) },
      { role: "user", content: `Validation feedback: ${feedback}. Return one JSON object matching the supplied schema and use only the provided source references.` },
    ];
  }
  throw new NarrativeProviderError("llm_invalid_response", "Narrative provider returned an unusable response after repair.");
}

// If any of these core, non-repeatable fields fell back to metric-derived
// boilerplate, the Deep report has no usable model-written content for the
// section that defines it - shipping it as `status: 'ready'` would bill the
// creator for two high-effort passes and deliver a report indistinguishable
// from a failure. Cardinality lists (moments, decisions, ...) already have a
// validated minimum count, so they're not included here; a single fallback
// entry among several real ones isn't the same failure mode.
const CORE_DEEP_FALLBACK_PATHS = ["hero.headline", "hero.summary", "turningPoint.quote", "growthEdge.title", "growthEdge.observation", "growthEdge.nextStep"];

export async function generateNarrative(
  snapshot: ScannerProjectSnapshot,
  requestedModel?: string | null,
  options: { analysisTier?: AnalysisTier; previousChapter?: unknown } = {},
): Promise<NarrativeGenerationResult> {
  const generationStartedAt = Date.now();
  const configuredProvider = process.env.BUILDSTORY_CLOUD_PROVIDER
    ?? (process.env.BUILDSTORY_OPENROUTER_API_KEY ? "openrouter" : process.env.BUILDSTORY_LLM_API_KEY ? "openai" : "openrouter");
  const configuredBaseUrl = configuredProvider === "openai"
    ? "https://api.openai.com/v1"
    : "https://openrouter.ai/api/v1";
  const baseUrl = (process.env.BUILDSTORY_LLM_BASE_URL ?? configuredBaseUrl).replace(/\/$/, "");
  let parsedBaseUrl: URL;
  try {
    parsedBaseUrl = new URL(baseUrl);
  } catch {
    throw new NarrativeProviderError("llm_invalid_base_url", "BUILDSTORY_LLM_BASE_URL must be a valid HTTPS URL (or a local loopback HTTP URL during development).");
  }
  const hostname = parsedBaseUrl.hostname.replace(/^\[|\]$/g, "").toLocaleLowerCase("en-US");
  const octets = hostname.split(".");
  const loopback = hostname === "localhost" || hostname === "::1" || (octets.length === 4 && octets[0] === "127" && octets.every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) <= 255));
  const allowedProtocol = parsedBaseUrl.protocol === "https:" || (parsedBaseUrl.protocol === "http:" && loopback);
  if (!allowedProtocol || parsedBaseUrl.username || parsedBaseUrl.password || parsedBaseUrl.search || parsedBaseUrl.hash) {
    throw new NarrativeProviderError("llm_invalid_base_url", "BUILDSTORY_LLM_BASE_URL must be a credential-free HTTPS URL, or a credential-free HTTP URL on localhost during development.");
  }
  const isOllama = isOllamaBaseUrl(baseUrl);
  const openRouter = !isOllama && hostname === "openrouter.ai";
  const hostedOpenAi = !isOllama && hostname === "api.openai.com";
  if (!isOllama && !openRouter && !hostedOpenAi) {
    throw new NarrativeProviderError("llm_provider_disabled", "Hosted inference must use an approved provider.");
  }
  if (hostedOpenAi && process.env.BUILDSTORY_ENABLE_HOSTED_OPENAI === "false") {
    throw new NarrativeProviderError("llm_provider_disabled", "Hosted OpenAI is disabled.");
  }
  const apiKey = openRouter
    ? process.env.BUILDSTORY_OPENROUTER_API_KEY
    : process.env.BUILDSTORY_LLM_API_KEY ?? (isOllama ? "ollama-local" : undefined);
  if (!apiKey) throw new NarrativeProviderError("llm_not_configured", openRouter ? "BUILDSTORY_OPENROUTER_API_KEY is not set." : "Narrative provider key is not set.");
  // requestedModel is honored only against a loopback Ollama endpoint - the
  // dev-only trick of pointing BUILDSTORY_LLM_BASE_URL at local Ollama to
  // exercise this code path without a real cloud key. Against a real
  // provider there is no user-facing model choice on Buildstory Cloud: the
  // upload-sessions route already never stores a model for a cloud session,
  // but this is the defense-in-depth backstop against any other caller.
  let model = isOllama
    ? requestedModel?.trim() || process.env.BUILDSTORY_LLM_MODEL || "auto"
    : openRouter
      ? "deepseek/deepseek-v4-flash"
      : process.env.BUILDSTORY_LLM_MODEL || "gpt-5.6-luna";
  if (isOllama && isOllamaAutoModel(model)) {
    try {
      model = await resolveOllamaModel();
    } catch (error) {
      throw new NarrativeProviderError("ollama_model_unavailable", error instanceof Error ? error.message : "No usable local Ollama model is available.");
    }
  }

  const provider = isOllama ? "ollama" : openRouter ? "openrouter" : "openai";
  const analysisTier: AnalysisTier = isOllama ? "standard" : options.analysisTier ?? "standard";
  let inputTokens = 0;
  let outputTokens = 0;
  let reasoningTokens = 0;
  let cachedTokens = 0;
  let actualCostMicroUsd: number | null = null;
  const requestIds: string[] = [];

  const allowedRefs = new Set(defaultStoryPack(snapshot).sources.map((source) => source.ref));
  const addUsage = (result: Completion) => {
    inputTokens += result.inputTokens;
    outputTokens += result.outputTokens;
    reasoningTokens += result.reasoningTokens;
    cachedTokens += result.cachedTokens;
    if (result.costMicroUsd !== null) actualCostMicroUsd = (actualCostMicroUsd ?? 0) + result.costMicroUsd;
    requestIds.push(...result.requestIds);
    model = result.model || model;
  };
  let storyValue: unknown;
  let normalized: ReturnType<typeof normalizeStoryPack> | ReturnType<typeof normalizeDeepStoryPack>;
  const requestWarnings: string[] = [];
  try {
    if (analysisTier === "deep") {
      const analysis = await requestWithRepair(
        baseUrl, apiKey, model, buildDeepAnalysisMessages(snapshot, options.previousChapter),
        NARRATIVE_DEEP_ANALYSIS_RESPONSE_FORMAT, isOllama, analysisTier, allowedRefs, "analysis-map", 24_000,
      );
      addUsage(analysis);
      requestWarnings.push(...analysis.warnings);
      const synthesis = await requestWithRepair(
        baseUrl, apiKey, model, buildDeepSynthesisMessages(snapshot, analysis.value),
        NARRATIVE_DEEP_SYNTHESIS_RESPONSE_FORMAT, isOllama, analysisTier, allowedRefs, "deep-narrative", 40_000,
      );
      addUsage(synthesis);
      requestWarnings.push(...synthesis.warnings);
      const synthesisObject = synthesis.value && typeof synthesis.value === "object" && !Array.isArray(synthesis.value)
        ? synthesis.value as Record<string, unknown>
        : {};
      const composedValue = { ...synthesisObject, deepAnalysis: analysis.value };
      const composedValidation = validateStoryPackComponent(composedValue, "deep", allowedRefs);
      if (!composedValidation.ok) {
        // Both model outputs were validated independently. Reaching this path
        // means Buildstory's composition contract drifted; another provider
        // call cannot repair an internal invariant.
        throw new NarrativeProviderError(
          "llm_invalid_composition",
          "Validated Deep components could not be composed into StoryPackV3.",
          false,
          null,
          null,
          { stage: "composition", issues: validationDiagnostic("deep-report", composedValidation.errors, 0).issues },
        );
      }
      // Symmetric with the Standard branch below: normalize field-name
      // variations (e.g. a flat `turningPoint` string) the same way even
      // though the strict Deep validator above already requires the
      // structured shape to have passed. Validation still runs on the raw
      // composed value, not this compatibility-mapped one.
      const compatibleComposedValue = legacyCompatiblePayload(composedValue, composedValue, snapshot);
      storyValue = composedValue;
      normalized = normalizeDeepStoryPack(compatibleComposedValue, snapshot);
      const coreFallback = normalized.fallbacksUsed.find((path) => CORE_DEEP_FALLBACK_PATHS.includes(path));
      if (coreFallback) {
        // Both passes validated as schema-legal, but normalization still had
        // to fall back to metric-derived boilerplate for a field that
        // defines the report (hero, turning point, or growth edge) - most
        // often because the response was legacy-shaped and slipped past the
        // (now-disabled-for-Deep) bypass at a layer that still allows it, or
        // every source reference resolved to nothing usable. Shipping this
        // as `status: 'ready'` would bill for two Deep passes and deliver
        // what is functionally a failure.
        throw new NarrativeProviderError(
          "llm_insufficient_output",
          "Deep narrative generation produced no usable model-written content for a core report section.",
          false,
          null,
          null,
          { stage: "synthesis", issues: [`${coreFallback}:insufficient_output`] },
        );
      }
    } else {
      const result = await requestWithRepair(
        baseUrl, apiKey, model, buildCombinedMessages(snapshot), NARRATIVE_COMBINED_RESPONSE_FORMAT,
        isOllama, analysisTier, allowedRefs, "combined", isOllama ? 3_000 : 4_000,
      );
      addUsage(result);
      requestWarnings.push(...result.warnings);
      storyValue = result.value;
      normalized = normalizeStoryPack(legacyCompatiblePayload(result.value, result.value, snapshot), snapshot);
    }
  } catch (error) {
    if (error instanceof NarrativeProviderError) {
      throw providerErrorWithUsage(error, {
        inputTokens,
        outputTokens,
        reasoningTokens,
        cachedTokens,
        costMicroUsd: actualCostMicroUsd,
        requestIds,
      });
    }
    throw error;
  }
  const profileObject = storyValue && typeof storyValue === "object" && !Array.isArray(storyValue) ? storyValue as Record<string, unknown> : {};
  const sections = sectionsFromStoryPack(normalized.storyPack);
  if (Array.isArray(profileObject.decisionPatterns)) {
    sections.decisionPatterns = profileObject.decisionPatterns
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .slice(0, 5)
      .map((value) => sanitizePublicText(value, 300).value)
      .filter(Boolean);
  }
  if (Array.isArray(profileObject.standoutTraits)) {
    sections.standoutTraits = profileObject.standoutTraits
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .slice(0, 5)
      .map((value) => sanitizePublicText(value, 300).value)
      .filter(Boolean);
  }

  return {
    sections,
    storyPack: normalized.storyPack,
    provider,
    model,
    inputTokens,
    outputTokens,
    reasoningTokens,
    cachedTokens,
    actualCostMicroUsd,
    requestIds: [...new Set(requestIds)],
    // Merge in recoverable over-length warnings (now non-fatal - see
    // validateStoryPackComponent) so observability's fallback count still
    // reflects that the string was truncated, without spending a repair
    // call or failing the generation over something normalization already
    // fixed losslessly.
    fallbacksUsed: [...new Set([...normalized.fallbacksUsed, ...requestWarnings.map(diagnosticPath)])].sort(),
    invalidReferenceCount: unknownSourceRefs(storyValue, allowedRefs).length,
    generationLatencyMs: Date.now() - generationStartedAt,
  };
}
