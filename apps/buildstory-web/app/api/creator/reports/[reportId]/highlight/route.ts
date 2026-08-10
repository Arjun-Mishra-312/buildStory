import { ingestionErrorResponse, jsonError, requireApiCreator } from "@/lib/api/responses";
import { createHighlight, ensureUser } from "@/lib/ingestion/store";
import { assertSameOriginBrowserMutation } from "@/lib/security/browser-request";

type RouteContext = { params: Promise<{ reportId: string }> };

/** Spotlights a published report on Explore's Pro Picks rail for 24h - never reorders the real organic ranking. */
export async function POST(request: Request, context: RouteContext) {
  const creator = await requireApiCreator();
  if (!creator) return jsonError("unauthorized", "Creator sign-in required.", 401);
  try {
    assertSameOriginBrowserMutation(request);
    const { reportId } = await context.params;
    const user = await ensureUser(creator);
    await createHighlight(user.id, reportId);
    return Response.json({ highlighted: true }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return ingestionErrorResponse(error);
  }
}
