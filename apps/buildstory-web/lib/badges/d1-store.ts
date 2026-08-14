import { getD1 } from "@/db";
import { foldChaptersToFeatSessions, type UsageChapterInput } from "@/lib/usage/fold";
import { getProfileUsage } from "@/lib/usage/d1-store";
import { assembleProfileBadges, pickShowcase, storySeals, toPublicAward } from "./assemble";
import { isBadgeId, parseBadgeEvidence, type BadgeCandidate, type BadgeId, type LeaderboardRankSnapshot, type ProfileBadgeView, type PublicBadgeAward } from "./contracts";
import { evaluateBadges, evaluateLeague } from "./evaluate";

const BATCH = 40;

async function database() {
  return getD1();
}

type AwardRow = {
  id: string;
  user_id: string;
  badge_id: string;
  earned_at: string;
  evidence_json: string;
  source_project_id: string | null;
  source_chapter_id: string | null;
  pinned_rank: number | null;
  slug: string | null;
  handle: string | null;
  published: number | null;
};

function publicFromRow(row: AwardRow): PublicBadgeAward | null {
  if (!isBadgeId(row.badge_id)) return null;
  const pinned = row.pinned_rank === 1 || row.pinned_rank === 2 || row.pinned_rank === 3 ? row.pinned_rank : null;
  const href = row.published && row.handle && row.slug ? `/u/${row.handle}/${row.slug}` : null;
  return toPublicAward(
    {
      id: row.id,
      userId: row.user_id,
      badgeId: row.badge_id,
      earnedAt: row.earned_at,
      evidence: parseBadgeEvidence(row.evidence_json),
      sourceProjectId: row.source_project_id,
      sourceChapterId: row.source_chapter_id,
      pinnedRank: pinned,
    },
    href,
  );
}

const AWARD_SELECT = `SELECT a.id, a.user_id, a.badge_id, a.earned_at, a.evidence_json, a.source_project_id, a.source_chapter_id, a.pinned_rank,
        p.slug AS slug, u.handle AS handle,
        CASE WHEN EXISTS (
          SELECT 1 FROM buildstory_reports r
          WHERE r.project_id = a.source_project_id AND r.publication_status IN ('published', 'draft_changes')
        ) THEN 1 ELSE 0 END AS published
     FROM buildstory_badge_awards a
     LEFT JOIN buildstory_projects p ON p.id = a.source_project_id
     LEFT JOIN buildstory_users u ON u.id = p.owner_user_id`;

export async function listUserAwards(userId: string): Promise<PublicBadgeAward[]> {
  const db = await database();
  const rows = await db.prepare(`${AWARD_SELECT} WHERE a.user_id = ?`).bind(userId).all<AwardRow>();
  return rows.results.map(publicFromRow).filter((row): row is PublicBadgeAward => row != null);
}

export async function getStorySealsForPath(handle: string, slug: string): Promise<PublicBadgeAward[]> {
  const db = await database();
  const row = await db
    .prepare(
      `SELECT p.id AS project_id, p.owner_user_id
       FROM buildstory_projects p
       JOIN buildstory_users u ON u.id = p.owner_user_id
       JOIN buildstory_reports r ON r.project_id = p.id
       WHERE u.handle_lower = ? AND r.publication_slug = ?
         AND r.publication_status IN ('published', 'draft_changes')
       LIMIT 1`,
    )
    .bind(handle.toLocaleLowerCase("en-US"), slug)
    .first<{ project_id: string; owner_user_id: string }>();
  if (!row) return [];
  return storySeals(await listUserAwards(row.owner_user_id), row.project_id);
}

export async function getProfileBadges(userId: string, isOwner: boolean): Promise<ProfileBadgeView> {
  return assembleProfileBadges(await listUserAwards(userId), isOwner);
}

export async function getPinnedBadgesByUserIds(userIds: string[]): Promise<Map<string, PublicBadgeAward[]>> {
  const result = new Map<string, PublicBadgeAward[]>();
  if (userIds.length === 0) return result;
  const db = await database();
  const placeholders = userIds.map(() => "?").join(",");
  const rows = await db
    .prepare(`${AWARD_SELECT} WHERE a.user_id IN (${placeholders})`)
    .bind(...userIds)
    .all<AwardRow>();
  const byUser = new Map<string, PublicBadgeAward[]>();
  for (const row of rows.results) {
    const award = publicFromRow(row);
    if (!award) continue;
    const list = byUser.get(row.user_id) ?? [];
    list.push(award);
    byUser.set(row.user_id, list);
  }
  for (const userId of userIds) {
    result.set(userId, pickShowcase(byUser.get(userId) ?? []));
  }
  return result;
}

export async function pinBadges(userId: string, badgeIds: BadgeId[]): Promise<ProfileBadgeView> {
  const unique = [...new Set(badgeIds)].slice(0, 3);
  const owned = await listUserAwards(userId);
  const ownedIds = new Set(owned.map((award) => award.badgeId));
  if (unique.some((id) => !ownedIds.has(id))) {
    throw Object.assign(new Error("Can only pin earned badges."), { status: 422, code: "unearned_badge" });
  }
  const db = await database();
  const statements: D1PreparedStatement[] = [
    db.prepare("UPDATE buildstory_badge_awards SET pinned_rank = NULL WHERE user_id = ?").bind(userId),
  ];
  unique.forEach((id, index) => {
    statements.push(
      db
        .prepare("UPDATE buildstory_badge_awards SET pinned_rank = ? WHERE user_id = ? AND badge_id = ?")
        .bind(index + 1, userId, id),
    );
  });
  await db.batch(statements);
  return getProfileBadges(userId, true);
}

