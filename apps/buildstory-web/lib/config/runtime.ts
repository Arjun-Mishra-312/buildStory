import { isLoopbackHostname } from "@/lib/ingestion/local-api";

export type RuntimeIssue = {
  code: string;
  variable: string;
};

export function validHttpsOrigin(value: string | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === "" &&
      !isLoopbackHostname(url.hostname)
    );
  } catch {
    return false;
  }
}

export function allowedHosts(value = process.env.BUILDSTORY_ALLOWED_HOSTS) {
  return new Set(
    (value ?? "")
      .split(",")
      .map((host) => host.trim().toLocaleLowerCase("en-US"))
      .filter(Boolean),
  );
}

export function productionRuntimeIssues(): RuntimeIssue[] {
  if (process.env.NODE_ENV !== "production") return [];
  const issues: RuntimeIssue[] = [];
  const add = (code: string, variable: string) => issues.push({ code, variable });

  if (
    !process.env.AUTH_SECRET ||
    process.env.AUTH_SECRET.length < 32 ||
    /[<>]/.test(process.env.AUTH_SECRET)
  ) {
    add("missing_or_short_secret", "AUTH_SECRET");
  }
  if (!process.env.AUTH_GOOGLE_ID || /[<>]/.test(process.env.AUTH_GOOGLE_ID)) {
    add("missing_value", "AUTH_GOOGLE_ID");
  }
  if (
    !process.env.AUTH_GOOGLE_SECRET ||
    /[<>]/.test(process.env.AUTH_GOOGLE_SECRET)
  ) {
    add("missing_value", "AUTH_GOOGLE_SECRET");
  }
  if (!validHttpsOrigin(process.env.BUILDSTORY_PUBLIC_ORIGIN)) {
    add("invalid_https_origin", "BUILDSTORY_PUBLIC_ORIGIN");
  }
  const hosts = allowedHosts();
  if (hosts.size === 0) {
    add("missing_value", "BUILDSTORY_ALLOWED_HOSTS");
  } else {
    for (const host of hosts) {
      try {
        const parsed = new URL(`https://${host}`);
        if (parsed.hostname !== host || parsed.port || parsed.pathname !== "/") {
          add("invalid_host", "BUILDSTORY_ALLOWED_HOSTS");
          break;
        }
      } catch {
        add("invalid_host", "BUILDSTORY_ALLOWED_HOSTS");
        break;
      }
    }
  }
  if (validHttpsOrigin(process.env.BUILDSTORY_PUBLIC_ORIGIN)) {
    const originHost = new URL(process.env.BUILDSTORY_PUBLIC_ORIGIN!).hostname;
    if (!hosts.has(originHost)) {
      add("public_origin_host_not_allowed", "BUILDSTORY_ALLOWED_HOSTS");
    }
  }
  if (process.env.BUILDSTORY_STORE !== "d1") {
    add("durable_store_required", "BUILDSTORY_STORE");
  }
  if (process.env.BUILDSTORY_DEV_AUTH_BYPASS === "true") {
    add("development_bypass_forbidden", "BUILDSTORY_DEV_AUTH_BYPASS");
  }
  if (process.env.BUILDSTORY_LOCAL_API_ENABLED !== "false") {
    add("loopback_api_must_be_disabled", "BUILDSTORY_LOCAL_API_ENABLED");
  }
  if (process.env.BUILDSTORY_LLM_API_KEY && !process.env.BUILDSTORY_LLM_BASE_URL) {
    add("missing_value", "BUILDSTORY_LLM_BASE_URL");
  }
  if (process.env.BUILDSTORY_LLM_BASE_URL) {
    try {
      const llmUrl = new URL(process.env.BUILDSTORY_LLM_BASE_URL);
      if (llmUrl.protocol !== "https:" || llmUrl.username || llmUrl.password || llmUrl.search || llmUrl.hash) {
        add("invalid_https_origin", "BUILDSTORY_LLM_BASE_URL");
      }
    } catch {
      add("invalid_https_origin", "BUILDSTORY_LLM_BASE_URL");
    }
  }
  if (
    process.env.BUILDSTORY_LOG_LEVEL &&
    !["error", "warn", "info"].includes(process.env.BUILDSTORY_LOG_LEVEL)
  ) {
    add("invalid_value", "BUILDSTORY_LOG_LEVEL");
  }
  return issues;
}
