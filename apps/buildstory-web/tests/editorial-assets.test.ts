import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const illustrations = [
  "feed-quiet",
  "search-no-results",
  "leaderboard-first-rank",
  "profile-first-story",
  "studio-first-story",
] as const;

const themes = ["light", "dark"] as const;
const assetDirectory = path.join(process.cwd(), "public", "assets", "illustrations");
const maxBytes = 250 * 1024;

function webpDimensions(asset: Buffer) {
  assert.equal(asset.toString("ascii", 0, 4), "RIFF");
  assert.equal(asset.toString("ascii", 8, 12), "WEBP");
  assert.equal(asset.toString("ascii", 12, 16), "VP8 ", "asset must use a lossy VP8 WebP frame");
  assert.deepEqual([...asset.subarray(23, 26)], [0x9d, 0x01, 0x2a], "asset must contain a valid VP8 frame header");

  return {
    width: asset.readUInt16LE(26) & 0x3fff,
    height: asset.readUInt16LE(28) & 0x3fff,
  };
}

test("editorial illustrations are paired, optimized 640px WebP assets", async () => {
  for (const illustration of illustrations) {
    for (const theme of themes) {
      const filename = `${illustration}-${theme}.webp`;
      const assetPath = path.join(assetDirectory, filename);
      const [asset, details] = await Promise.all([readFile(assetPath), stat(assetPath)]);
      const dimensions = webpDimensions(asset);

      assert.equal(dimensions.width, 640, `${filename} width`);
      assert.equal(dimensions.height, 640, `${filename} height`);
      assert.ok(details.size <= maxBytes, `${filename} must stay under 250 KB`);
    }
  }
});
