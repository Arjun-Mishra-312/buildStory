import type { ReactNode } from "react";
import { loadShareCardFonts } from "./fonts";

/**
 * Single home for the dynamic `await import("workers-og")`. yoga-wasm-web
 * (a workers-og dependency) uses a Wrangler/Miniflare-specific `.wasm`
 * import that plain Node can't resolve - tests/rendered-html.test.mjs walks
 * the compiled server bundle's eager module graph under plain Node, so a
 * static top-level import here would break that suite. Every card route
 * must reach workers-og only through this module (imported normally, not
 * dynamically, by routes) so the wasm-triggering import stays deferred into
 * its own chunk no matter which route renders a card.
 */
async function loadImageResponse() {
  const { ImageResponse } = await import("workers-og");
  return ImageResponse;
}

export async function renderShareCard(
  element: ReactNode,
  options: { width: number; height: number; headers?: HeadersInit; status?: number },
): Promise<Response> {
  const ImageResponse = await loadImageResponse();
  const fonts = await loadShareCardFonts();
  return new ImageResponse(element, {
    width: options.width,
    height: options.height,
    fonts: fonts.length ? fonts : undefined,
    headers: options.headers,
    status: options.status,
  });
}
