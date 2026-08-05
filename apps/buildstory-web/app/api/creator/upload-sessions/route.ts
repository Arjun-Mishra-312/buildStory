import { ingestionErrorResponse, jsonError, requireApiCreator } from "@/lib/api/responses";
import { cliApiBaseUrl, isHostedCliEnabled, isLocalApiEnabled, readBoundedJson } from "@/lib/ingestion/local-api";
import { createUploadSession, ensureUser, listUploadSessions } from "@/lib/ingestion/store";
import { assertSameOriginBrowserMutation } from "@/lib/security/browser-request";

function scannerAvailable() {
  return isLocalApiEnabled() || isHostedCliEnabled();
}

export async function GET() {
  const creator = await requireApiCreator();
  if (!creator) return jsonError("unauthorized", "Creator sign-in required.", 401);
  if (!scannerAvailable()) {
    return jsonError(
      "local_scanner_unavailable",
      "Scanner sessions can be created only by an explicitly enabled local development app or a fully configured hosted deployment.",
      409,
    );
  }
  return Response.json({ sessions: await listUploadSessions(creator.creatorId) });
}

export async function POST(request: Request) {
  const creator = await requireApiCreator();
  if (!creator) return jsonError("unauthorized", "Creator sign-in required.", 401);
  if (!scannerAvailable()) {
    return jsonError(
      "local_scanner_unavailable",
      "Scanner sessions can be created only by an explicitly enabled local development app or a fully configured hosted deployment.",
      409,
    );
  }

  try {
    assertSameOriginBrowserMutation(request);
    const { value } = await readBoundedJson(request, 16 * 1024);
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.keys(value).some((key) => key !== "projectLabel")
    ) {
      return jsonError("invalid_request", "Only projectLabel may be provided.", 422);
    }
    const body = value as { projectLabel?: unknown };
    if (
      body.projectLabel !== undefined &&
      (typeof body.projectLabel !== "string" || body.projectLabel.length > 120)
    ) {
      return jsonError(
        "invalid_project_label",
        "projectLabel must be a string of at most 120 characters.",
        422,
      );
    }
    const projectLabel =
      typeof body.projectLabel === "string" ? body.projectLabel : "New local project";
    const user = await ensureUser(creator);
    const result = await createUploadSession(
      creator.creatorId,
      projectLabel,
      cliApiBaseUrl(request),
      user.id,
    );
    return Response.json(result, {
      status: 201,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return ingestionErrorResponse(error);
  }
}
