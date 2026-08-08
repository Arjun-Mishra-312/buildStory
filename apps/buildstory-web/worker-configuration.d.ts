declare namespace Cloudflare {
  interface Env {
    /** Vinext's bundled public/static files. */
    ASSETS?: Fetcher;
    DB?: D1Database;
    /** Creator-uploaded artifact media (report cover images/screenshots). See db/r2.ts. */
    MEDIA?: R2Bucket;
  }
}
