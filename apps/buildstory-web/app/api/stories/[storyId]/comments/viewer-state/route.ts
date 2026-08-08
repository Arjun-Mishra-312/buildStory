import { ensureUser, getPublicStoryIdentity, getPublicStoryIdentityByReportId, listPublishedReportIdsForProject } from "@/lib/ingestion/store";
import { requireApiCreator, jsonError, socialErrorResponse } from "@/lib/api/responses";
import { getCommentViewerStateForReports } from "@/lib/social/store";

type RouteContext = { params: Promise<{ storyId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { storyId } = await context.params;
    const identity = await getPublicStoryIdentityByReportId(storyId) ?? await getPublicStoryIdentity(storyId);
    if (!identity) return jsonError("not_found", "Story not found.", 404);
    const creator = await requireApiCreator();
    const viewerUserId = creator ? (await ensureUser(creator)).id : null;
    const rollupReportIds = await listPublishedReportIdsForProject(identity.projectId);
    const state = await getCommentViewerStateForReports(rollupReportIds, viewerUserId);
    return Response.json(state, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return socialErrorResponse(error);
  }
}
