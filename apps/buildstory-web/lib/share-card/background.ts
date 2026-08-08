/** Fetches one of the bundled WebP backgrounds and embeds it for Satori. */
export async function loadShareBackgroundDataUri(request: Request, assetPath: string): Promise<string | null> {
  try {
    const assetUrl = new URL(assetPath, request.url);
    const response = await fetch(assetUrl);
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return `data:image/webp;base64,${btoa(binary)}`;
  } catch {
    return null;
  }
}
