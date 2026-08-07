declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    /** Creator-uploaded artifact media (report cover images/screenshots). See db/r2.ts. */
    MEDIA?: R2Bucket;
  }
}
