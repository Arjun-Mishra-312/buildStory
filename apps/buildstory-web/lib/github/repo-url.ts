export type GithubRepoRef = { owner: string; repo: string };

/**
 * Parses a github.com repository URL into {owner, repo} for calling the
 * GitHub REST API. Deliberately separate from lib/repository-fingerprint.ts's
 * canonicalizeGitRemote(), which must mirror the scanner's canonicalization
 * bug-for-bug for fingerprint matching - this one needs to be CORRECT, since
 * it drives an actual API call to https://api.github.com/repos/{owner}/{repo}.
 */
export function parseGithubRepoUrl(value: string): GithubRepoRef | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.hostname.toLocaleLowerCase("en-US") !== "github.com") return null;

  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length < 2) return null;
  const [owner, repoRaw] = segments;
  const repo = repoRaw.replace(/\.git$/i, "");
  if (!owner || !repo) return null;
  if (!/^[A-Za-z0-9-]+$/.test(owner) || !/^[A-Za-z0-9._-]+$/.test(repo)) return null;

  return { owner, repo };
}
