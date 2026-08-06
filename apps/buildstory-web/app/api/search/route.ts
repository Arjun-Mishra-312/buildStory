import { jsonError, socialErrorResponse } from "@/lib/api/responses";
import { searchPublishedStories } from "@/lib/ingestion/store";
import { checkRateLimit } from "@/lib/social/rate-limit-dispatch";

export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams.get("q") ?? "";
    if (query.trim().length < 2) {
      return jsonError("query_too_short", "Pass at least two characters in ?q=.", 422);
    }
    await checkRateLimit("search", "anonymous", 60, 60, request);
    const params = new URL(request.url).searchParams;
    const requestedLimit = Number(params.get("limit") ?? 20);
    const limit = Number.isFinite(requestedLimit) ? requestedLimit : 20;
    const boundedLimit = Math.min(Math.max(1, Math.trunc(limit)), 50);
    const cursor = params.get("cursor") || undefined;
    const results = await searchPublishedStories(query, limit, cursor);
    return Response.json(
      { query, results, nextCursor: results.length === boundedLimit ? (results.at(-1)?.publishedAt ?? null) : null },
      { headers: { "cache-control": "public, max-age=30, stale-while-revalidate=60" } },
    );
  } catch (error) {
    return socialErrorResponse(error);
  }
}
