import { logOperationalEvent } from "@/lib/observability/log";

/** Same duck-typed shape lib/api/responses.ts's ingestionErrorResponse already recognizes, independent of either backend's own error class. */
export class ImageModerationError extends Error {
  readonly isBuildstoryIngestionError = true;

  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function unavailable(logCode: string): never {
  logOperationalEvent("error", "moderation.provider_unavailable", { code: logCode });
  throw new ImageModerationError(
    "moderation_unavailable",
    "Image review is temporarily unavailable. Please try again shortly.",
    503,
  );
}

/**
 * Blocks an upload synchronously, before its bytes ever reach R2, using
 * OpenAI's free omni-moderation endpoint (the only OpenAI moderation model
 * that accepts image input). Fails closed: if the provider key isn't
 * configured, or the call itself errors, the upload is rejected rather than
 * silently landing unmoderated - there is no async review queue for
 * uploaded images today (the caller publishes straight to R2 on success),
 * so "stored but unreviewed" is not an acceptable fallback state.
 */
export async function moderateImageBytes(
  bytes: Uint8Array,
  contentType: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const apiKey = process.env.BUILDSTORY_MODERATION_API_KEY;
  if (!apiKey) unavailable("not_configured");

  const dataUrl = `data:${contentType};base64,${toBase64(bytes)}`;
  let response: Response;
  try {
    response = await fetchImpl("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: "omni-moderation-latest",
        input: [{ type: "image_url", image_url: { url: dataUrl } }],
      }),
    });
  } catch {
    unavailable("fetch_failed");
  }

  if (!response.ok) unavailable(`provider_${response.status}`);

  const payload = (await response.json().catch(() => null)) as
    | { results?: Array<{ flagged: boolean; categories: Record<string, boolean> }> }
    | null;
  const result = payload?.results?.[0];
  if (!result) unavailable("empty_result");

  if (result.flagged) {
    logOperationalEvent("warn", "moderation.image_flagged", { code: "image_flagged" });
    throw new ImageModerationError(
      "image_flagged",
      "This image was automatically flagged and can't be uploaded. If you believe this is a mistake, contact support.",
      422,
    );
  }
}
