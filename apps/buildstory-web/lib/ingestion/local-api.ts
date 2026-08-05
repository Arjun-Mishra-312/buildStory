import { validHttpsOrigin } from "@/lib/config/runtime";

export const LOCAL_CONNECT_PATH = "/api/v1/cli/connect";
export const LOCAL_CONNECT_MAX_BYTES = 16 * 1024;

export class LocalApiRequestError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: string[],
  ) {
    super(message);
  }
}

export function isLoopbackHostname(hostname: string) {
  const normalized = hostname
    .replace(/^\[|\]$/g, "")
    .toLocaleLowerCase("en-US");
  if (normalized === "localhost" || normalized === "::1") return true;
  const octets = normalized.split(".");
  return (
    octets.length === 4 &&
    octets[0] === "127" &&
    octets.every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) <= 255)
  );
}

function localApiEnabled() {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.BUILDSTORY_LOCAL_API_ENABLED === "true"
  );
}

export function isLocalApiEnabled() {
  return localApiEnabled();
}

/**
 * Fail closed unless both the runtime and the request URL are explicitly local.
 * This is not a production API exposure control and must not replace a firewall.
 */
export function assertLoopbackApiRequest(request: Request) {
  if (!localApiEnabled()) {
    throw new LocalApiRequestError(
      "local_api_disabled",
      "The Buildstory loopback API is disabled. Start the app in development with BUILDSTORY_LOCAL_API_ENABLED=true.",
      404,
    );
  }

  const requestUrl = new URL(request.url);
  if (!isLoopbackHostname(requestUrl.hostname)) {
    throw new LocalApiRequestError(
      "loopback_required",
      "This development API accepts requests only on localhost or a 127.0.0.0/8 or ::1 address.",
      403,
    );
  }

  const originHeader = request.headers.get("origin");
  if (originHeader) {
    let originUrl: URL;
    try {
      originUrl = new URL(originHeader);
    } catch {
      throw new LocalApiRequestError(
        "invalid_origin",
        "The request Origin header is invalid.",
        403,
      );
    }
    if (
      !isLoopbackHostname(originUrl.hostname) ||
      originUrl.origin !== requestUrl.origin
    ) {
      throw new LocalApiRequestError(
        "cross_site_request_refused",
        "Cross-origin browsers cannot call the Buildstory loopback API.",
        403,
      );
    }
  }

  if (request.headers.get("sec-fetch-site") === "cross-site") {
    throw new LocalApiRequestError(
      "cross_site_request_refused",
      "Cross-site browser requests cannot call the Buildstory loopback API.",
      403,
    );
  }
}

/**
 * Only true once BUILDSTORY_PUBLIC_ORIGIN is itself valid. Never trust a
 * cached readiness check here - /api/ready reports config health for the
 * deploy platform's own routing decision, it does not gate individual
 * requests, so each request path re-validates independently.
 */
export function isHostedCliEnabled() {
  return process.env.NODE_ENV === "production" && validHttpsOrigin(process.env.BUILDSTORY_PUBLIC_ORIGIN);
}

/**
 * The production counterpart to assertLoopbackApiRequest: instead of
 * requiring the request to be loopback, it requires the request to land on
 * the single configured public origin - the same origin the CLI's --remote
 * (or an operator's --allow-host) is pinned to. Every other guarantee
 * (bearer-only auth, no cookies, cross-site refusal) is identical.
 */
export function assertHostedCliRequest(request: Request) {
  if (!isHostedCliEnabled()) {
    throw new LocalApiRequestError(
      "hosted_cli_unavailable",
      "The hosted scanner API is not configured on this deployment.",
      503,
    );
  }
  const publicOrigin = new URL(process.env.BUILDSTORY_PUBLIC_ORIGIN!).origin;
  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== publicOrigin) {
    throw new LocalApiRequestError(
      "cli_host_not_allowed",
      "This API accepts requests only on the deployment's configured public origin.",
      403,
    );
  }

  const originHeader = request.headers.get("origin");
  if (originHeader) {
    let originUrl: URL;
    try {
      originUrl = new URL(originHeader);
    } catch {
      throw new LocalApiRequestError(
        "invalid_origin",
        "The request Origin header is invalid.",
        403,
      );
    }
    if (originUrl.origin !== publicOrigin) {
      throw new LocalApiRequestError(
        "cross_site_request_refused",
        "Cross-origin browsers cannot call the Buildstory CLI API.",
        403,
      );
    }
  }

  if (request.headers.get("sec-fetch-site") === "cross-site") {
    throw new LocalApiRequestError(
      "cross_site_request_refused",
      "Cross-site browser requests cannot call the Buildstory CLI API.",
      403,
    );
  }
}

/** Dispatches to the hosted gate in production, the loopback gate everywhere else. Every /api/v1/cli/* route calls this, never the two gates directly. */
export function assertCliRequest(request: Request) {
  if (process.env.NODE_ENV === "production") {
    assertHostedCliRequest(request);
  } else {
    assertLoopbackApiRequest(request);
  }
}

export function loopbackApiBaseUrl(request: Request) {
  const url = new URL(request.url);
  if (!isLoopbackHostname(url.hostname)) {
    return "http://localhost:3000/";
  }
  return `${url.protocol}//${url.host}/`;
}

/** The base URL shown to a creator for their `buildstory connect` command hint: the public origin in production, loopback in development. */
export function cliApiBaseUrl(request: Request) {
  if (process.env.NODE_ENV === "production" && isHostedCliEnabled()) {
    return `${new URL(process.env.BUILDSTORY_PUBLIC_ORIGIN!).origin}/`;
  }
  return loopbackApiBaseUrl(request);
}

export function absoluteLoopbackUrl(request: Request, pathname: string) {
  return new URL(pathname.replace(/^\//, ""), loopbackApiBaseUrl(request)).href;
}

export function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+([^\s]+)$/i);
  return match?.[1] ?? null;
}

export async function readBoundedJson(request: Request, maxBytes: number) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLocaleLowerCase("en-US").includes("application/json")) {
    throw new LocalApiRequestError(
      "unsupported_media_type",
      "Send Content-Type: application/json.",
      415,
    );
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new LocalApiRequestError(
      "payload_too_large",
      `The request exceeds the ${maxBytes}-byte local API limit.`,
      413,
    );
  }

  const raw = await request.text();
  const byteLength = new TextEncoder().encode(raw).byteLength;
  if (byteLength > maxBytes) {
    throw new LocalApiRequestError(
      "payload_too_large",
      `The request exceeds the ${maxBytes}-byte local API limit.`,
      413,
    );
  }
  if (!raw.trim()) {
    throw new LocalApiRequestError(
      "invalid_json",
      "A JSON request body is required.",
      400,
    );
  }

  try {
    return {
      raw,
      value: JSON.parse(raw) as unknown,
      byteLength,
    };
  } catch {
    throw new LocalApiRequestError(
      "invalid_json",
      "The request body must be valid JSON.",
      400,
    );
  }
}

export const localApiResponseHeaders = {
  "cache-control": "no-store, max-age=0",
  pragma: "no-cache",
  "x-content-type-options": "nosniff",
} as const;
