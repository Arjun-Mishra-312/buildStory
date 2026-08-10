import { ingestionErrorResponse, jsonError, requireApiCreator } from "@/lib/api/responses";
import { ensureUser, setUserStatusById } from "@/lib/ingestion/store";
import { assertSameOriginBrowserMutation } from "@/lib/security/browser-request";
import { getProfileByHandle } from "@/lib/social/store";

const STATUSES = new Set(["active", "suspended"]);

type RouteContext = { params: Promise<{ handle: string }> };

/** Moderator/admin-triggered suspend or reinstate. Resolves handle -> user id, then flips the status the account_suspended checks already read. */
export async function PATCH(request: Request, context: RouteContext) {
  const creator = await requireApiCreator();
  if (!creator) return jsonError("unauthorized", "Sign-in required.", 401);
  try {
    assertSameOriginBrowserMutation(request);
    const actor = await ensureUser(creator);
    if (actor.role !== "moderator" && actor.role !== "admin") {
      return jsonError("forbidden", "Moderator access required.", 403);
    }
    const body = (await request.json().catch(() => null)) as { status?: unknown } | null;
    const status = typeof body?.status === "string" && STATUSES.has(body.status) ? body.status : null;
    if (!status) {
      return jsonError("invalid_request", "status must be 'active' or 'suspended'.", 422);
    }
    const { handle } = await context.params;
    const profile = await getProfileByHandle(handle);
    if (!profile) return jsonError("not_found", "No user with that handle.", 404);
    const result = await setUserStatusById(profile.id, status as "active" | "suspended");
    return Response.json({ user: result }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return ingestionErrorResponse(error);
  }
}
