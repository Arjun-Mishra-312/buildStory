import assert from "node:assert/strict";
import test from "node:test";
import { ImageModerationError, moderateImageBytes } from "../lib/moderation/image-moderation";

function moderationResponse(flagged: boolean, categories: Record<string, boolean> = {}) {
  return new Response(JSON.stringify({ results: [{ flagged, categories }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

const bytes = new Uint8Array([1, 2, 3]);

test("moderateImageBytes fails closed when no provider key is configured", async () => {
  const previous = process.env.BUILDSTORY_MODERATION_API_KEY;
  delete process.env.BUILDSTORY_MODERATION_API_KEY;
  try {
    await assert.rejects(
      () => moderateImageBytes(bytes, "image/png", async () => moderationResponse(false)),
      (error: unknown) => error instanceof ImageModerationError && error.code === "moderation_unavailable" && error.status === 503,
    );
  } finally {
    if (previous !== undefined) process.env.BUILDSTORY_MODERATION_API_KEY = previous;
  }
});

test("moderateImageBytes resolves silently when the provider clears the image", async () => {
  process.env.BUILDSTORY_MODERATION_API_KEY = "test-key";
  await moderateImageBytes(bytes, "image/png", async () => moderationResponse(false));
});

test("moderateImageBytes rejects with image_flagged when the provider flags the image", async () => {
  process.env.BUILDSTORY_MODERATION_API_KEY = "test-key";
  await assert.rejects(
    () => moderateImageBytes(bytes, "image/png", async () => moderationResponse(true, { sexual: true })),
    (error: unknown) => error instanceof ImageModerationError && error.code === "image_flagged" && error.status === 422,
  );
});

test("moderateImageBytes fails closed when the provider call throws", async () => {
  process.env.BUILDSTORY_MODERATION_API_KEY = "test-key";
  await assert.rejects(
    () => moderateImageBytes(bytes, "image/png", async () => { throw new Error("network down"); }),
    (error: unknown) => error instanceof ImageModerationError && error.code === "moderation_unavailable" && error.status === 503,
  );
});

test("moderateImageBytes fails closed when the provider responds with a non-2xx status", async () => {
  process.env.BUILDSTORY_MODERATION_API_KEY = "test-key";
  await assert.rejects(
    () => moderateImageBytes(bytes, "image/png", async () => new Response("nope", { status: 500 })),
    (error: unknown) => error instanceof ImageModerationError && error.code === "moderation_unavailable" && error.status === 503,
  );
});
