function shouldUseDurableStore() {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.BUILDSTORY_STORE === "d1"
  );
}

/** Checks and increments a fixed-window rate-limit counter; throws SocialError("rate_limited") over the limit. */
export async function checkRateLimit(
  scope: string,
  identity: string,
  limit: number,
  windowSeconds: number,
  request?: Request,
): Promise<void> {
  const ip = request?.headers.get("cf-connecting-ip")?.trim() || request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const scopedIdentity = ip ? `${identity}:ip:${ip}` : identity;
  if (shouldUseDurableStore()) {
    const { checkRateLimit: check } = await import("./rate-limit");
    return check(scope, scopedIdentity, limit, windowSeconds);
  }
  const { checkRateLimit: check } = await import("./rate-limit-mock");
  return check(scope, scopedIdentity, limit, windowSeconds);
}
