import assert from "node:assert/strict";
import test from "node:test";
import { sniffImageType, stripJpegExif } from "../lib/media/image";

function bytesOf(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

function segment(marker: number, payload: number[]): number[] {
  const length = payload.length + 2;
  return [0xff, marker, (length >> 8) & 0xff, length & 0xff, ...payload];
}

test("sniffImageType matches by magic bytes, not extension or claimed content-type", () => {
  assert.equal(sniffImageType(bytesOf(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0)), "image/png");
  assert.equal(sniffImageType(bytesOf(0xff, 0xd8, 0xff, 0xe0, 0, 0)), "image/jpeg");
  assert.equal(sniffImageType(bytesOf(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50)), "image/webp");
  assert.equal(sniffImageType(bytesOf(0x25, 0x50, 0x44, 0x46)), null, "a PDF's magic bytes never sniff as an image");
  assert.equal(sniffImageType(new TextEncoder().encode("<svg></svg>")), null, "SVG is not in the accepted allowlist");
});

test("stripJpegExif removes APP1 (EXIF) but preserves APP0 (JFIF), scan data, and EOI byte-for-byte", () => {
  const app0 = segment(0xe0, [0x4a, 0x46, 0x49, 0x46, 0x00]); // "JFIF\0"
  const app1Exif = segment(0xe1, [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, /* fake GPS-ish payload */ 1, 2, 3, 4, 5, 6, 7, 8]);
  const sos = segment(0xda, [0x01, 0x02, 0x03]);
  const scanData = [0x11, 0x22, 0x33, 0xff, 0x00, 0x44]; // includes a stuffed 0xFF00 that must survive untouched
  const eoi = [0xff, 0xd9];

  const original = new Uint8Array([0xff, 0xd8, ...app0, ...app1Exif, ...sos, ...scanData, ...eoi]);
  const stripped = stripJpegExif(original);

  const strippedBytes = Array.from(stripped);
  // APP1/EXIF payload must be gone entirely.
  assert.equal(strippedBytes.some((_, i) => strippedBytes[i] === 0x45 && strippedBytes[i + 1] === 0x78 && strippedBytes[i + 2] === 0x69 && strippedBytes[i + 3] === 0x66), false, "EXIF payload bytes do not appear anywhere in the output");
  // APP0/JFIF must survive.
  const expected = new Uint8Array([0xff, 0xd8, ...app0, ...sos, ...scanData, ...eoi]);
  assert.deepEqual(stripped, expected);
});

test("stripJpegExif fails safe on malformed input instead of corrupting the image", () => {
  const truncated = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00]); // declares a segment longer than the buffer
  assert.deepEqual(stripJpegExif(truncated), truncated);

  const notJpeg = new TextEncoder().encode("not a jpeg at all");
  assert.deepEqual(stripJpegExif(notJpeg), notJpeg);
});
