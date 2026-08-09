import { ingestionErrorResponse, jsonError, requireApiCreator } from "@/lib/api/responses";
import { isBuilderRole } from "@/lib/identity/builder-roles";
import { completeOnboarding, ensureUser } from "@/lib/ingestion/store";
import { readBoundedJson } from "@/lib/ingestion/local-api";
import { assertSameOriginBrowserMutation } from "@/lib/security/browser-request";

export async function POST(request: Request) {
  const creator = await requireApiCreator();
  if (!creator) return jsonError("unauthorized", "Creator sign-in required.", 401);

  try {
    assertSameOriginBrowserMutation(request);
    const { value } = await readBoundedJson(request, 8 * 1024);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return jsonError("invalid_onboarding", "An onboarding profile is required.", 422);
    }
    const raw = value as Record<string, unknown>;
    if (
      typeof raw.displayName !== "string" ||
      typeof raw.handle !== "string" ||
      (raw.bio !== undefined && raw.bio !== null && typeof raw.bio !== "string") ||
      (raw.builderRole !== undefined && raw.builderRole !== null && !isBuilderRole(raw.builderRole))
    ) {
      return jsonError("invalid_onboarding", "Display name and handle are required; bio and role must be valid strings.", 422);
    }

    const user = await ensureUser(creator);
    const profile = await completeOnboarding(user.id, {
      displayName: raw.displayName,
      handle: raw.handle,
      bio: raw.bio === null ? null : raw.bio as string | undefined,
      builderRole: raw.builderRole === null ? null : raw.builderRole as Parameters<typeof completeOnboarding>[1]["builderRole"],
    });
    console.info("[creator-onboarding] completed", { userId: user.id });
    return Response.json({ profile }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return ingestionErrorResponse(error);
  }
}
