import { getR2, MediaStorageUnavailableError } from "@/db/r2";
import { ingestionErrorResponse, jsonError, requireApiCreator } from "@/lib/api/responses";
import { deleteReportMedia } from "@/lib/ingestion/store";
import { assertSameOriginBrowserMutation } from "@/lib/security/browser-request";

type RouteContext = { params: Promise<{ reportId: string; mediaId: string }> };

export async function DELETE(request: Request, context: RouteContext) {
  const creator = await requireApiCreator();
  if (!creator) return jsonError("unauthorized", "Creator sign-in required.", 401);
  try {
    assertSameOriginBrowserMutation(request);
    const { mediaId } = await context.params;
    const { r2Key } = await deleteReportMedia(creator.creatorId, mediaId);
    const bucket = await getR2();
    await bucket.delete(r2Key).catch(() => {});
    return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof MediaStorageUnavailableError) {
      return jsonError("production_dependency_unavailable", error.message, 503);
    }
    return ingestionErrorResponse(error);
  }
}
