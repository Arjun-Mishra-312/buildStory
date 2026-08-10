import { getR2, MediaStorageUnavailableError } from "@/db/r2";
import { ingestionErrorResponse, jsonError, requireApiCreator } from "@/lib/api/responses";
import { addReportMedia, getReport, listReportMedia } from "@/lib/ingestion/store";
import { sniffImageType, stripJpegExif } from "@/lib/media/image";
import { mediaObjectKey } from "@/lib/media/url";
import { moderateImageBytes } from "@/lib/moderation/image-moderation";
import { assertSameOriginBrowserMutation } from "@/lib/security/browser-request";
import { checkRateLimit } from "@/lib/social/rate-limit-dispatch";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};
const MEDIA_KINDS = new Set(["cover", "screenshot"]);

type RouteContext = { params: Promise<{ reportId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const creator = await requireApiCreator();
  if (!creator) return jsonError("unauthorized", "Creator sign-in required.", 401);
  try {
    const { reportId } = await context.params;
    await getReport(creator.creatorId, reportId); // ownership check; throws not_found otherwise
    const media = await listReportMedia(reportId);
    return Response.json({ media }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return ingestionErrorResponse(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  const creator = await requireApiCreator();
  if (!creator) return jsonError("unauthorized", "Creator sign-in required.", 401);

  try {
    assertSameOriginBrowserMutation(request);

    const kind = new URL(request.url).searchParams.get("kind") ?? "screenshot";
    if (!MEDIA_KINDS.has(kind)) {
      return jsonError("invalid_media_kind", "kind must be 'cover' or 'screenshot'.", 422);
    }

    const { reportId } = await context.params;
    // Ownership + report-state check up front, before touching R2 at all - a request for a
    // report the caller doesn't own (or that isn't ready to edit) never gets that far.
    await getReport(creator.creatorId, reportId);
    await checkRateLimit("report_media_upload", creator.creatorId, 20, 3_600, request);

    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_UPLOAD_BYTES) {
      return jsonError("payload_too_large", `Images must be ${MAX_UPLOAD_BYTES} bytes or smaller.`, 413);
    }

    const buffer = await request.arrayBuffer();
    if (buffer.byteLength === 0) {
      return jsonError("empty_upload", "The upload body was empty.", 422);
    }
    if (buffer.byteLength > MAX_UPLOAD_BYTES) {
      return jsonError("payload_too_large", `Images must be ${MAX_UPLOAD_BYTES} bytes or smaller.`, 413);
    }

    let bytes = new Uint8Array(buffer);
    const sniffed = sniffImageType(bytes);
    if (!sniffed) {
      return jsonError(
        "unsupported_media_type",
        "Only PNG, JPEG, and WebP images are accepted (checked by file content, not the declared type).",
        415,
      );
    }
    if (sniffed === "image/jpeg") {
      // Re-wrapped in a fresh Uint8Array so its buffer is a definite ArrayBuffer (not the
      // wider ArrayBufferLike stripJpegExif's signature allows) - R2Bucket.put() requires that.
      bytes = new Uint8Array(stripJpegExif(bytes));
    }

    // Content-based check, ahead of ever touching R2 - nothing lands in storage unreviewed.
    await moderateImageBytes(bytes, sniffed);

    const filename = `${crypto.randomUUID()}.${EXTENSION_BY_TYPE[sniffed]}`;
    const r2Key = mediaObjectKey(reportId, filename);

    const bucket = await getR2();
    await bucket.put(r2Key, bytes, { httpMetadata: { contentType: sniffed } });

    try {
      const media = await addReportMedia(creator.creatorId, reportId, {
        r2Key,
        contentType: sniffed,
        byteSize: bytes.byteLength,
        kind: kind as "cover" | "screenshot",
      });
      return Response.json({ media }, { status: 201, headers: { "cache-control": "no-store" } });
    } catch (error) {
      // Metadata write failed (most likely the per-report cap, in a race with a concurrent
      // upload) - the R2 object would otherwise be orphaned with no row pointing at it.
      await bucket.delete(r2Key).catch(() => {});
      throw error;
    }
  } catch (error) {
    if (error instanceof MediaStorageUnavailableError) {
      return jsonError("production_dependency_unavailable", error.message, 503);
    }
    return ingestionErrorResponse(error);
  }
}
