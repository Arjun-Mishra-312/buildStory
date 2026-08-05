import { SocialError } from "./contracts";

type StoreGlobal = typeof globalThis & {
  __buildstoryMockRateLimits?: Map<string, number>;
};

const storeGlobal = globalThis as StoreGlobal;
const buckets = storeGlobal.__buildstoryMockRateLimits ?? (storeGlobal.__buildstoryMockRateLimits = new Map());

function windowStartMs(windowSeconds: number, now: Date): number {
  const windowMs = windowSeconds * 1_000;
  return Math.floor(now.getTime() / windowMs) * windowMs;
}

export function checkRateLimit(
  scope: string,
  identity: string,
  limit: number,
  windowSeconds: number,
  now = new Date(),
): void {
  const id = `${scope}:${identity}:${windowStartMs(windowSeconds, now)}`;
  const count = (buckets.get(id) ?? 0) + 1;
  buckets.set(id, count);
  if (count > limit) {
    throw new SocialError(
      "rate_limited",
      "Too many requests. Wait a moment before trying again.",
      429,
    );
  }
}
