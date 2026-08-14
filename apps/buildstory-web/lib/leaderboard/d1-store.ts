import { getD1 } from "@/db";
import {
  DEFAULT_LEADERBOARD_METRIC,
  LEADERBOARD_STALE_MS,
  type LeaderboardEntry,
  type LeaderboardMetric,
  type LeaderboardPeriod,
} from "./contracts";
import { periodStartDay } from "../usage/fold";
import { refreshAllUsageRollups } from "../usage/d1-store";

async function database() {
  return getD1();
}

/**
 * Recomputes and atomically replaces every entry for one period. Idempotent
 * and safe to call from a real Cloudflare Cron Trigger, a manual admin
 * action, or the bounded lazy-staleness fallback in getLeaderboard - never
 * from an ordinary page read without a staleness check first.
 */
export async function recomputeLeaderboard(period: LeaderboardPeriod, options?: { refreshRollups?: boolean }): Promise<void> {
  const db = await database();
  if (options?.refreshRollups !== false) {
    const published = await db
      .prepare(`SELECT COUNT(*) AS count FROM buildstory_reports WHERE publication_status IN ('published', 'draft_changes')`)
      .first<{ count: number }>();
    if ((published?.count ?? 0) > 0) await refreshAllUsageRollups();
  }
  const now = new Date().toISOString();
  const cutoff = periodStartDay(period) ?? "";
  await db.batch([
    db.prepare("DELETE FROM buildstory_leaderboard_entries WHERE period = ?").bind(period),
    db
      .prepare(
        `INSERT INTO buildstory_leaderboard_entries (
           id, period, user_id, rank_spend, rank_tokens, spend_micro_usd, priced, tokens,
           commit_count, active_days, last_active_at, session_count, story_count, computed_at
         )
         SELECT ? || ':' || ranked.user_id, ?, ranked.user_id,
                RANK() OVER (ORDER BY ranked.spend_micro_usd DESC, ranked.tokens DESC, COALESCE(ranked.last_active_at, '') DESC, ranked.user_id ASC),
                RANK() OVER (ORDER BY ranked.tokens DESC, ranked.spend_micro_usd DESC, COALESCE(ranked.last_active_at, '') DESC, ranked.user_id ASC),
                ranked.spend_micro_usd, ranked.priced, ranked.tokens, ranked.commit_count,
                ranked.active_days, ranked.last_active_at, ranked.session_count, ranked.story_count, ?
         FROM (
           SELECT published.user_id AS user_id,
                  COALESCE(usage.spend_micro_usd, 0) AS spend_micro_usd,
                  COALESCE(usage.priced, 0) AS priced,
                  COALESCE(usage.tokens, 0) AS tokens,
                  published.commit_count AS commit_count,
                  COALESCE(usage.active_days, 0) AS active_days,
                  usage.last_active_at AS last_active_at,
                  COALESCE(usage.session_count, 0) AS session_count,
                  published.story_count AS story_count
           FROM (
             SELECT p.owner_user_id AS user_id,
                    SUM(p.latest_commit_count) AS commit_count,
                    SUM(published_stories.published_story_count) AS story_count
             FROM buildstory_projects p
             JOIN (
               SELECT project_id, COUNT(*) AS published_story_count
               FROM buildstory_reports
               WHERE publication_status IN ('published', 'draft_changes')
               GROUP BY project_id
             ) AS published_stories ON published_stories.project_id = p.id
             GROUP BY p.owner_user_id
           ) AS published
           LEFT JOIN (
             SELECT user_id,
                    SUM(CASE WHEN model_key != '__activity' THEN COALESCE(cost_micro_usd, 0) ELSE 0 END) AS spend_micro_usd,
                    MAX(CASE WHEN model_key != '__activity' AND cost_micro_usd IS NOT NULL THEN 1 ELSE 0 END) AS priced,
                    SUM(CASE WHEN model_key != '__activity' THEN tokens ELSE 0 END) AS tokens,
                    COUNT(DISTINCT day) AS active_days,
                    MAX(day) AS last_active_at,
                    SUM(CASE WHEN model_key = '__activity' THEN session_count ELSE 0 END) AS session_count
             FROM buildstory_usage_daily
             WHERE ? = '' OR day >= ?
             GROUP BY user_id
           ) AS usage ON usage.user_id = published.user_id
         ) AS ranked`,
      )
      .bind(period, period, now, cutoff, cutoff),
    db
      .prepare(
        `INSERT INTO buildstory_leaderboard_runs (period, computed_at) VALUES (?, ?)
         ON CONFLICT(period) DO UPDATE SET computed_at = excluded.computed_at`,
      )
      .bind(period, now),
  ]);
  try {
    const { refreshLeagueBadges } = await import("@/lib/badges/d1-store");
    await refreshLeagueBadges();
  } catch {
    // League badges are additive; a recompute should still persist ranks.
  }
}

