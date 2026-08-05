import { jsonError, socialErrorResponse } from "@/lib/api/responses";
import { isLeaderboardPeriod } from "@/lib/leaderboard/contracts";
import { getLeaderboard } from "@/lib/leaderboard/store";

export async function GET(request: Request) {
  try {
    const periodParam = new URL(request.url).searchParams.get("period") ?? "all-time";
    if (!isLeaderboardPeriod(periodParam)) {
      return jsonError("invalid_period", "Unknown leaderboard period.", 422);
    }
    const entries = await getLeaderboard(periodParam);
    return Response.json(
      { period: periodParam, entries },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return socialErrorResponse(error);
  }
}
