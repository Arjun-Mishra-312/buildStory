import { jsonError, requireApiCreator, socialErrorResponse } from "@/lib/api/responses";
import { ensureUser } from "@/lib/ingestion/store";
import { assertSameOriginBrowserMutation } from "@/lib/security/browser-request";
import { markNotificationsRead } from "@/lib/social/store";

export async function POST(request: Request) {
  const creator = await requireApiCreator();
  if (!creator) return jsonError("unauthorized", "Sign-in required.", 401);
  try {
    assertSameOriginBrowserMutation(request);
    const user = await ensureUser(creator);
    const body = (await request.json().catch(() => ({}))) as { ids?: unknown };
    const ids =
      body.ids === undefined
        ? undefined
        : Array.isArray(body.ids) && body.ids.every((id) => typeof id === "string")
          ? (body.ids as string[])
          : undefined;
    if (body.ids !== undefined && ids === undefined) {
      return jsonError("invalid_request", "ids must be an array of strings when provided.", 422);
    }
    await markNotificationsRead(user.id, ids);
    return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return socialErrorResponse(error);
  }
}
