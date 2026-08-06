import {
  NARRATIVE_PROFILE_RESPONSE_FORMAT,
  NARRATIVE_RESPONSE_FORMAT,
  buildNarrativeMessages,
  buildProfileMessages,
} from "./prompt";
import type { NarrativeProfileSections, NarrativeSections } from "./schema";
import { isOllamaAutoModel, isOllamaBaseUrl, resolveOllamaModel } from "./ollama";
import type { ScannerProjectSnapshot } from "../ingestion/scanner-project-snapshot";
import { defaultStoryPack, normalizeStoryPack, sectionsFromStoryPack, validateStoryPackComponent, type StoryPackComponent } from "./story-pack";
import type { ReportStoryPackV2 } from "../ingestion/scanner-project-snapshot";
import { sanitizePublicText } from "../publication/sanitization";

export class NarrativeProviderError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

export type NarrativeGenerationResult = {
  sections: NarrativeSections & NarrativeProfileSections;
  storyPack: ReportStoryPackV2;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
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
  return Boolean(process.env.BUILDSTORY_LLM_API_KEY || (baseUrl && isOllamaBaseUrl(baseUrl)));
}

type Completion = { value: unknown; inputTokens: number; outputTokens: number };

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
  messages: Array<{ role: "system" | "user"; content: string }>,
  responseFormat: unknown,
  isOllama: boolean,
): Promise<Completion> {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages,
      response_format: isOllama ? { type: "json_object" } : responseFormat,
      ...(isOllama ? { think: false } : {}),
      max_tokens: isOllama ? 2_000 : 1_500,
    }),
  });
  if (!response.ok) {
    const bodyText = await response.text().catch(() => "");
    throw new NarrativeProviderError("llm_request_failed", `Narrative provider returned ${response.status}: ${bodyText.slice(0, 500)}`);
  }
  const payload = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new NarrativeProviderError("llm_empty_response", "Narrative provider returned no message content.");
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    throw new NarrativeProviderError("llm_invalid_json", "Narrative provider response was not valid JSON.");
  }
  return {
    value,
    inputTokens: payload.usage?.prompt_tokens ?? 0,
    outputTokens: payload.usage?.completion_tokens ?? 0,
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

async function requestWithRepair(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: Array<{ role: "system" | "user"; content: string }>,
  responseFormat: unknown,
  isOllama: boolean,
  allowedRefs: Set<string>,
  component: StoryPackComponent,
): Promise<Completion> {
  let currentMessages = messages;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await requestCompletion(baseUrl, apiKey, model, currentMessages, responseFormat, isOllama);
      const invalid = unknownSourceRefs(result.value, allowedRefs);
      const validation = validateStoryPackComponent(result.value, component, allowedRefs);
      if (!invalid.length && validation.ok) return result;
      if (attempt === 1) return result;
      const feedback = [
        invalid.length ? `unknown sourceRefs: ${invalid.join(", ")}` : "",
        validation.errors.length ? `schema issues: ${validation.errors.slice(0, 8).join("; ")}` : "",
      ].filter(Boolean).join(". ");
      currentMessages = [...messages, { role: "user", content: `Validation feedback: ${feedback}. Return one JSON object matching the supplied schema and use only the provided source references.` }];
    } catch (error) {
      if (attempt === 1) throw error;
      currentMessages = [...messages, { role: "user", content: "Validation feedback: return a single valid JSON object matching the supplied schema. Do not include prose or markdown." }];
    }
  }
  throw new NarrativeProviderError("llm_invalid_response", "Narrative provider returned an unusable response after repair.");
}

export async function generateNarrative(snapshot: ScannerProjectSnapshot, requestedModel?: string | null): Promise<NarrativeGenerationResult> {
  const generationStartedAt = Date.now();
  const baseUrl = (process.env.BUILDSTORY_LLM_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
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
  const apiKey = process.env.BUILDSTORY_LLM_API_KEY ?? (isOllama ? "ollama-local" : undefined);
  if (!apiKey) throw new NarrativeProviderError("llm_not_configured", "BUILDSTORY_LLM_API_KEY is not set.");
  let model = requestedModel?.trim() || process.env.BUILDSTORY_LLM_MODEL || "gpt-5.6-luna";
  if (isOllama && isOllamaAutoModel(model)) {
    try {
      model = await resolveOllamaModel();
    } catch (error) {
      throw new NarrativeProviderError("ollama_model_unavailable", error instanceof Error ? error.message : "No usable local Ollama model is available.");
    }
  }

  const provider = isOllama ? "ollama" : baseUrl.includes("openai.com") ? "openai" : "openai-compatible";
  let inputTokens = 0;
  let outputTokens = 0;
  const fallbacksUsed: string[] = [];

  const allowedRefs = new Set(defaultStoryPack(snapshot).sources.map((source) => source.ref));
  let storyValue: unknown;
  try {
    const result = await requestWithRepair(baseUrl, apiKey, model, buildNarrativeMessages(snapshot), NARRATIVE_RESPONSE_FORMAT, isOllama, allowedRefs, "story");
    inputTokens += result.inputTokens;
    outputTokens += result.outputTokens;
    storyValue = result.value;
  } catch {
    storyValue = {};
    fallbacksUsed.push("story");
  }

  let profileValue: unknown;
  try {
    const result = await requestWithRepair(baseUrl, apiKey, model, buildProfileMessages(snapshot), NARRATIVE_PROFILE_RESPONSE_FORMAT, isOllama, allowedRefs, "insights");
    inputTokens += result.inputTokens;
    outputTokens += result.outputTokens;
    profileValue = result.value;
  } catch {
    profileValue = {};
    fallbacksUsed.push("insights");
  }

  const normalized = normalizeStoryPack(legacyCompatiblePayload(storyValue, profileValue, snapshot), snapshot);
  const profileObject = profileValue && typeof profileValue === "object" && !Array.isArray(profileValue) ? profileValue as Record<string, unknown> : {};
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
    fallbacksUsed: [...new Set([...fallbacksUsed, ...normalized.fallbacksUsed])].sort(),
    invalidReferenceCount: unknownSourceRefs(storyValue, allowedRefs).length + unknownSourceRefs(profileValue, allowedRefs).length,
    generationLatencyMs: Date.now() - generationStartedAt,
  };
}
