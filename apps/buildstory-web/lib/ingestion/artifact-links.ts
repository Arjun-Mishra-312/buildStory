const MAX_ARTIFACT_URL_LENGTH = 2_000;

/**
 * Pure validation for creator-supplied artifact links (project/repo/video
 * URLs). Deliberately stricter than sanitizePublicText, which is built for
 * prose and would redact any URL outright - these fields exist specifically
 * to hold URLs the creator wants published. Only https URLs with no
 * embedded credentials are accepted; everything else is rejected outright
 * rather than silently mangled.
 */
export function normalizeArtifactUrl(value: string | null | undefined): { ok: true; value: string | null } | { ok: false } {
  if (value === null || value === undefined) return { ok: true, value: null };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { ok: true, value: null };
  if (trimmed.length > MAX_ARTIFACT_URL_LENGTH) return { ok: false };
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false };
  }
  if (url.protocol !== "https:") return { ok: false };
  if (url.username || url.password) return { ok: false };
  return { ok: true, value: url.toString() };
}

export type ArtifactLinksUpdate = {
  projectUrl?: string | null;
  repoUrl?: string | null;
  videoUrl?: string | null;
};
