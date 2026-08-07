/**
 * Minimal in-memory stand-in for the subset of the R2Bucket API this
 * codebase actually calls (put/get/delete). Test-only - real requests
 * always go through the Miniflare-emulated or real R2 binding via
 * db/r2.ts's getR2().
 */
export class MemoryR2Bucket {
  private readonly objects = new Map<string, { body: Uint8Array; contentType: string }>();

  async put(key: string, value: Uint8Array, options?: { httpMetadata?: { contentType?: string } }) {
    this.objects.set(key, { body: value, contentType: options?.httpMetadata?.contentType ?? "application/octet-stream" });
    return { key };
  }

  async get(key: string) {
    const object = this.objects.get(key);
    if (!object) return null;
    return {
      body: object.body,
      writeHttpMetadata: (headers: Headers) => headers.set("content-type", object.contentType),
    };
  }

  async delete(keys: string | string[]) {
    for (const key of Array.isArray(keys) ? keys : [keys]) this.objects.delete(key);
  }

  /** Test-only inspection helper - not part of the real R2Bucket API. */
  has(key: string): boolean {
    return this.objects.has(key);
  }

  /** Test-only inspection helper - not part of the real R2Bucket API. */
  size(): number {
    return this.objects.size;
  }
}
