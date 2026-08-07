import { getR2, MediaStorageUnavailableError } from "@/db/r2";

type RouteContext = { params: Promise<{ key: string[] }> };

/**
 * Public, unauthenticated object serving for creator-uploaded artifact
 * media. Access control is by unguessable key (a random UUID filename), the
 * same model as most CDN-served attachments - there is no per-request
 * publication-status check here, since that would mean a database round
 * trip on every image load. Unpublishing a story hides the image from the
 * story page but does not itself revoke the URL; only actually deleting the
 * media (DELETE .../media/[mediaId]) removes the underlying object.
 */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const { key } = await context.params;
    if (key.length < 2) return new Response("Not found.", { status: 404 });
    const r2Key = key.join("/");

    const bucket = await getR2();
    const object = await bucket.get(r2Key);
    if (!object) return new Response("Not found.", { status: 404 });

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("cache-control", "public, max-age=31536000, immutable");
    headers.set("x-content-type-options", "nosniff");
    return new Response(object.body, { headers });
  } catch (error) {
    if (error instanceof MediaStorageUnavailableError) {
      return new Response("Media storage is unavailable.", { status: 503 });
    }
    throw error;
  }
}
