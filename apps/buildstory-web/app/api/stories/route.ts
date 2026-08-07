import { socialErrorResponse } from "@/lib/api/responses";
import { explorePublishedStories } from "@/lib/ingestion/store";
import { checkRateLimit } from "@/lib/social/rate-limit-dispatch";

export async function GET(request: Request) {
  try {
    await checkRateLimit("search", "anonymous", 60, 60, request);
    const params = new URL(request.url).searchParams;
    const requestedLimit = Number(params.get("limit") ?? 30);
    const limit = Number.isFinite(requestedLimit) ? requestedLimit : 30;
    const cursor = params.get("cursor") || undefined;
    const result = await explorePublishedStories({
      query: params.get("q") ?? undefined,
      category: params.get("category") ?? undefined,
      tools: params.getAll("tool").slice(0, 12),
      models: params.getAll("model").slice(0, 12),
      hasDemo: params.get("hasDemo") === "true",
      sort: params.get("sort") === "trending" ? "trending" : "newest",
      limit,
      cursor,
    });
    return Response.json(
      result,
      { headers: { "cache-control": "public, max-age=30, stale-while-revalidate=60" } },
    );
  } catch (error) {
    return socialErrorResponse(error);
  }
}
