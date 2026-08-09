import { getR2, MediaStorageUnavailableError } from "@/db/r2";
import { getCreatorSession } from "@/lib/auth/runtime";
import { canReadReportMedia } from "@/lib/ingestion/store";

type RouteContext = { params: Promise<{ key: string[] }> };

/** Media is readable only by its owner or while its exact ID is frozen into a public story. */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const { key } = await context.params;
    if (key.length < 2) return new Response("Not found.", { status: 404 });
    const r2Key = key.join("/");
    const creator = await getCreatorSession();
    if (!(await canReadReportMedia(r2Key, creator?.creatorId ?? null))) {
      return new Response("Not found.", { status: 404 });
    }

    const bucket = await getR2();
    const object = await bucket.get(r2Key);
    if (!object) return new Response("Not found.", { status: 404 });

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("cache-control", "private, no-store");
    headers.set("x-content-type-options", "nosniff");
    return new Response(object.body, { headers });
  } catch (error) {
    if (error instanceof MediaStorageUnavailableError) {
      return new Response("Media storage is unavailable.", { status: 503 });
    }
    throw error;
  }
}
