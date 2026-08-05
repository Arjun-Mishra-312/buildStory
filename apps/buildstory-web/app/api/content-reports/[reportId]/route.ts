import { jsonError, requireApiCreator, socialErrorResponse } from "@/lib/api/responses";
import { ensureUser } from "@/lib/ingestion/store";
import { assertSameOriginBrowserMutation } from "@/lib/security/browser-request";
import type { ContentReportStatus } from "@/lib/social/contracts";
import { resolveContentReport } from "@/lib/social/store";

type RouteContext = { params: Promise<{ reportId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const creator = await requireApiCreator();
  if (!creator) return jsonError("unauthorized", "Sign-in required.", 401);
  try {
    assertSameOriginBrowserMutation(request);
    const user = await ensureUser(creator);
    if (user.role !== "moderator" && user.role !== "admin") {
      return jsonError("forbidden", "Moderator access required.", 403);
    }
    const body = (await request.json().catch(() => null)) as { status?: unknown } | null;
    const status: ContentReportStatus | null =
      body?.status === "actioned" || body?.status === "dismissed" ? body.status : null;
    if (!status) {
      return jsonError("invalid_request", "status must be \"actioned\" or \"dismissed\".", 422);
    }
    const { reportId } = await context.params;
    await resolveContentReport(reportId, status);
    return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return socialErrorResponse(error);
  }
}
