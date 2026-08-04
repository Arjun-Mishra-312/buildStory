import { ingestionErrorResponse, jsonError } from "@/lib/api/responses";
import {
  assertLoopbackApiRequest,
  bearerToken,
  localApiResponseHeaders,
} from "@/lib/ingestion/local-api";
import { getLocalReport } from "@/lib/ingestion/store";

type RouteContext = { params: Promise<{ reportId: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    assertLoopbackApiRequest(request);
    const token = bearerToken(request);
    if (!token) {
      return jsonError(
        "missing_upload_token",
        "The read-only report request requires the connection Bearer grant.",
        401,
      );
    }
    const { reportId } = await context.params;
    const report = await getLocalReport(reportId, token);
    return Response.json(
      { protocolVersion: "1.0", status: "ready", report },
      { headers: localApiResponseHeaders },
    );
  } catch (error) {
    return ingestionErrorResponse(error);
  }
}
