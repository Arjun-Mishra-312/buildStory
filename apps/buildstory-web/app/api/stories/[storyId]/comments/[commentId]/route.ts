import { jsonError, requireApiCreator, socialErrorResponse } from "@/lib/api/responses";
import { ensureUser } from "@/lib/ingestion/store";
import { assertSameOriginBrowserMutation } from "@/lib/security/browser-request";
import { deleteComment } from "@/lib/social/store";

type RouteContext = { params: Promise<{ storyId: string; commentId: string }> };

export async function DELETE(request: Request, context: RouteContext) {
  const creator = await requireApiCreator();
  if (!creator) return jsonError("unauthorized", "Sign-in required.", 401);
  try {
    assertSameOriginBrowserMutation(request);
    const user = await ensureUser(creator);
    const { commentId } = await context.params;
    await deleteComment(commentId, user.id, user.role);
    return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return socialErrorResponse(error);
  }
}
