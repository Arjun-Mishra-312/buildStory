export class BrowserRequestSecurityError extends Error {
  readonly isBuildstoryIngestionError = true;

  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** Creator mutation APIs are browser-only and require an exact same-origin Origin. */
export function assertSameOriginBrowserMutation(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) {
    throw new BrowserRequestSecurityError(
      "origin_required",
      "Creator write requests require an Origin header.",
      403,
    );
  }
  let requestOrigin: string;
  try {
    requestOrigin = new URL(request.url).origin;
  } catch {
    throw new BrowserRequestSecurityError(
      "invalid_request_url",
      "The request URL is invalid.",
      400,
    );
  }
  if (origin !== requestOrigin || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new BrowserRequestSecurityError(
      "cross_site_request_refused",
      "Cross-site creator writes are not allowed.",
      403,
    );
  }
}
