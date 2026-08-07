let testBucket: R2Bucket | null = null;

export class MediaStorageUnavailableError extends Error {
  constructor() {
    super(
      "The required Cloudflare R2 binding `MEDIA` is unavailable. Configure the R2 binding before serving artifact media uploads.",
    );
  }
}

export async function getR2(): Promise<R2Bucket> {
  if (testBucket) return testBucket;
  const { env } = await import("cloudflare:workers");
  if (!env.MEDIA) throw new MediaStorageUnavailableError();
  return env.MEDIA;
}

/** Test-only seam: production callers must continue to resolve the Worker R2 binding. */
export function __setR2ForTests(bucket: R2Bucket | null) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("__setR2ForTests is only available when NODE_ENV=test.");
  }
  testBucket = bucket;
}
