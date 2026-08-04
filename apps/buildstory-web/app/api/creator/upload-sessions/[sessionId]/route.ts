import { ingestionErrorResponse, jsonError, requireApiCreator } from "@/lib/api/responses";
import { getUploadSession } from "@/lib/ingestion/store";

type RouteContext = { params: Promise<{ sessionId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const creator = await requireApiCreator();
  if (!creator) return jsonError("unauthorized", "Creator sign-in required.", 401);
  try {
    const { sessionId } = await context.params;
    return Response.json(
      { session: await getUploadSession(creator.creatorId, sessionId) },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return ingestionErrorResponse(error);
  }
}
