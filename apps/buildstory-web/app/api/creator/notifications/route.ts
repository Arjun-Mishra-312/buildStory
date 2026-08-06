import { jsonError, requireApiCreator, socialErrorResponse } from "@/lib/api/responses";
import { ensureUser } from "@/lib/ingestion/store";
import { getUnreadNotificationCount, listNotifications } from "@/lib/social/store";

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
    const [notifications, unreadCount] = await Promise.all([
      listNotifications(user.id, limit, cursor),
      getUnreadNotificationCount(user.id),
    ]);
    return Response.json(
      { notifications, unreadCount, nextCursor: notifications.length === boundedLimit ? (notifications.at(-1)?.createdAt ?? null) : null },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return socialErrorResponse(error);
  }
}
