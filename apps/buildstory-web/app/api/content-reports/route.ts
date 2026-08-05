import { jsonError, requireApiCreator, socialErrorResponse } from "@/lib/api/responses";
import { ensureUser } from "@/lib/ingestion/store";
import { assertSameOriginBrowserMutation } from "@/lib/security/browser-request";
import {
  CONTENT_REPORT_REASON_CODES,
  CONTENT_REPORT_TARGET_TYPES,
  type ContentReportReasonCode,
  type ContentReportStatus,
  type ContentReportTargetType,
} from "@/lib/social/contracts";
import { checkRateLimit } from "@/lib/social/rate-limit-dispatch";
import { fileContentReport, listContentReports } from "@/lib/social/store";

function isTargetType(value: unknown): value is ContentReportTargetType {
  return typeof value === "string" && (CONTENT_REPORT_TARGET_TYPES as readonly string[]).includes(value);
}

function isReasonCode(value: unknown): value is ContentReportReasonCode {
  return typeof value === "string" && (CONTENT_REPORT_REASON_CODES as readonly string[]).includes(value);
}

export async function POST(request: Request) {
  const creator = await requireApiCreator();
  if (!creator) return jsonError("unauthorized", "Sign-in required.", 401);
  try {
    assertSameOriginBrowserMutation(request);
    const user = await ensureUser(creator);
    await checkRateLimit("content_report", user.id, 20, 3_600);
    const body = (await request.json().catch(() => null)) as {
      targetType?: unknown;
      targetId?: unknown;
      reasonCode?: unknown;
      note?: unknown;
    } | null;
    if (
      !body ||
      !isTargetType(body.targetType) ||
      typeof body.targetId !== "string" ||
      !body.targetId ||
      !isReasonCode(body.reasonCode) ||
      (body.note !== undefined && body.note !== null && typeof body.note !== "string")
    ) {
      return jsonError("invalid_request", "A valid targetType, targetId, and reasonCode are required.", 422);
    }
    const report = await fileContentReport(
      user.id,
      body.targetType,
      body.targetId,
      body.reasonCode,
      typeof body.note === "string" ? body.note : null,
    );
    return Response.json({ report }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return socialErrorResponse(error);
  }
}

export async function GET(request: Request) {
  const creator = await requireApiCreator();
  if (!creator) return jsonError("unauthorized", "Sign-in required.", 401);
  try {
    const user = await ensureUser(creator);
    if (user.role !== "moderator" && user.role !== "admin") {
      return jsonError("forbidden", "Moderator access required.", 403);
    }
    const statusParam = new URL(request.url).searchParams.get("status");
    const status: ContentReportStatus | undefined =
      statusParam === "open" || statusParam === "actioned" || statusParam === "dismissed" ? statusParam : undefined;
    const reports = await listContentReports(status);
    return Response.json({ reports }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return socialErrorResponse(error);
  }
}
