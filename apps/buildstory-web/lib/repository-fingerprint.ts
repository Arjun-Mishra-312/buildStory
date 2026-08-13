export type CanonicalRemote = { host: string; path: string };

/**
 * Mirrors buildstory-scan's repository.ts canonicalizeRemote()
 * byte-for-byte, INCLUDING its known bug: the SCP-like branch is checked first
 * and has no way to distinguish "user@host:path" (real SCP syntax) from any
 * "scheme://host/path" URL, so for a plain https:// remote (the common case)
 * it captures the literal string "https" as the host and "host/owner/repo" as
 * the path, rather than the real hostname. This function must keep matching
 * that behavior exactly, bug included - it exists to reproduce the scanner's
 * output for fingerprints that are already stored, not to compute the
 * "correct" one. If the scanner's canonicalizeRemote is ever fixed, this must
 * be updated in lockstep or repo verification will stop matching newly
 * scanned projects.
 */
export function canonicalizeGitRemote(remote: string): CanonicalRemote | null {
  const trimmed = remote.trim();
  const scpLike = /^(?:[^@/\s]+@)?([^:/\s]+):(.+)$/.exec(trimmed);
  if (scpLike?.[1] && scpLike[2] && !/^[A-Za-z]:[\\/]/.test(trimmed)) {
    return {
      host: scpLike[1].toLocaleLowerCase("en-US"),
      path: scpLike[2].replace(/^\/+|\/+$/g, "").replace(/\.git$/i, ""),
    };
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "file:" || !parsed.hostname) return null;
    return {
      host: parsed.hostname.toLocaleLowerCase("en-US"),
      path: parsed.pathname.replace(/^\/+|\/+$/g, "").replace(/\.git$/i, ""),
    };
  } catch {
    return null;
  }
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Mirrors buildstory-scan's canonical-json.ts sha256() output format ("sha256:<hex>"). */
export async function sha256Fingerprint(value: string): Promise<`sha256:${string}`> {
  return `sha256:${await sha256Hex(value)}`;
}

/** The exact fingerprint the scanner would compute for this remote URL today, canonical-remote basis. */
export async function repositoryFingerprintFromRemote(remote: string): Promise<`sha256:${string}` | null> {
  const canonical = canonicalizeGitRemote(remote);
  if (!canonical) return null;
  return sha256Fingerprint(`${canonical.host}/${canonical.path}`);
}
