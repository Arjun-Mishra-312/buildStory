import { jsonError, requireApiCreator, socialErrorResponse } from "@/lib/api/responses";
import { ensureUser, getPublicStoryIdentity } from "@/lib/ingestion/store";
import { assertSameOriginBrowserMutation } from "@/lib/security/browser-request";
import { checkRateLimit } from "@/lib/social/rate-limit-dispatch";
import { createComment, listComments } from "@/lib/social/store";

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const identity = await getPublicStoryIdentity(slug);
    if (!identity) return jsonError("not_found", "Story not found.", 404);
    const comments = await listComments(identity.reportId);
    return Response.json({ comments }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return socialErrorResponse(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  const creator = await requireApiCreator();
  if (!creator) return jsonError("unauthorized", "Sign-in required.", 401);
  try {
    assertSameOriginBrowserMutation(request);
    const user = await ensureUser(creator);
    await checkRateLimit("comment", user.id, 20, 60);
    const { slug } = await context.params;
    const identity = await getPublicStoryIdentity(slug);
    if (!identity) return jsonError("not_found", "Story not found.", 404);

    const body = (await request.json().catch(() => null)) as { body?: unknown; parentCommentId?: unknown } | null;
    if (!body || typeof body.body !== "string") {
      return jsonError("invalid_request", "A comment body is required.", 422);
    }
    const parentCommentId =
      body.parentCommentId === undefined || body.parentCommentId === null
        ? null
        : typeof body.parentCommentId === "string"
          ? body.parentCommentId
          : undefined;
    if (parentCommentId === undefined) {
      return jsonError("invalid_request", "parentCommentId must be a string or null.", 422);
    }
    const comment = await createComment(identity.reportId, user.id, body.body, parentCommentId);
    return Response.json({ comment }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return socialErrorResponse(error);
  }
}
