import { jsonError, requireApiCreator, socialErrorResponse } from "@/lib/api/responses";
import { ensureUser } from "@/lib/ingestion/store";
import { getUnreadNotificationCount, listNotifications } from "@/lib/social/store";

export async function GET() {
  const creator = await requireApiCreator();
  if (!creator) return jsonError("unauthorized", "Sign-in required.", 401);
  try {
    const user = await ensureUser(creator);
    const [notifications, unreadCount] = await Promise.all([
      listNotifications(user.id),
      getUnreadNotificationCount(user.id),
    ]);
    return Response.json(
      { notifications, unreadCount },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return socialErrorResponse(error);
  }
}
