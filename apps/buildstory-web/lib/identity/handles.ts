/**
 * Handle generation and reservation shared by both store backends
 * (d1-store.ts, mock-store.ts) so the same rules apply regardless of which
 * one is active. Pure and deterministic - no I/O, no database access.
 */

const MIN_HANDLE_LENGTH = 3;
const MAX_HANDLE_LENGTH = 32;
const MAX_SUFFIXED_ATTEMPTS = 50;

/**
 * Route segments this app currently serves at the root, plus generic
 * product/ops terms that would be confusing or exploitable as a handle
 * (impersonation, phishing-style "official"-sounding names). Extend this
 * list before adding any new top-level route.
 */
export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
  // Current top-level routes (apps/buildstory-web/app/*)
  "api",
  "dashboard",
  "studio",
  "explore",
  "p",
  "signin",
  "search",
  // Likely near-term routes worth reserving now rather than after launch
  "signout",
  "login",
  "logout",
  "settings",
  "admin",
  "about",
  "help",
  "support",
  "terms",
  "privacy",
  "pricing",
  "u",
  "users",
  "static",
  "assets",
  "public",
  "health",
  "ready",
  "robots.txt",
  "sitemap.xml",
  "favicon.ico",
  // Product/brand terms
  "buildstory",
  "story-scanner",
  "creator",
  "official",
  "team",
  "staff",
  "moderator",
  "root",
  "null",
  "undefined",
]);

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase("en-US")
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_HANDLE_LENGTH);
}

/** Deterministic base handle from a display name or email local-part. */
export function baseHandleFrom(displayName: string, email: string): string {
  const fromName = normalize(displayName);
  if (fromName.length >= MIN_HANDLE_LENGTH) return fromName;
  const fromEmail = normalize(email.split("@")[0] ?? "");
  if (fromEmail.length >= MIN_HANDLE_LENGTH) return fromEmail;
  return "builder";
}

/**
 * Yields candidate handles for a caller to try in priority order (base
 * first, then -2, -3, ...) against its own storage until one is free and
 * not reserved. Bounded so a pathological collision streak can't loop
 * forever.
 */
export function* candidateHandles(base: string): Generator<string> {
  const normalized = normalize(base) || "builder";
  if (!RESERVED_HANDLES.has(normalized)) yield normalized;
  for (let suffix = 2; suffix <= MAX_SUFFIXED_ATTEMPTS; suffix += 1) {
    const candidate = `${normalized.slice(0, MAX_HANDLE_LENGTH - String(suffix).length - 1)}-${suffix}`;
    if (!RESERVED_HANDLES.has(candidate)) yield candidate;
  }
}

export function isReservedHandle(handle: string): boolean {
  return RESERVED_HANDLES.has(normalize(handle));
}

/** Deterministic base slug from a project/repository display name. */
export function baseSlugFrom(displayName: string): string {
  const normalized = normalize(displayName);
  return normalized.length >= MIN_HANDLE_LENGTH ? normalized : "project";
}

/**
 * Yields candidate slugs (base, base-2, base-3, ...) for a caller to try
 * against its own uniqueness scope (e.g. per-owner, not global like
 * handles). Bounded for the same reason as candidateHandles.
 */
export function* candidateSlugs(base: string): Generator<string> {
  const normalized = normalize(base) || "project";
  yield normalized;
  for (let suffix = 2; suffix <= MAX_SUFFIXED_ATTEMPTS; suffix += 1) {
    yield `${normalized.slice(0, MAX_HANDLE_LENGTH - String(suffix).length - 1)}-${suffix}`;
  }
}
