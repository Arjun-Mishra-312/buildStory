import { jsonError, requireApiCreator, socialErrorResponse } from "@/lib/api/responses";
import { ensureUser } from "@/lib/ingestion/store";
import { getActivityFeed } from "@/lib/social/store";

export async function GET() {
  const creator = await requireApiCreator();
  if (!creator) return jsonError("unauthorized", "Sign-in required.", 401);
  try {
    const user = await ensureUser(creator);
    const feed = await getActivityFeed(user.id);
    return Response.json({ feed }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return socialErrorResponse(error);
  }
}
