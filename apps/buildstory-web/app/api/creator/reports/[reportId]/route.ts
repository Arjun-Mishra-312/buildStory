import { ingestionErrorResponse, jsonError, requireApiCreator } from "@/lib/api/responses";
import type { GeneratedReport, PublicFieldKey, StoryCategory } from "@/lib/ingestion/contracts";
import { readBoundedJson } from "@/lib/ingestion/local-api";
import { getReport, updateReport } from "@/lib/ingestion/store";
import { assertSameOriginBrowserMutation } from "@/lib/security/browser-request";

type RouteContext = { params: Promise<{ reportId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const creator = await requireApiCreator();
  if (!creator) return jsonError("unauthorized", "Creator sign-in required.", 401);
  try {
    const { reportId } = await context.params;
    return Response.json(
      { report: await getReport(creator.creatorId, reportId) },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    return ingestionErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const creator = await requireApiCreator();
  if (!creator) return jsonError("unauthorized", "Creator sign-in required.", 401);

  try {
    assertSameOriginBrowserMutation(request);
    const { value } = await readBoundedJson(request, 32 * 1024);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return jsonError("invalid_report_update", "A report update object is required.", 422);
    }
    const raw = value as Record<string, unknown>;
    if (
      Object.keys(raw).length === 0 ||
      Object.keys(raw).some(
        (key) => key !== "selectedPublicFields" && key !== "editorial" && key !== "artifact" && key !== "category",
      ) ||
      (raw.selectedPublicFields !== undefined &&
        (!Array.isArray(raw.selectedPublicFields) ||
          raw.selectedPublicFields.some((field) => typeof field !== "string"))) ||
      (raw.editorial !== undefined &&
        (!raw.editorial ||
          typeof raw.editorial !== "object" ||
          Array.isArray(raw.editorial) ||
          Object.keys(raw.editorial).some(
            (key) => !["tagline", "description", "reflection"].includes(key),
          ) ||
          Object.values(raw.editorial).some((field) => typeof field !== "string"))) ||
      (raw.artifact !== undefined &&
        (!raw.artifact ||
          typeof raw.artifact !== "object" ||
          Array.isArray(raw.artifact) ||
          Object.keys(raw.artifact).some(
            (key) => !["projectUrl", "repoUrl", "videoUrl"].includes(key),
          ) ||
          Object.values(raw.artifact).some((field) => field !== null && typeof field !== "string")))
      || (raw.category !== undefined && raw.category !== null && typeof raw.category !== "string")
    ) {
      return jsonError(
        "invalid_report_update",
        "Report updates may contain public-field names, editorial values, a category, and artifact link URLs.",
        422,
      );
    }
    const body = value as {
      selectedPublicFields?: PublicFieldKey[];
      editorial?: Partial<GeneratedReport["editorial"]>;
      artifact?: { projectUrl?: string | null; repoUrl?: string | null; videoUrl?: string | null };
      category?: StoryCategory | null;
    };
    const { reportId } = await context.params;
    const report = await updateReport(creator.creatorId, reportId, body);
    return Response.json(
      { report },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    return ingestionErrorResponse(error);
  }
}
