import { getD1 } from "@/db";
import {
  ANTI_GAMING_MAX_COMMITS_PER_DAY,
  LEADERBOARD_STALE_MS,
  type LeaderboardEntry,
  type LeaderboardPeriod,
} from "./contracts";

async function database() {
  return getD1();
}

/**
 * Recomputes and atomically replaces every entry for one period. Idempotent
 * and safe to call from a real Cloudflare Cron Trigger, a manual admin
 * action, or the bounded lazy-staleness fallback in getLeaderboard - never
 * from an ordinary page read without a staleness check first.
 */
export async function recomputeLeaderboard(period: LeaderboardPeriod): Promise<void> {
  const db = await database();
  const now = new Date().toISOString();
  await db.batch([
    db.prepare("DELETE FROM buildstory_leaderboard_entries WHERE period = ?").bind(period),
    db
      .prepare(
        `INSERT INTO buildstory_leaderboard_entries (id, period, user_id, rank, score, active_days, story_count, computed_at)
         SELECT ? || ':' || ranked.user_id, ?, ranked.user_id,
                RANK() OVER (ORDER BY ranked.score DESC, ranked.active_days DESC, ranked.user_id ASC),
                ranked.score, ranked.active_days, ranked.story_count, ?
         FROM (
           SELECT p.owner_user_id AS user_id,
                  SUM(MIN(p.latest_commit_count, p.latest_active_days * ?)) AS score,
                  SUM(p.latest_active_days) AS active_days,
                  COUNT(DISTINCT p.id) AS story_count
           FROM buildstory_projects p
           WHERE EXISTS (
             SELECT 1 FROM buildstory_reports r
             WHERE r.project_id = p.id AND r.publication_status = 'published'
           )
           GROUP BY p.owner_user_id
         ) AS ranked`,
      )
      .bind(period, period, now, ANTI_GAMING_MAX_COMMITS_PER_DAY),
    db
      .prepare(
        `INSERT INTO buildstory_leaderboard_runs (period, computed_at) VALUES (?, ?)
         ON CONFLICT(period) DO UPDATE SET computed_at = excluded.computed_at`,
      )
      .bind(period, now),
  ]);
}

async function lastComputedAt(db: D1Database, period: LeaderboardPeriod): Promise<string | null> {
  const row = await db
    .prepare("SELECT computed_at FROM buildstory_leaderboard_runs WHERE period = ?")
    .bind(period)
    .first<{ computed_at: string }>();
  return row?.computed_at ?? null;
}

type EntryRow = {
  rank: number;
  score: number;
  active_days: number;
  story_count: number;
  user_id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
};

/** Bounded lazy fallback: recomputes only if nothing has ever run, or the last run is older than LEADERBOARD_STALE_MS. Never recomputes on every read. */
export async function getLeaderboard(period: LeaderboardPeriod, limit = 50): Promise<LeaderboardEntry[]> {
  const db = await database();
  const bounded = Math.min(Math.max(1, Math.trunc(limit)), 200);
  const computedAt = await lastComputedAt(db, period);
  if (!computedAt || Date.now() - Date.parse(computedAt) > LEADERBOARD_STALE_MS) {
    const claim = await db.prepare(
      `INSERT INTO buildstory_leaderboard_runs (period, computed_at) VALUES (?, ?)
       ON CONFLICT(period) DO UPDATE SET computed_at = excluded.computed_at
       WHERE buildstory_leaderboard_runs.computed_at = ?`,
    ).bind(period, new Date(0).toISOString(), computedAt ?? "").run();
    if (Number(claim.meta?.changes ?? 0) === 1) await recomputeLeaderboard(period);
  }
  const rows = await db
    .prepare(
      `SELECT e.rank, e.score, e.active_days, e.story_count,
              u.id AS user_id, u.handle, u.display_name, u.avatar_url
       FROM buildstory_leaderboard_entries e
       JOIN buildstory_users u ON u.id = e.user_id
       WHERE e.period = ?
       ORDER BY e.rank ASC LIMIT ?`,
    )
    .bind(period, bounded)
    .all<EntryRow>();
  return rows.results.map((row) => ({
    rank: row.rank,
    user: { id: row.user_id, handle: row.handle, displayName: row.display_name, avatarUrl: row.avatar_url },
    score: row.score,
    activeDays: row.active_days,
    storyCount: row.story_count,
  }));
}
