import { jsonError, socialErrorResponse } from "@/lib/api/responses";
import { isLeaderboardPeriod, LEADERBOARD_PERIODS } from "@/lib/leaderboard/contracts";
import { recomputeLeaderboard } from "@/lib/leaderboard/store";

/** Constant-time comparison so a mismatched secret can't be brute-forced via response-time differences. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return mismatch === 0;
}

/**
 * External-scheduler fallback (e.g. a GitHub Actions cron job hitting this
 * with a bearer secret) until a real Cloudflare Cron Trigger is deployed,
 * which would call recomputeLeaderboard directly from a scheduled handler
 * instead of over HTTP.
 */
export async function POST(request: Request) {
  const configuredSecret = process.env.BUILDSTORY_CRON_SECRET;
  if (!configuredSecret) {
    return jsonError("cron_recompute_unavailable", "This deployment has not configured BUILDSTORY_CRON_SECRET.", 503);
  }
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match || !timingSafeEqual(match[1]!, configuredSecret)) {
    return jsonError("unauthorized", "A valid bearer secret is required.", 401);
  }
  try {
    const body = (await request.json().catch(() => ({}))) as { period?: unknown };
    const period = isLeaderboardPeriod(body.period) ? body.period : "all-time";
    await recomputeLeaderboard(period);
    return Response.json(
      { recomputed: period, availablePeriods: LEADERBOARD_PERIODS },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return socialErrorResponse(error);
  }
}
