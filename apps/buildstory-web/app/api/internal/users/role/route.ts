import { jsonError, ingestionErrorResponse } from "@/lib/api/responses";
import { setUserRoleByHandle } from "@/lib/ingestion/store";

/** Constant-time comparison so a mismatched secret can't be brute-forced via response-time differences. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return mismatch === 0;
}

const ROLES = new Set(["member", "moderator", "admin"]);

/**
 * Bootstrap-only path to grant the very first admin: nothing in the product
 * itself can create an admin from nothing, since every self-service admin
 * route (app/api/admin/*) requires an existing admin to call it. An operator
 * runs this once via curl with BUILDSTORY_ADMIN_SECRET, then manages roles
 * through the studio admin panel from then on.
 */
export async function POST(request: Request) {
  const configuredSecret = process.env.BUILDSTORY_ADMIN_SECRET;
  if (!configuredSecret) {
    return jsonError("admin_bootstrap_unavailable", "This deployment has not configured BUILDSTORY_ADMIN_SECRET.", 503);
  }
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match || !timingSafeEqual(match[1]!, configuredSecret)) {
    return jsonError("unauthorized", "A valid bearer secret is required.", 401);
  }
  try {
    const body = (await request.json().catch(() => null)) as { handle?: unknown; role?: unknown } | null;
    const handle = typeof body?.handle === "string" ? body.handle.trim() : "";
    const role = typeof body?.role === "string" && ROLES.has(body.role) ? body.role : null;
    if (!handle || !role) {
      return jsonError("invalid_request", "handle and role ('member' | 'moderator' | 'admin') are required.", 422);
    }
    const result = await setUserRoleByHandle(handle, role as "member" | "moderator" | "admin");
    return Response.json({ user: result }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return ingestionErrorResponse(error);
  }
}
