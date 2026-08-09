import { ingestionErrorResponse, jsonError, requireApiCreator } from "@/lib/api/responses";
import { GUIDE_VERSION, isGuideKey, isGuideState } from "@/lib/guidance/contracts";
import { ensureUser, setGuidance } from "@/lib/ingestion/store";
import { readBoundedJson } from "@/lib/ingestion/local-api";
import { assertSameOriginBrowserMutation } from "@/lib/security/browser-request";

type RouteContext = { params: Promise<{ guideKey: string }> };

export async function PUT(request: Request, context: RouteContext) {
  const creator = await requireApiCreator();
  if (!creator) return jsonError("unauthorized", "Creator sign-in required.", 401);
  try {
    assertSameOriginBrowserMutation(request);
    const { guideKey } = await context.params;
    if (!isGuideKey(guideKey)) return jsonError("invalid_guidance", "That guide is not available.", 422);
    const { value } = await readBoundedJson(request, 2 * 1024);
    const raw = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
    if (!raw || raw.version !== GUIDE_VERSION || !isGuideState(raw.state)) {
      return jsonError("invalid_guidance", "A valid guide version and state are required.", 422);
    }
    const user = await ensureUser(creator);
    const guide = await setGuidance(user.id, guideKey, GUIDE_VERSION, raw.state);
    console.info("[creator-guidance] state-saved", { userId: user.id, guideKey, state: raw.state });
    return Response.json({ guide }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return ingestionErrorResponse(error);
  }
}
