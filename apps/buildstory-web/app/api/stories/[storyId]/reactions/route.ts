import { jsonError, requireApiCreator, socialErrorResponse } from "@/lib/api/responses";
import { getPublicStoryIdentity, getPublicStoryIdentityByReportId, listPublishedReportIdsForProject } from "@/lib/ingestion/store";
import { assertSameOriginBrowserMutation } from "@/lib/security/browser-request";
import { isReactionKind } from "@/lib/social/contracts";
import { checkRateLimit } from "@/lib/social/rate-limit-dispatch";
import { getReactionSummaryForReports, setReaction } from "@/lib/social/store";
import { ensureUser } from "@/lib/ingestion/store";

type RouteContext = { params: Promise<{ storyId: string }> };

/** Rollup read: reaction totals summed across every published chapter of this story's project. */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const { storyId } = await context.params;
    const identity = await getPublicStoryIdentityByReportId(storyId) ?? await getPublicStoryIdentity(storyId);
    if (!identity) return jsonError("not_found", "Story not found.", 404);

    const creator = await requireApiCreator();
    const viewerUserId = creator ? (await ensureUser(creator)).id : null;
    const rollupReportIds = await listPublishedReportIdsForProject(identity.projectId);
    const summary = await getReactionSummaryForReports(rollupReportIds, viewerUserId);
    return Response.json(summary, { headers: { "cache-control": "no-store" } });
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
    await checkRateLimit("reaction", user.id, 60, 60);
    const { storyId } = await context.params;
    const identity = await getPublicStoryIdentityByReportId(storyId) ?? await getPublicStoryIdentity(storyId);
    if (!identity) return jsonError("not_found", "Story not found.", 404);

    const body = (await request.json().catch(() => null)) as { kind?: unknown } | null;
    if (!body || !isReactionKind(body.kind)) {
      return jsonError("invalid_reaction_kind", "A valid reaction kind is required.", 422);
    }
    const summary = await setReaction(identity.reportId, user.id, body.kind);
    return Response.json(summary, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return socialErrorResponse(error);
  }
}
