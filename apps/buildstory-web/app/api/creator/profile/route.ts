import { ingestionErrorResponse, jsonError, requireApiCreator } from "@/lib/api/responses";
import { readBoundedJson } from "@/lib/ingestion/local-api";
import { ensureUser, updateProfile } from "@/lib/ingestion/store";
import { assertSameOriginBrowserMutation } from "@/lib/security/browser-request";

const ALLOWED_KEYS = new Set(["bio", "displayName", "handle"]);

export async function PATCH(request: Request) {
  const creator = await requireApiCreator();
  if (!creator) return jsonError("unauthorized", "Creator sign-in required.", 401);

  try {
    assertSameOriginBrowserMutation(request);
    const { value } = await readBoundedJson(request, 8 * 1024);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return jsonError("invalid_profile_update", "A profile update object is required.", 422);
    }
    const raw = value as Record<string, unknown>;
    if (
      Object.keys(raw).length === 0 ||
      Object.keys(raw).some((key) => !ALLOWED_KEYS.has(key)) ||
      (raw.bio !== undefined && typeof raw.bio !== "string") ||
      (raw.displayName !== undefined && typeof raw.displayName !== "string") ||
      (raw.handle !== undefined && typeof raw.handle !== "string")
    ) {
      return jsonError(
        "invalid_profile_update",
        "Only bio, displayName, and handle (each a string) may be updated.",
        422,
      );
    }

    const user = await ensureUser(creator);
    const profile = await updateProfile(user.id, {
      bio: raw.bio as string | undefined,
      displayName: raw.displayName as string | undefined,
      handle: raw.handle as string | undefined,
    });
    return Response.json({ profile }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return ingestionErrorResponse(error);
  }
}
