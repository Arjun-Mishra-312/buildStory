/**
 * Hardcoded pricing for the current default narrative model, not a
 * versioned price table. Good enough for a first cost/spend-cap check;
 * revisit as a real buildstory_model_prices table (snapshotted per report,
 * so historical cost figures don't silently re-price) once more than one
 * model is actually in rotation.
 */

export type SupportedNarrativeModel = "gpt-5.6-luna" | "gpt-5.6-terra";

const PRICING_MICRO_USD_PER_TOKEN: Record<SupportedNarrativeModel, { input: number; output: number }> = {
  // $0.20 / $1.20 per million tokens -> micro-USD per token.
  "gpt-5.6-luna": { input: 0.2, output: 1.2 },
  // $2 / $12 per million tokens - available as an explicit escalation, never a default.
  "gpt-5.6-terra": { input: 2, output: 12 },
};

export function isSupportedNarrativeModel(model: string): model is SupportedNarrativeModel {
  return model in PRICING_MICRO_USD_PER_TOKEN;
}

/** Returns whole micro-USD (1 USD = 1,000,000 micro-USD), rounded up so a fractional cost never reads as free. */
export function estimateCostMicroUsd(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = isSupportedNarrativeModel(model) ? PRICING_MICRO_USD_PER_TOKEN[model] : PRICING_MICRO_USD_PER_TOKEN["gpt-5.6-luna"];
  return Math.ceil(inputTokens * pricing.input + outputTokens * pricing.output);
}
