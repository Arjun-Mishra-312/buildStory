import { ingestionErrorResponse, jsonError, requireApiCreator } from "@/lib/api/responses";
import { ensureUser, setUserRoleByHandle } from "@/lib/ingestion/store";
import { assertSameOriginBrowserMutation } from "@/lib/security/browser-request";

const ROLES = new Set(["member", "moderator", "admin"]);

type RouteContext = { params: Promise<{ handle: string }> };

/** Admin-only self-service role changes, once at least one admin exists (see app/api/internal/users/role for bootstrapping the first one). */
export async function PATCH(request: Request, context: RouteContext) {
  const creator = await requireApiCreator();
  if (!creator) return jsonError("unauthorized", "Sign-in required.", 401);
  try {
    assertSameOriginBrowserMutation(request);
    const actor = await ensureUser(creator);
    if (actor.role !== "admin") {
      return jsonError("forbidden", "Admin access required.", 403);
    }
    const body = (await request.json().catch(() => null)) as { role?: unknown } | null;
    const role = typeof body?.role === "string" && ROLES.has(body.role) ? body.role : null;
    if (!role) {
      return jsonError("invalid_request", "role must be 'member', 'moderator', or 'admin'.", 422);
    }
    const { handle } = await context.params;
    const result = await setUserRoleByHandle(handle, role as "member" | "moderator" | "admin");
    return Response.json({ user: result }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return ingestionErrorResponse(error);
  }
}