export async function recomputeAllLeaderboards(): Promise<void> {
  await refreshAllUsageRollups();
  for (const period of ["7d", "30d", "all-time"] as const) {
    await recomputeLeaderboard(period, { refreshRollups: false });
  }
}

async function lastComputedAt(db: D1Database, period: LeaderboardPeriod): Promise<string | null> {
  const row = await db
    .prepare("SELECT computed_at FROM buildstory_leaderboard_runs WHERE period = ?")
    .bind(period)
    .first<{ computed_at: string }>();
  return row?.computed_at ?? null;
}

/** Publication and project-stat writes must invalidate a fresh-looking cache too. */
async function latestSourceUpdatedAt(db: D1Database): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT MAX(updated_at) AS updated_at
       FROM (
         SELECT updated_at FROM buildstory_reports
         UNION ALL
         SELECT updated_at FROM buildstory_projects
       ) AS leaderboard_sources`,
    )
    .first<{ updated_at: string | null }>();
  return row?.updated_at ?? null;
}

type EntryRow = {
  rank_spend: number;
  rank_tokens: number;
  spend_micro_usd: number;
  priced: number;
  tokens: number;
  commit_count: number;
  active_days: number;
  last_active_at: string | null;
  session_count: number;
  story_count: number;
  user_id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
};

/** Bounded lazy fallback: recomputes when the snapshot is old or source data changed since it ran. */
export async function getLeaderboard(
  period: LeaderboardPeriod,
  limit = 50,
  metric: LeaderboardMetric = DEFAULT_LEADERBOARD_METRIC,
): Promise<LeaderboardEntry[]> {
  const db = await database();
  const bounded = Math.min(Math.max(1, Math.trunc(limit)), 200);
  const [computedAt, sourceUpdatedAt] = await Promise.all([lastComputedAt(db, period), latestSourceUpdatedAt(db)]);
  const sourceChanged = Boolean(
    sourceUpdatedAt && (!computedAt || Date.parse(sourceUpdatedAt) > Date.parse(computedAt)),
  );
  if (!computedAt || sourceChanged || Date.now() - Date.parse(computedAt) > LEADERBOARD_STALE_MS) {
    const claim = await db.prepare(
      `INSERT INTO buildstory_leaderboard_runs (period, computed_at) VALUES (?, ?)
       ON CONFLICT(period) DO UPDATE SET computed_at = excluded.computed_at
       WHERE buildstory_leaderboard_runs.computed_at = ?`,
    ).bind(period, new Date(0).toISOString(), computedAt ?? "").run();
    if (Number(claim.meta?.changes ?? 0) === 1) {
      const daily = await db.prepare("SELECT COUNT(*) AS count FROM buildstory_usage_daily").first<{ count: number }>();
      await recomputeLeaderboard(period, { refreshRollups: (daily?.count ?? 0) === 0 });
    }
  }
  const rows = await db
    .prepare(
      `SELECT e.rank_spend, e.rank_tokens, e.spend_micro_usd, e.priced, e.tokens, e.commit_count,
              e.active_days, e.last_active_at, e.session_count, e.story_count,
              u.id AS user_id, u.handle, u.display_name, u.avatar_url
       FROM buildstory_leaderboard_entries e
       JOIN buildstory_users u ON u.id = e.user_id
       WHERE e.period = ?
       ORDER BY CASE WHEN ? = 'tokens' THEN e.rank_tokens ELSE e.rank_spend END ASC LIMIT ?`,
    )
    .bind(period, metric, bounded)
    .all<EntryRow>();
  return rows.results.map((row) => ({
    rank: metric === "tokens" ? row.rank_tokens : row.rank_spend,
    user: { id: row.user_id, handle: row.handle, displayName: row.display_name, avatarUrl: row.avatar_url },
    spendMicroUsd: row.priced ? row.spend_micro_usd : null,
    tokens: row.tokens,
    commitCount: row.commit_count,
    activeDays: row.active_days,
    lastActiveAt: row.last_active_at,
    sessionCount: row.session_count,
    storyCount: row.story_count,
  }));
}
