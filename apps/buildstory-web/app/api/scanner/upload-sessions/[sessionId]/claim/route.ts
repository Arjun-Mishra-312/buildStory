import { ingestionErrorResponse, jsonError } from "@/lib/api/responses";
import { assertLoopbackApiRequest } from "@/lib/ingestion/local-api";
import { claimUploadSession } from "@/lib/ingestion/store";

type RouteContext = { params: Promise<{ sessionId: string }> };

/** Scanner endpoint: authenticates only the device code, never browser cookies. */
export async function POST(request: Request, context: RouteContext) {
  try {
    assertLoopbackApiRequest(request);
  } catch (error) {
    return ingestionErrorResponse(error);
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return jsonError("unsupported_media_type", "Expected application/json.", 415);
  }
  const body = (await request.json().catch(() => null)) as { userCode?: unknown } | null;
  if (!body || typeof body.userCode !== "string") {
    return jsonError("invalid_request", "userCode is required.", 400);
  }
  try {
    const { sessionId } = await context.params;
    const claim = await claimUploadSession(sessionId, body.userCode);
    return Response.json(claim, {
      status: 201,
      headers: {
        "cache-control": "no-store",
        pragma: "no-cache",
      },
    });
  } catch (error) {
    return ingestionErrorResponse(error);
  }
}
