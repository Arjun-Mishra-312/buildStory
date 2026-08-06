import { getD1 } from "@/db";
import { SocialError } from "./contracts";

/** Retention window for stale rate-limit rows; a check opportunistically deletes anything older than this. */
const STALE_WINDOW_MS = 60 * 60 * 1_000;

function windowStartIso(windowSeconds: number, now: Date): string {
  const windowMs = windowSeconds * 1_000;
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs).toISOString();
}

/**
 * Fixed-window rate limit backed by D1. Race-safe: a single upsert-and-read
 * statement, no separate check-then-increment step. Throws SocialError
 * "rate_limited" (429) when the caller's count for this window exceeds limit.
 */
export async function checkRateLimit(
  scope: string,
  identity: string,
  limit: number,
  windowSeconds: number,
  now = new Date(),
): Promise<void> {
  const db = await getD1();
  const nowIso = now.toISOString();
  const windowStart = windowStartIso(windowSeconds, now);
  const id = `${scope}:${identity}:${windowStart}`;

  if (Math.random() < 0.01) {
    await db.prepare("DELETE FROM buildstory_rate_limits WHERE window_start < ?").bind(new Date(now.getTime() - STALE_WINDOW_MS).toISOString()).run();
  }

  const row = await db
    .prepare(
      `INSERT INTO buildstory_rate_limits (id, window_start, count, updated_at)
       VALUES (?, ?, 1, ?)
       ON CONFLICT(id) DO UPDATE SET count = count + 1, updated_at = excluded.updated_at
       RETURNING count`,
    )
    .bind(id, windowStart, nowIso)
    .first<{ count: number }>();

  if (Number(row?.count ?? 0) > limit) {
    throw new SocialError(
      "rate_limited",
      "Too many requests. Wait a moment before trying again.",
      429,
    );
  }
}
