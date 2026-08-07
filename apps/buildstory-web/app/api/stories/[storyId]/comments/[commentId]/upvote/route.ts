import { jsonError, requireApiCreator, socialErrorResponse } from "@/lib/api/responses";
import { ensureUser, getPublicStoryIdentity, getPublicStoryIdentityByReportId } from "@/lib/ingestion/store";
import { assertSameOriginBrowserMutation } from "@/lib/security/browser-request";
import { checkRateLimit } from "@/lib/social/rate-limit-dispatch";
import { setCommentUpvote } from "@/lib/social/store";

type RouteContext = { params: Promise<{ storyId: string; commentId: string }> };

async function mutate(request: Request, context: RouteContext, enabled: boolean) {
  const creator = await requireApiCreator();
  if (!creator) return jsonError("unauthorized", "Sign-in required.", 401);
  try {
    assertSameOriginBrowserMutation(request);
    const user = await ensureUser(creator);
    await checkRateLimit("comment-upvote", user.id, 120, 60);
    const { storyId, commentId } = await context.params;
    const identity = await getPublicStoryIdentityByReportId(storyId) ?? await getPublicStoryIdentity(storyId);
    if (!identity) return jsonError("not_found", "Story not found.", 404);
    return Response.json(await setCommentUpvote(commentId, user.id, enabled), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return socialErrorResponse(error);
  }
}

export async function PUT(request: Request, context: RouteContext) {
  return mutate(request, context, true);
}

export async function DELETE(request: Request, context: RouteContext) {
  return mutate(request, context, false);
}
