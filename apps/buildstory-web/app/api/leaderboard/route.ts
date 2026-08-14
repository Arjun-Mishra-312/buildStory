import { jsonError, socialErrorResponse } from "@/lib/api/responses";
import {
  DEFAULT_LEADERBOARD_METRIC,
  DEFAULT_LEADERBOARD_PERIOD,
  isLeaderboardMetric,
  isLeaderboardPeriod,
} from "@/lib/leaderboard/contracts";
import { getLeaderboard } from "@/lib/leaderboard/store";
import { checkRateLimit } from "@/lib/social/rate-limit-dispatch";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const periodParam = params.get("period") ?? DEFAULT_LEADERBOARD_PERIOD;
    const metricParam = params.get("metric") ?? DEFAULT_LEADERBOARD_METRIC;
    if (!isLeaderboardPeriod(periodParam)) {
      return jsonError("invalid_period", "Unknown leaderboard period.", 422);
    }
    if (!isLeaderboardMetric(metricParam)) {
      return jsonError("invalid_metric", "Unknown leaderboard metric.", 422);
    }
    await checkRateLimit("leaderboard", "anonymous", 30, 60, request);
    const requestedLimit = Number(params.get("limit") ?? 50);
    const entries = await getLeaderboard(periodParam, Number.isFinite(requestedLimit) ? requestedLimit : 50, metricParam);
    return Response.json(
      { period: periodParam, metric: metricParam, entries },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return socialErrorResponse(error);
  }
}
