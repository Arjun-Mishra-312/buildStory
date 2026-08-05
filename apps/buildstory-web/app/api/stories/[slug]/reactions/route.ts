import { jsonError, requireApiCreator, socialErrorResponse } from "@/lib/api/responses";
import { getPublicStoryIdentity } from "@/lib/ingestion/store";
import { assertSameOriginBrowserMutation } from "@/lib/security/browser-request";
import { isReactionKind } from "@/lib/social/contracts";
import { checkRateLimit } from "@/lib/social/rate-limit-dispatch";
import { getReactionSummary, setReaction } from "@/lib/social/store";
import { ensureUser } from "@/lib/ingestion/store";

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const identity = await getPublicStoryIdentity(slug);
    if (!identity) return jsonError("not_found", "Story not found.", 404);

    const creator = await requireApiCreator();
    const viewerUserId = creator ? (await ensureUser(creator)).id : null;
    const summary = await getReactionSummary(identity.reportId, viewerUserId);
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
    const { slug } = await context.params;
    const identity = await getPublicStoryIdentity(slug);
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
