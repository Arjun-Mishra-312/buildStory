import { jsonError, requireApiCreator, socialErrorResponse } from "@/lib/api/responses";
import { ensureUser } from "@/lib/ingestion/store";
import { assertSameOriginBrowserMutation } from "@/lib/security/browser-request";
import { checkRateLimit } from "@/lib/social/rate-limit-dispatch";
import { followUser, getProfileByHandle, unfollowUser } from "@/lib/social/store";

type RouteContext = { params: Promise<{ handle: string }> };

export async function POST(request: Request, context: RouteContext) {
  const creator = await requireApiCreator();
  if (!creator) return jsonError("unauthorized", "Sign-in required.", 401);
  try {
    assertSameOriginBrowserMutation(request);
    const user = await ensureUser(creator);
    await checkRateLimit("follow", user.id, 60, 60);
    const { handle } = await context.params;
    const target = await getProfileByHandle(handle);
    if (!target) return jsonError("not_found", "User not found.", 404);
    const result = await followUser(user.id, target.id);
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return socialErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const creator = await requireApiCreator();
  if (!creator) return jsonError("unauthorized", "Sign-in required.", 401);
  try {
    assertSameOriginBrowserMutation(request);
    const user = await ensureUser(creator);
    await checkRateLimit("follow", user.id, 60, 60);
    const { handle } = await context.params;
    const target = await getProfileByHandle(handle);
    if (!target) return jsonError("not_found", "User not found.", 404);
    await unfollowUser(user.id, target.id);
    return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return socialErrorResponse(error);
  }
}
