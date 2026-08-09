/**
 * Hardcoded pricing for the one supported cloud narrative model. gpt-5.6-luna
 * is deliberately the only model Buildstory Cloud will ever call - there is
 * no user-facing model choice on this path, so there is nothing to gate by
 * plan here. (BYOK is unrestricted by design: the creator's own model choice
 * costs the operator nothing.) Revisit as a real buildstory_model_prices
 * table (snapshotted per report, so historical cost figures don't silently
 * re-price) if a second model is ever actually put in rotation.
 */

export type SupportedNarrativeModel = "gpt-5.6-luna";

const PRICING_MICRO_USD_PER_TOKEN: Record<SupportedNarrativeModel, { input: number; output: number }> = {
  // $0.20 / $1.20 per million tokens -> micro-USD per token.
  "gpt-5.6-luna": { input: 0.2, output: 1.2 },
};

export function isSupportedNarrativeModel(model: string): model is SupportedNarrativeModel {
  return model in PRICING_MICRO_USD_PER_TOKEN;
}

/** Returns whole micro-USD (1 USD = 1,000,000 micro-USD), rounded up so a fractional cost never reads as free. */
export function estimateCostMicroUsd(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = isSupportedNarrativeModel(model) ? PRICING_MICRO_USD_PER_TOKEN[model] : PRICING_MICRO_USD_PER_TOKEN["gpt-5.6-luna"];
  return Math.ceil(inputTokens * pricing.input + outputTokens * pricing.output);
}
