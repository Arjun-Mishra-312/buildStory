/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
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

function secured(response: Response, request: Request) {
  const headers = new Headers(response.headers);
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", "DENY");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=()");
  headers.set(
    "content-security-policy",
    "default-src 'self'; base-uri 'self'; connect-src 'self'; font-src 'self' data:; form-action 'self'; frame-ancestors 'none'; img-src 'self' data: https:; object-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
  );
  if (new URL(request.url).protocol === "https:") {
    headers.set("strict-transport-security", "max-age=31536000; includeSubDomains");
  }
  return new Response(response.body, {
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
};

export default worker;
