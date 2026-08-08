import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { SHARE_BACKGROUND_OPTIONS, STORY_BACKGROUND_OPTIONS, shareRenderBackgroundAsset } from "../lib/background-options";

function webpDimensions(asset: Buffer) {
  assert.equal(asset.toString("ascii", 0, 4), "RIFF");
  assert.equal(asset.toString("ascii", 8, 12), "WEBP");
  assert.equal(asset.toString("ascii", 12, 16), "VP8 ", "background must use a lossy VP8 WebP frame");
  assert.deepEqual([...asset.subarray(23, 26)], [0x9d, 0x01, 0x2a], "background must contain a valid VP8 frame header");

  return {
    width: asset.readUInt16LE(26) & 0x3fff,
    height: asset.readUInt16LE(28) & 0x3fff,
  };
}

async function assertAsset(assetUrl: string, expected: { width: number; height: number }) {
  const assetPath = path.join(process.cwd(), "public", assetUrl.replace(/^\//, ""));
  const [asset, details] = await Promise.all([readFile(assetPath), stat(assetPath)]);

  assert.deepEqual(webpDimensions(asset), expected, assetUrl);
  assert.ok(details.size <= 150 * 1024, `${assetUrl} must stay under 150 KB`);
}

async function assertJpegRenderAsset(assetUrl: string) {
  const assetPath = path.join(process.cwd(), "public", assetUrl.replace(/^\//, ""));
  const [asset, details] = await Promise.all([readFile(assetPath), stat(assetPath)]);
  assert.deepEqual([...asset.subarray(0, 3)], [0xff, 0xd8, 0xff], `${assetUrl} must be a JPEG`);
  assert.ok(details.size <= 200 * 1024, `${assetUrl} must stay under 200 KB`);
}

test("story background registry contains three optimized light/dark square pairs", async () => {
  assert.equal(STORY_BACKGROUND_OPTIONS.length, 3);
  assert.equal(new Set(STORY_BACKGROUND_OPTIONS.map((option) => option.id)).size, 3);

  for (const option of STORY_BACKGROUND_OPTIONS) {
    await assertAsset(option.assets.light, { width: 1024, height: 1024 });
    await assertAsset(option.assets.dark, { width: 1024, height: 1024 });
  }
});

test("share background registry contains five optimized light/dark portrait pairs", async () => {
  assert.equal(SHARE_BACKGROUND_OPTIONS.length, 5);
  assert.equal(new Set(SHARE_BACKGROUND_OPTIONS.map((option) => option.id)).size, 5);

  for (const option of SHARE_BACKGROUND_OPTIONS) {
    await assertAsset(option.assets.light, { width: 1080, height: 1350 });
    await assertAsset(option.assets.dark, { width: 1080, height: 1350 });
    await assertJpegRenderAsset(shareRenderBackgroundAsset(option.id, "light"));
    await assertJpegRenderAsset(shareRenderBackgroundAsset(option.id, "dark"));
  }
});