export async function refreshUserBadges(userId: string): Promise<PublicBadgeAward[]> {
  const db = await database();
  const [chapterRows, rankRows, verified] = await Promise.all([
    db
      .prepare(
        `SELECT r.id AS chapter_id, r.project_id, r.chapter_index, r.source_snapshot_json, r.snapshot_json, p.verified_repo_at
         FROM buildstory_reports r
         JOIN buildstory_projects p ON p.id = r.project_id
         WHERE p.owner_user_id = ? AND r.publication_status IN ('published', 'draft_changes')
         ORDER BY r.project_id ASC, COALESCE(r.chapter_index, 0) ASC`,
      )
      .bind(userId)
      .all<{
        chapter_id: string;
        project_id: string;
        chapter_index: number | null;
        source_snapshot_json: string;
        snapshot_json: string;
        verified_repo_at: string | null;
      }>(),
    db
      .prepare("SELECT period, rank_spend, rank_tokens FROM buildstory_leaderboard_entries WHERE user_id = ?")
      .bind(userId)
      .all<{ period: string; rank_spend: number; rank_tokens: number }>(),
    db
      .prepare(
        `SELECT 1 AS ok FROM buildstory_projects p
         JOIN buildstory_reports r ON r.project_id = p.id
         WHERE p.owner_user_id = ? AND p.verified_repo_at IS NOT NULL
           AND r.publication_status IN ('published', 'draft_changes')
         LIMIT 1`,
      )
      .bind(userId)
      .first<{ ok: number }>(),
  ]);
  const byProject = new Map<string, { chapterId: string | null; chapters: UsageChapterInput[]; maxChapter: number }>();
  for (const row of chapterRows.results) {
    const current = byProject.get(row.project_id) ?? { chapterId: row.chapter_id, chapters: [], maxChapter: 0 };
    const snapshot = parseJson(row.source_snapshot_json) ?? parseJson(row.snapshot_json);
    const chapterIndex = row.chapter_index ?? current.chapters.length + 1;
    current.chapters.push({ chapterIndex, snapshot });
    current.maxChapter = Math.max(current.maxChapter, chapterIndex);
    current.chapterId = row.chapter_id;
    byProject.set(row.project_id, current);
  }
  const projects = Array.from(byProject.entries()).map(([projectId, value]) => ({
    projectId,
    chapterId: value.chapterId,
    sessions: foldChaptersToFeatSessions(value.chapters),
  }));
  const usage = await getProfileUsage(userId);
  const ranks: LeaderboardRankSnapshot[] = rankRows.results.flatMap((row) => {
    if (row.period !== "7d" && row.period !== "30d" && row.period !== "all-time") return [];
    return [{ period: row.period, rankSpend: row.rank_spend, rankTokens: row.rank_tokens }];
  });
  const maxChapterIndex = Math.max(0, ...Array.from(byProject.values()).map((value) => value.maxChapter));
  const candidates = evaluateBadges({
    projects,
    usage,
    publishedStoryCount: byProject.size,
    maxChapterIndex,
    hasVerifiedPublishedRepo: Boolean(verified),
    ranks,
  });
  return upsertCandidates(userId, candidates);
}

export async function refreshLeagueBadges(): Promise<void> {
  const db = await database();
  const rows = await db
    .prepare("SELECT user_id, period, rank_spend, rank_tokens FROM buildstory_leaderboard_entries")
    .all<{ user_id: string; period: string; rank_spend: number; rank_tokens: number }>();
  const byUser = new Map<string, LeaderboardRankSnapshot[]>();
  for (const row of rows.results) {
    if (row.period !== "7d" && row.period !== "30d" && row.period !== "all-time") continue;
    const list = byUser.get(row.user_id) ?? [];
    list.push({ period: row.period, rankSpend: row.rank_spend, rankTokens: row.rank_tokens });
    byUser.set(row.user_id, list);
  }
  for (const [userId, ranks] of byUser) {
    await upsertCandidates(userId, evaluateLeague(ranks));
  }
}

async function upsertCandidates(userId: string, candidates: BadgeCandidate[]): Promise<PublicBadgeAward[]> {
  if (candidates.length === 0) return [];
  const db = await database();
  const now = new Date().toISOString();
  const newly: PublicBadgeAward[] = [];
  const statements: D1PreparedStatement[] = [];
  for (const candidate of candidates) {
    const id = `${userId}|${candidate.badgeId}`;
    statements.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO buildstory_badge_awards
           (id, user_id, badge_id, earned_at, evidence_json, source_project_id, source_chapter_id, pinned_rank)
           VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
        )
        .bind(
          id,
          userId,
          candidate.badgeId,
          now,
          JSON.stringify(candidate.evidence),
          candidate.sourceProjectId,
          candidate.sourceChapterId,
        ),
    );
  }
  for (let index = 0; index < statements.length; index += BATCH) {
    const slice = statements.slice(index, index + BATCH);
    const results = await db.batch(slice);
    results.forEach((result, offset) => {
      if (Number(result.meta?.changes ?? 0) !== 1) return;
      const candidate = candidates[index + offset];
      if (!candidate) return;
      newly.push(
        toPublicAward(
          {
            id: `${userId}|${candidate.badgeId}`,
            userId,
            badgeId: candidate.badgeId,
            earnedAt: now,
            evidence: candidate.evidence,
            sourceProjectId: candidate.sourceProjectId,
            sourceChapterId: candidate.sourceChapterId,
            pinnedRank: null,
          },
          null,
        ),
      );
    });
  }
  return newly;
}

function parseJson(json: string): unknown {
  try {
    return JSON.parse(json) as unknown;
  } catch {
    return null;
  }
}
