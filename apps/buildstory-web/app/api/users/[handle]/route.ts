import { jsonError, requireApiCreator, socialErrorResponse } from "@/lib/api/responses";
import { ensureUser } from "@/lib/ingestion/store";
import { getFollowState, getProfileByHandle } from "@/lib/social/store";

type RouteContext = { params: Promise<{ handle: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { handle } = await context.params;
    const profile = await getProfileByHandle(handle);
    if (!profile) return jsonError("not_found", "User not found.", 404);

    const creator = await requireApiCreator();
    const viewerUserId = creator ? (await ensureUser(creator)).id : null;
    const follow = await getFollowState(profile.id, viewerUserId);
    return Response.json(
      { profile, follow, isSelf: viewerUserId === profile.id },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return socialErrorResponse(error);
  }
}
