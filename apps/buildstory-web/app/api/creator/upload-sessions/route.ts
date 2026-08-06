import { ingestionErrorResponse, jsonError, requireApiCreator } from "@/lib/api/responses";
import { cliApiBaseUrl, isHostedCliEnabled, isLocalApiEnabled, readBoundedJson } from "@/lib/ingestion/local-api";
import { createUploadSession, ensureUser, listUploadSessions } from "@/lib/ingestion/store";
import { isOllamaAutoModel, isValidOllamaModelName } from "@/lib/narrative/ollama";
import { assertSameOriginBrowserMutation } from "@/lib/security/browser-request";
import { checkRateLimit } from "@/lib/social/rate-limit-dispatch";

function scannerAvailable() {
  return isLocalApiEnabled() || isHostedCliEnabled();
}

export async function GET(request: Request) {
  const creator = await requireApiCreator();
  if (!creator) return jsonError("unauthorized", "Creator sign-in required.", 401);
  if (!scannerAvailable()) {
    return jsonError(
      "local_scanner_unavailable",
      "Scanner sessions can be created only by an explicitly enabled local development app or a fully configured hosted deployment.",
      409,
    );
  }
  const params = new URL(request.url).searchParams;
  const requestedLimit = Number(params.get("limit") ?? 100);
  const limit = Number.isFinite(requestedLimit) ? requestedLimit : 100;
  const cursor = params.get("cursor") || undefined;
  const sessions = await listUploadSessions(creator.creatorId, limit, cursor);
  const boundedLimit = Math.min(Math.max(1, Math.trunc(limit)), 100);
  return Response.json({
    sessions,
    nextCursor: sessions.length === boundedLimit ? (sessions.at(-1)?.createdAt ?? null) : null,
  });
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
      Object.keys(value).some((key) => !["projectLabel", "narrativeModel", "narrativeMode"].includes(key))
    ) {
      return jsonError("invalid_request", "Only projectLabel, narrativeModel, and narrativeMode may be provided.", 422);
    }
    const body = value as { projectLabel?: unknown; narrativeModel?: unknown; narrativeMode?: unknown };
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
    if (body.narrativeMode !== undefined && !["local", "cloud", "off"].includes(body.narrativeMode as string)) {
      return jsonError("invalid_narrative_mode", "narrativeMode must be local, cloud, or off.", 422);
    }
    if (
      body.narrativeModel !== undefined &&
      body.narrativeModel !== null &&
      (typeof body.narrativeModel !== "string" ||
        (!isOllamaAutoModel(body.narrativeModel) && !isValidOllamaModelName(body.narrativeModel)))
    ) {
      return jsonError(
        "invalid_narrative_model",
        "narrativeModel must be auto or a valid local Ollama model name.",
        422,
      );
    }
    const projectLabel =
      typeof body.projectLabel === "string" ? body.projectLabel : "New local project";
    const narrativeModel =
      typeof body.narrativeModel === "string" && !isOllamaAutoModel(body.narrativeModel)
        ? body.narrativeModel.trim()
        : null;
    const narrativeMode = typeof body.narrativeMode === "string" ? body.narrativeMode as "local" | "cloud" | "off" : "local";
    const user = await ensureUser(creator);
    await checkRateLimit("upload_session", user.id, 20, 60, request);
    const result = await createUploadSession(
      creator.creatorId,
      projectLabel,
      cliApiBaseUrl(request),
      user.id,
      narrativeModel,
      narrativeMode,
    );
    return Response.json(result, {
      status: 201,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return ingestionErrorResponse(error);
  }
}
