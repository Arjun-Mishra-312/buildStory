import { ingestionErrorResponse, jsonError, requireApiCreator } from "@/lib/api/responses";
import { publishReport } from "@/lib/ingestion/store";
import { assertSameOriginBrowserMutation } from "@/lib/security/browser-request";

type RouteContext = { params: Promise<{ reportId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const creator = await requireApiCreator();
  if (!creator) return jsonError("unauthorized", "Creator sign-in required.", 401);
  try {
    assertSameOriginBrowserMutation(request);
    const { reportId } = await context.params;
    const report = await publishReport(creator.creatorId, reportId);
    return Response.json(
      { publication: report.publication },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    return ingestionErrorResponse(error);
  }
}
