import { jsonError, requireApiCreator, socialErrorResponse } from "@/lib/api/responses";
import { ensureUser, moderatorUnpublishReport, setUserStatusById } from "@/lib/ingestion/store";
import { assertSameOriginBrowserMutation } from "@/lib/security/browser-request";
import type { ContentReportRecord, ContentReportStatus } from "@/lib/social/contracts";
import { getContentReport, moderatorHideComment, resolveContentReport } from "@/lib/social/store";

type RouteContext = { params: Promise<{ reportId: string }> };

/**
 * Best-effort side effect for an "actioned" report - the report's own status
 * flip (above) already succeeded and is the source of truth, so a failure
 * here (e.g. the target was already removed by other means) shouldn't turn
 * a successful moderation decision into a 500.
 */
async function enforceAction(report: ContentReportRecord) {
  try {
    if (report.targetType === "report") {
      await moderatorUnpublishReport(report.targetId);
    } else if (report.targetType === "comment") {
      await moderatorHideComment(report.targetId);
    } else if (report.targetType === "user") {
      await setUserStatusById(report.targetId, "suspended");
    }
  } catch {
    // Logged by the enforcement call's own store layer where relevant; the report is already resolved.
  }
}

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
    const report = await getContentReport(reportId);
    if (!report) return jsonError("not_found", "Content report not found.", 404);
    await resolveContentReport(reportId, status, user.id);
    if (status === "actioned") await enforceAction(report);
    return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return socialErrorResponse(error);
  }
}
