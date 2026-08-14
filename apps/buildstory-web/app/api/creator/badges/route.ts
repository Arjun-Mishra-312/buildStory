import { ingestionErrorResponse, jsonError, requireApiCreator } from "@/lib/api/responses";
import { readBoundedJson } from "@/lib/ingestion/local-api";
import { ensureUser } from "@/lib/ingestion/store";
import { assertSameOriginBrowserMutation } from "@/lib/security/browser-request";
import { isBadgeId, pinBadges } from "@/lib/badges/store";

export async function PATCH(request: Request) {
  const creator = await requireApiCreator();
  if (!creator) return jsonError("unauthorized", "Creator sign-in required.", 401);
  try {
    assertSameOriginBrowserMutation(request);
    const { value } = await readBoundedJson(request, 4 * 1024);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return jsonError("invalid_badge_pins", "A pinned badge list is required.", 422);
    }
    const pinned = (value as { pinned?: unknown }).pinned;
    if (!Array.isArray(pinned) || pinned.length > 3 || pinned.some((id) => !isBadgeId(id))) {
      return jsonError("invalid_badge_pins", "Pin up to three earned badges.", 422);
    }
    const user = await ensureUser(creator);
    const badges = await pinBadges(user.id, pinned);
    return Response.json({ badges }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "unearned_badge") {
      return jsonError("unearned_badge", "Can only pin earned badges.", 422);
    }
    return ingestionErrorResponse(error);
  }
}
