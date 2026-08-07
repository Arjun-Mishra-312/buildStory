export type SniffedImageType = "image/png" | "image/jpeg" | "image/webp";

/**
 * Sniffs actual file bytes rather than trusting a client-declared
 * content-type - a request claiming "image/png" with different magic bytes
 * is rejected outright by the caller, not silently stored under the wrong type.
 */
export function sniffImageType(bytes: Uint8Array): SniffedImageType | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

/**
 * Strips APP1-APP15 marker segments (EXIF, XMP, and similar metadata that can
 * carry GPS coordinates, device identifiers, or timestamps a creator doesn't
 * intend to publish) from a JPEG, leaving JFIF (APP0), image data, and every
 * other segment untouched. Fails safe: on anything that doesn't parse as a
 * well-formed marker sequence, returns the original bytes unmodified rather
 * than risk emitting a corrupted image - metadata stripping is
 * defense-in-depth here, not the primary privacy boundary (that's the
 * creator's own decision to upload a public image).
 *
 * PNG and WebP are not handled here (rarer to carry GPS EXIF from ordinary
 * screenshot/export tools); see lib/media/image.ts callers for the scope note.
 */
export function stripJpegExif(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return bytes;

  const out: number[] = [0xff, 0xd8];
  let offset = 2;

  while (offset + 1 < bytes.length) {
    if (bytes[offset] !== 0xff) return bytes; // not a marker where we expected one - bail safely

    const marker = bytes[offset + 1];

    if (marker === 0xd9) {
      out.push(0xff, 0xd9);
      return new Uint8Array(out);
    }

    if (marker >= 0xd0 && marker <= 0xd7 || marker === 0x01) {
      out.push(0xff, marker);
      offset += 2;
      continue;
    }

    if (offset + 3 >= bytes.length) return bytes;
    const segmentLength = (bytes[offset + 2]! << 8) | bytes[offset + 3]!;
    if (segmentLength < 2 || offset + 2 + segmentLength > bytes.length) return bytes;

    if (marker === 0xda) {
      // Start of scan: copy its header, then the remaining (compressed) bytes verbatim.
      for (let i = offset; i < offset + 2 + segmentLength; i += 1) out.push(bytes[i]!);
      for (let i = offset + 2 + segmentLength; i < bytes.length; i += 1) out.push(bytes[i]!);
      return new Uint8Array(out);
    }

    const isMetadataApp = marker >= 0xe1 && marker <= 0xef; // APP1 (EXIF/XMP) through APP15; APP0/JFIF kept
    if (!isMetadataApp) {
      for (let i = offset; i < offset + 2 + segmentLength; i += 1) out.push(bytes[i]!);
    }
    offset += 2 + segmentLength;
  }

  return bytes; // ran off the end without hitting EOI/SOS - malformed, bail safely
}
