import { ingestionErrorResponse, jsonError, requireApiCreator } from "@/lib/api/responses";
import { deriveNarrativeDisplayStatus } from "@/lib/ingestion/narrative-status";
import { getReport } from "@/lib/ingestion/store";

type RouteContext = { params: Promise<{ reportId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const creator = await requireApiCreator();
  if (!creator) return jsonError("unauthorized", "Creator sign-in required.", 401);
  try {
    const { reportId } = await context.params;
    const report = await getReport(creator.creatorId, reportId);
    const status = deriveNarrativeDisplayStatus(report.sourceSnapshot, report.narrative);
    return Response.json(
      {
        status,
        reportReady: report.status === "ready",
        requestedTier: report.narrative?.analysisTierRequested ?? null,
      },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    return ingestionErrorResponse(error);
  }
}
