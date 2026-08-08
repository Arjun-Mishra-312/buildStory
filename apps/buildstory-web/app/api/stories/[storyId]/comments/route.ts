import { jsonError, requireApiCreator, socialErrorResponse } from "@/lib/api/responses";
import { ensureUser, getPublicStoryIdentity, getPublicStoryIdentityByReportId, listPublishedReportIdsForProject } from "@/lib/ingestion/store";
import { assertSameOriginBrowserMutation } from "@/lib/security/browser-request";
import { checkRateLimit } from "@/lib/social/rate-limit-dispatch";
import { createComment, listCommentsForReports } from "@/lib/social/store";

type RouteContext = { params: Promise<{ storyId: string }> };

/** Rollup read: every published chapter of this story's project, oldest chapter first (a new chapter's comments are never a reason to bury the old ones). */
export async function GET(request: Request, context: RouteContext) {
  try {
    const { storyId } = await context.params;
    const identity = await getPublicStoryIdentityByReportId(storyId) ?? await getPublicStoryIdentity(storyId);
    if (!identity) return jsonError("not_found", "Story not found.", 404);
    const params = new URL(request.url).searchParams;
    const requestedLimit = Number(params.get("limit") ?? 100);
    const limit = Number.isFinite(requestedLimit) ? requestedLimit : 100;
    const cursor = params.get("cursor") || undefined;
    await checkRateLimit("comments-read", "anonymous", 120, 60, request);
    const rollupReportIds = await listPublishedReportIdsForProject(identity.projectId);
    const comments = await listCommentsForReports(rollupReportIds, limit, cursor);
    const boundedLimit = Math.min(Math.max(1, Math.trunc(limit)), 200);
    return Response.json(
      { comments, nextCursor: comments.length === boundedLimit ? (comments.at(-1)?.createdAt ?? null) : null },
      { headers: { "cache-control": "public, max-age=5, stale-while-revalidate=15" } },
    );
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
    const { storyId } = await context.params;
    const identity = await getPublicStoryIdentityByReportId(storyId) ?? await getPublicStoryIdentity(storyId);
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
