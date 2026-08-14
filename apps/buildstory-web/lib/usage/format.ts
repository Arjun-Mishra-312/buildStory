const compactNumber = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const usdWhole = new Intl.NumberFormat("en", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usdCents = new Intl.NumberFormat("en", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Estimated API-equivalent spend. Null means nothing in the window was priced. */
export function formatUsageSpend(microUsd: number | null): string {
  if (microUsd == null) return "—";
  const dollars = microUsd / 1_000_000;
  if (Math.abs(dollars) < 1 && dollars !== 0) return usdCents.format(dollars);
  return usdWhole.format(Math.round(dollars));
}

export function formatUsageTokens(tokens: number): string {
  if (!Number.isFinite(tokens) || tokens === 0) return "0";
  if (Math.abs(tokens) < 10_000) return String(Math.trunc(tokens));
  return compactNumber.format(tokens);
}

export function formatUsageCount(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return compactNumber.format(value);
}
