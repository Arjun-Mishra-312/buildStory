export type SupportedNarrativeModel = "deepseek/deepseek-v4-flash" | "gpt-5.6-luna";

// Conservative reservation rates. OpenRouter's returned usage.cost is the
// authoritative amount reconciled after a request completes.
const PRICING_MICRO_USD_PER_TOKEN: Record<SupportedNarrativeModel, { input: number; output: number }> = {
  "deepseek/deepseek-v4-flash": { input: 0.14, output: 0.28 },
  "gpt-5.6-luna": { input: 0.2, output: 1.2 },
};

export class UnsupportedNarrativeModelError extends Error {
  readonly code = "llm_unknown_model_price";
}

export function isSupportedNarrativeModel(model: string): model is SupportedNarrativeModel {
  return Object.hasOwn(PRICING_MICRO_USD_PER_TOKEN, model);
}

/** Returns whole micro-USD and never silently substitutes another model's rate. */
export function estimateCostMicroUsd(model: string, inputTokens: number, outputTokens: number): number {
  if (!isSupportedNarrativeModel(model)) {
    throw new UnsupportedNarrativeModelError(`No configured narrative price for model ${model}.`);
  }
  const pricing = PRICING_MICRO_USD_PER_TOKEN[model];
  return Math.ceil(Math.max(0, inputTokens) * pricing.input + Math.max(0, outputTokens) * pricing.output);
}
