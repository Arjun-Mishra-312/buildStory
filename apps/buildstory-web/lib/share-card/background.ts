/** Reads one of the bundled raster assets through the Worker's static-asset
 * binding and embeds it for Satori. Fetching the public URL from inside the
 * same Worker re-enters the application and stalls until the subrequest times
 * out, so this must never use global fetch(). */
export async function loadShareAssetDataUri(request: Request, assetPath: string): Promise<string | null> {
  try {
    const { env } = await import("cloudflare:workers");
    if (!env.ASSETS) return null;
    const assetUrl = new URL(assetPath, request.url);
    const response = await env.ASSETS.fetch(new Request(assetUrl));
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLocaleLowerCase("en-US");
    if (!contentType?.startsWith("image/")) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return `data:${contentType};base64,${btoa(binary)}`;
  } catch {
    return null;
  }
}

/** @deprecated Use loadShareAssetDataUri for both backgrounds and illustrations. */
export function loadShareBackgroundDataUri(request: Request, assetPath: string): Promise<string | null> {
  return loadShareAssetDataUri(request, assetPath);
}
