/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { getD1 } from "../db";
import { recomputeLeaderboard } from "../lib/leaderboard/d1-store";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  MEDIA?: R2Bucket;
  BUILDSTORY_ALLOWED_HOSTS?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

function isLoopbackHostname(hostname: string) {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLocaleLowerCase("en-US");
  if (normalized === "localhost" || normalized === "::1") return true;
  const octets = normalized.split(".");
  return (
    octets.length === 4 &&
    octets[0] === "127" &&
    octets.every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) <= 255)
  );
}

function hostRejection(request: Request, env: Env) {
  if (process.env.NODE_ENV !== "production") return null;
  const url = new URL(request.url);
  if (url.pathname === "/api/health" || url.pathname === "/api/ready") return null;
  if (isLoopbackHostname(url.hostname)) return null;
  const allowed = new Set(
    (env.BUILDSTORY_ALLOWED_HOSTS ?? process.env.BUILDSTORY_ALLOWED_HOSTS ?? "")
      .split(",")
      .map((host) => host.trim().toLocaleLowerCase("en-US"))
      .filter(Boolean),
  );
  if (allowed.size === 0) {
    return Response.json(
      { error: { code: "host_allowlist_unconfigured", message: "Service is not ready." } },
      { status: 503 },
    );
  }
  if (!allowed.has(url.hostname.toLocaleLowerCase("en-US"))) {
    return Response.json(
      { error: { code: "host_not_allowed", message: "Request host is not allowed." } },
      { status: 421 },
    );
  }
  if (url.protocol !== "https:") {
    return Response.json(
      { error: { code: "https_required", message: "HTTPS is required." } },
      { status: 400 },
    );
  }
  return null;
}

function base64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function inlineScriptHashes(html: string) {
  const hashes: string[] = [];
  const inlineScriptPattern = /<script(?![^>]*\ssrc=["'])[^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(inlineScriptPattern)) {
    const content = match[1] ?? "";
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
    hashes.push(`'sha256-${base64(new Uint8Array(digest))}'`);
  }
  return hashes.join(" ");
}

async function secured(response: Response, request: Request) {
  const headers = new Headers(response.headers);
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", "DENY");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=()");
  if (new URL(request.url).protocol === "https:") {
    headers.set("strict-transport-security", "max-age=31536000; includeSubDomains");
  }

  const contentType = headers.get("content-type") ?? "";
  if (contentType.toLocaleLowerCase("en-US").includes("text/html")) {
    const html = await response.text();
    // Vinext emits inline RSC/bootstrap scripts. Hash their exact contents
    // instead of weakening the policy with unsafe-inline or mutating the
    // markup after React has serialized it.
    const scriptHashes = await inlineScriptHashes(html);
    headers.set(
      "content-security-policy",
      `default-src 'self'; base-uri 'self'; connect-src 'self'; font-src 'self' data:; form-action 'self'; frame-ancestors 'none'; frame-src https://www.youtube-nocookie.com https://player.vimeo.com https://www.loom.com; img-src 'self' data: https:; object-src 'none'; script-src 'self'${scriptHashes ? ` ${scriptHashes}` : ""}; style-src 'self' 'unsafe-inline'`,
    );
    return new Response(html, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  headers.set(
    "content-security-policy",
    "default-src 'self'; base-uri 'self'; connect-src 'self'; font-src 'self' data:; form-action 'self'; frame-ancestors 'none'; img-src 'self' data: https:; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'",
  );
  // Re-wrapping a Response from its streamed .body (rather than a materialized
  // buffer) makes the edge serve it with Transfer-Encoding: chunked and no
  // Content-Length - fine for most clients, but some social-card crawlers
  // (LinkedIn's in particular) are known to stall indefinitely fetching a
  // chunked image with no declared length. Every non-text response here is
  // small (OG/share cards are tens of KB; R2-proxied media is capped at 5MB),
  // so buffering to get an accurate Content-Length is cheap and worth it.
  const buffer = await response.arrayBuffer();
  headers.set("content-length", String(buffer.byteLength));
  return new Response(buffer, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const rejected = hostRejection(request, env);
    if (rejected) return secured(rejected, request);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      const response = await handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
      return secured(response, request);
    }

    return secured(await handler.fetch(request, env, ctx), request);
  },
  async scheduled(event: ScheduledEvent, _env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil((async () => {
      const db = await getD1();
      if (event.cron === "0 * * * *") await recomputeLeaderboard("all-time");
      await db.batch([
        db.prepare("DELETE FROM buildstory_rate_limits WHERE window_start < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 hour')"),
        db.prepare("UPDATE buildstory_report_jobs SET status = 'pending', lease_until = NULL WHERE status = 'processing' AND lease_until < strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"),
        db.prepare("UPDATE buildstory_narrative_jobs SET status = 'pending', lease_until = NULL WHERE status = 'processing' AND lease_until < strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"),
        db.prepare("UPDATE buildstory_upload_sessions SET status = 'expired', status_detail = 'Connection expired.', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE status IN ('awaiting_scanner', 'scanner_authorized') AND expires_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"),
      ]);
    })().catch(() => undefined));
  },
};

export default worker;
