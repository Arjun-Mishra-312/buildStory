import { jsonError, socialErrorResponse } from "@/lib/api/responses";
import { isLeaderboardPeriod } from "@/lib/leaderboard/contracts";
import { getLeaderboard } from "@/lib/leaderboard/store";
import { checkRateLimit } from "@/lib/social/rate-limit-dispatch";

export async function GET(request: Request) {
  try {
    const periodParam = new URL(request.url).searchParams.get("period") ?? "all-time";
    if (!isLeaderboardPeriod(periodParam)) {
      return jsonError("invalid_period", "Unknown leaderboard period.", 422);
    }
    await checkRateLimit("leaderboard", "anonymous", 30, 60, request);
    const requestedLimit = Number(new URL(request.url).searchParams.get("limit") ?? 50);
    const entries = await getLeaderboard(periodParam, Number.isFinite(requestedLimit) ? requestedLimit : 50);
    return Response.json(
      { period: periodParam, entries },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return socialErrorResponse(error);
  }
}
