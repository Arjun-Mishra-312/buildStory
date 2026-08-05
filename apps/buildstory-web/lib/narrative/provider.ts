import { NARRATIVE_RESPONSE_FORMAT, buildNarrativeMessages } from "./prompt";
import { validateNarrativeSections, type NarrativeSections } from "./schema";
import type { ScannerProjectSnapshot } from "../ingestion/scanner-project-snapshot";

export class NarrativeProviderError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export type NarrativeGenerationResult = {
  sections: NarrativeSections;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
};

export function narrativeProviderConfigured(): boolean {
  return Boolean(process.env.BUILDSTORY_LLM_API_KEY);
}

/**
 * Calls a single OpenAI-compatible chat-completions endpoint (works
 * unmodified against OpenAI directly, or any provider - OpenRouter, a
 * self-hosted gateway - that speaks the same wire format; only the base
 * URL and API key change). Not provider-specific by design: switching
 * providers later is a config change, not a code change.
 */
export async function generateNarrative(snapshot: ScannerProjectSnapshot): Promise<NarrativeGenerationResult> {
  const apiKey = process.env.BUILDSTORY_LLM_API_KEY;
  if (!apiKey) {
    throw new NarrativeProviderError("llm_not_configured", "BUILDSTORY_LLM_API_KEY is not set.");
  }
  const baseUrl = (process.env.BUILDSTORY_LLM_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.BUILDSTORY_LLM_MODEL ?? "gpt-5.6-luna";

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: buildNarrativeMessages(snapshot),
      response_format: NARRATIVE_RESPONSE_FORMAT,
      max_tokens: 1_500,
    }),
  });

  if (!response.ok) {
    const bodyText = await response.text().catch(() => "");
    throw new NarrativeProviderError(
      "llm_request_failed",
      `Narrative provider returned ${response.status}: ${bodyText.slice(0, 500)}`,
    );
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new NarrativeProviderError("llm_empty_response", "Narrative provider returned no message content.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new NarrativeProviderError("llm_invalid_json", "Narrative provider response was not valid JSON.");
  }

  const validated = validateNarrativeSections(parsed);
  if (!validated.ok) {
    throw new NarrativeProviderError(
      "llm_invalid_schema",
      `Narrative provider response did not match the expected schema: ${validated.errors.join("; ")}`,
    );
  }

  return {
    sections: validated.sections,
    provider: baseUrl.includes("openai.com") ? "openai" : "openai-compatible",
    model,
    inputTokens: payload.usage?.prompt_tokens ?? 0,
    outputTokens: payload.usage?.completion_tokens ?? 0,
  };
}
