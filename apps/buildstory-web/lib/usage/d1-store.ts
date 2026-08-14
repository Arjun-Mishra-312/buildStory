import { getD1 } from "@/db";
import { EMPTY_PROFILE_USAGE, aggregateProfileUsage } from "./aggregate";
import type { ProfileUsage } from "./contracts";
import { USAGE_ACTIVITY_MODEL, foldChaptersToDailyRows, type UsageChapterInput, type UsageDailyRow } from "./fold";

const BATCH = 40;

async function database() {
  return getD1();
}

type ChapterRow = {
  chapter_index: number | null;
  source_snapshot_json: string;
  snapshot_json: string;
  owner_user_id: string;
};

function parseSnapshot(json: string): unknown {
  try {
    return JSON.parse(json) as unknown;
  } catch {
    return null;
  }
}

function chaptersFromRows(rows: ChapterRow[]): { userId: string; chapters: UsageChapterInput[] } | null {
  if (rows.length === 0) return null;
  return {
    userId: rows[0]!.owner_user_id,
    chapters: rows.map((row, index) => ({
      chapterIndex: row.chapter_index ?? index + 1,
      snapshot: parseSnapshot(row.source_snapshot_json) ?? parseSnapshot(row.snapshot_json),
    })),
  };
}

export async function refreshProjectUsageRollup(projectId: string): Promise<void> {
  const db = await database();
  const rows = await db
    .prepare(
      `SELECT r.chapter_index, r.source_snapshot_json, r.snapshot_json, p.owner_user_id
       FROM buildstory_reports r
       JOIN buildstory_projects p ON p.id = r.project_id
       WHERE r.project_id = ? AND r.publication_status IN ('published', 'draft_changes')
       ORDER BY COALESCE(r.chapter_index, 0) ASC, r.created_at ASC`,
    )
    .bind(projectId)
    .all<ChapterRow>();
  const parsed = chaptersFromRows(rows.results);
  const now = new Date().toISOString();
  const daily = parsed ? foldChaptersToDailyRows(parsed.chapters) : [];
  const statements: D1PreparedStatement[] = [
    db.prepare("DELETE FROM buildstory_usage_daily WHERE project_id = ?").bind(projectId),
  ];
  if (parsed) {
    for (const row of daily) {
      statements.push(
        db
          .prepare(
            `INSERT INTO buildstory_usage_daily
             (id, user_id, project_id, day, model_key, model_label, tokens, cost_micro_usd, session_count, computed_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            `${projectId}|${row.day}|${row.modelKey}`,
            parsed.userId,
            projectId,
            row.day,
            row.modelKey,
            row.modelLabel,
            row.tokens,
            row.costMicroUsd,
            row.sessionCount,
            now,
          ),
      );
    }
  }
  for (let index = 0; index < statements.length; index += BATCH) {
    await db.batch(statements.slice(index, index + BATCH));
  }
}

export async function refreshAllUsageRollups(): Promise<void> {
  const db = await database();
  const projects = await db
    .prepare(
      `SELECT DISTINCT project_id AS id
       FROM buildstory_reports
       WHERE publication_status IN ('published', 'draft_changes')`,
    )
    .all<{ id: string }>();
  const publishedIds = new Set(projects.results.map((row) => row.id));
  const stale = await db.prepare("SELECT DISTINCT project_id AS id FROM buildstory_usage_daily").all<{ id: string }>();
  for (const row of stale.results) {
    if (!publishedIds.has(row.id)) {
      await db.prepare("DELETE FROM buildstory_usage_daily WHERE project_id = ?").bind(row.id).run();
    }
  }
  for (const row of projects.results) await refreshProjectUsageRollup(row.id);
}

export async function getProfileUsage(userId: string): Promise<ProfileUsage> {
  const db = await database();
  const [rows, rankRow] = await Promise.all([
    db
      .prepare(
        `SELECT day, model_key, model_label, tokens, cost_micro_usd, session_count
         FROM buildstory_usage_daily WHERE user_id = ? ORDER BY day ASC`,
      )
      .bind(userId)
      .all<{
        day: string;
        model_key: string;
        model_label: string;
        tokens: number;
        cost_micro_usd: number | null;
        session_count: number;
      }>(),
    db
      .prepare(
        `SELECT rank_spend FROM buildstory_leaderboard_entries WHERE period = 'all-time' AND user_id = ?`,
      )
      .bind(userId)
      .first<{ rank_spend: number }>(),
  ]);
  const daily: UsageDailyRow[] = rows.results.map((row) => ({
    day: row.day,
    modelKey: row.model_key,
    modelLabel: row.model_label,
    tokens: row.tokens,
    costMicroUsd: row.cost_micro_usd,
    sessionCount: row.session_count,
  }));
  if (daily.length === 0) return { ...EMPTY_PROFILE_USAGE, rank: rankRow?.rank_spend ?? null };
  return aggregateProfileUsage(daily, rankRow?.rank_spend ?? null);
}

export { USAGE_ACTIVITY_MODEL };
