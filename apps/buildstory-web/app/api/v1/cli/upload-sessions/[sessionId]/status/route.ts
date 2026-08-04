import { ingestionErrorResponse, jsonError } from "@/lib/api/responses";
import {
  assertLoopbackApiRequest,
  bearerToken,
  localApiResponseHeaders,
} from "@/lib/ingestion/local-api";
import { getLocalUploadStatus } from "@/lib/ingestion/store";

type RouteContext = { params: Promise<{ sessionId: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    assertLoopbackApiRequest(request);
    const token = bearerToken(request);
    if (!token) {
      return jsonError(
        "missing_upload_token",
        "The read-only status request requires the connection Bearer grant.",
        401,
      );
    }
    const { sessionId } = await context.params;
    const status = await getLocalUploadStatus(sessionId, token);
    return Response.json(status, { headers: localApiResponseHeaders });
  } catch (error) {
    return ingestionErrorResponse(error);
  }
}
