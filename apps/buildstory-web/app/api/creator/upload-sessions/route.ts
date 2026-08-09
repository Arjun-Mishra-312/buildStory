import { ingestionErrorResponse, jsonError, requireApiCreator } from "@/lib/api/responses";
import { cliApiBaseUrl, isHostedCliEnabled, isLocalApiEnabled, readBoundedJson } from "@/lib/ingestion/local-api";
import { createUploadSession, ensureUser, listUploadSessions } from "@/lib/ingestion/store";
import { isOllamaAutoModel, isValidOllamaModelName } from "@/lib/narrative/ollama";
import { configuredCloudNarrativeProvider } from "@/lib/narrative/provider";
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
      Object.keys(value).some((key) => !["projectLabel", "narrativeModel", "narrativeMode", "narrativeProvider", "projectId"].includes(key))
    ) {
      return jsonError("invalid_request", "Only projectLabel, narrativeModel, narrativeMode, narrativeProvider, and projectId may be provided.", 422);
    }
    const body = value as { projectLabel?: unknown; narrativeModel?: unknown; narrativeMode?: unknown; narrativeProvider?: unknown; projectId?: unknown };
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
    if (body.projectId !== undefined && typeof body.projectId !== "string") {
      return jsonError("invalid_request", "projectId must be a string.", 422);
    }
    if (body.narrativeMode !== undefined && !["local", "byok", "cloud", "off"].includes(body.narrativeMode as string)) {
      return jsonError("invalid_narrative_mode", "narrativeMode must be local, byok, cloud, or off.", 422);
    }
    if (body.narrativeProvider !== undefined && body.narrativeProvider !== "openrouter" && body.narrativeProvider !== "openai") {
      return jsonError("invalid_narrative_provider", "narrativeProvider must be openrouter or openai.", 422);
    }
    if (
      body.narrativeMode === "local" && body.narrativeModel !== undefined &&
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
    const narrativeMode = typeof body.narrativeMode === "string" ? body.narrativeMode as "local" | "byok" | "cloud" | "off" : "local";
    const narrativeProvider = narrativeMode === "byok"
      ? body.narrativeProvider === "openai" ? "openai" : "openrouter"
      : narrativeMode === "cloud" ? configuredCloudNarrativeProvider() : narrativeMode === "local" ? "ollama" : null;
    // Model choice only means anything for local/BYOK (which model runs on
    // the creator's own machine). Buildstory Cloud always calls the one
    // model it supports - there is no user-facing choice on that path, so
    // any submitted value is ignored rather than validated, regardless of
    // what a client sends.
    const narrativeModel = narrativeMode === "byok"
      ? narrativeProvider === "openai" ? "gpt-5.6-luna" : "deepseek/deepseek-v4-flash"
      : narrativeMode === "local" && typeof body.narrativeModel === "string" && !isOllamaAutoModel(body.narrativeModel)
        ? body.narrativeModel.trim() : null;
    const targetProjectId = typeof body.projectId === "string" ? body.projectId : null;
    const user = await ensureUser(creator);
    await checkRateLimit("upload_session", user.id, 20, 60, request);
    const result = await createUploadSession(
      creator.creatorId,
      projectLabel,
      cliApiBaseUrl(request),
      user.id,
      narrativeModel,
      narrativeMode,
      targetProjectId,
      narrativeProvider,
    );
    return Response.json(result, {
      status: 201,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return ingestionErrorResponse(error);
  }
}
