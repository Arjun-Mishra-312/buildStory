import { jsonError, ingestionErrorResponse } from "@/lib/api/responses";
import { portReportUi } from "@/lib/ingestion/store";

/** Constant-time comparison so a mismatched secret can't be brute-forced via response-time differences. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return mismatch === 0;
}

/**
 * One-shot operator job after the report UI sprint. Pages through ready
 * reports, persists current profile/signals, unions recap/signal public
 * fields, and rebuilds frozen public projections. Drop this route after the
 * production run completes.
 */
export async function POST(request: Request) {
  const configuredSecret = process.env.BUILDSTORY_CRON_SECRET;
  if (!configuredSecret) {
    return jsonError("port_ui_unavailable", "This deployment has not configured BUILDSTORY_CRON_SECRET.", 503);
  }
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match || !timingSafeEqual(match[1]!, configuredSecret)) {
    return jsonError("unauthorized", "A valid bearer secret is required.", 401);
  }
  try {
    const body = (await request.json().catch(() => ({}))) as {
      cursor?: unknown;
      limit?: unknown;
      dryRun?: unknown;
      reportId?: unknown;
    };
    const cursor = typeof body.cursor === "string" ? body.cursor : "";
    const limit = typeof body.limit === "number" && Number.isFinite(body.limit) ? body.limit : 5;
    const dryRun = body.dryRun === true;
    const reportId = typeof body.reportId === "string" && body.reportId.trim() ? body.reportId.trim() : undefined;
    const page = await portReportUi(cursor, limit, dryRun, reportId);
    return Response.json(page, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return ingestionErrorResponse(error);
  }
}
