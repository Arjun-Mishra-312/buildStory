import { jsonError, requireApiCreator, socialErrorResponse } from "@/lib/api/responses";
import { ensureUser } from "@/lib/ingestion/store";
import { getActivityFeed } from "@/lib/social/store";

export async function GET(request: Request) {
  const creator = await requireApiCreator();
  if (!creator) return jsonError("unauthorized", "Sign-in required.", 401);
  try {
    const user = await ensureUser(creator);
    const params = new URL(request.url).searchParams;
    const requestedLimit = Number(params.get("limit") ?? 30);
    const limit = Number.isFinite(requestedLimit) ? requestedLimit : 30;
    const boundedLimit = Math.min(Math.max(1, Math.trunc(limit)), 100);
    const cursor = params.get("cursor") || undefined;
    const feed = await getActivityFeed(user.id, limit, cursor);
    return Response.json({ feed, nextCursor: feed.length === boundedLimit ? (feed.at(-1)?.publishedAt ?? null) : null }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return socialErrorResponse(error);
  }
}
