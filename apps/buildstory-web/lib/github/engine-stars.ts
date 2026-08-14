import { ENGINE_GITHUB_REPO } from "@/lib/marketing/generate";

const CACHE_MS = 60 * 60 * 1000;

let cached: { count: number; fetchedAt: number } | null = null;

export function formatStarCount(count: number): string {
  if (count < 1000) return String(count);
  if (count < 10_000) {
    const tenths = Math.round(count / 100) / 10;
    return `${tenths}k`;
  }
  return `${Math.round(count / 1000)}k`;
}

export async function getEngineStarCount(): Promise<number | null> {
  if (cached && Date.now() - cached.fetchedAt < CACHE_MS) return cached.count;
  try {
    const response = await fetch(`https://api.github.com/repos/${ENGINE_GITHUB_REPO}`, {
      headers: { accept: "application/vnd.github+json", "user-agent": "buildstory" },
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) return cached?.count ?? null;
    const body = (await response.json()) as { stargazers_count?: unknown };
    const count = typeof body.stargazers_count === "number" && Number.isFinite(body.stargazers_count)
      ? Math.max(0, Math.floor(body.stargazers_count))
      : null;
    if (count == null) return cached?.count ?? null;
    cached = { count, fetchedAt: Date.now() };
    return count;
  } catch {
    return cached?.count ?? null;
  }
}
