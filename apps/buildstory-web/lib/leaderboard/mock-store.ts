import { listProjectStatsForLeaderboard } from "@/lib/ingestion/mock-store";
import { getProfile } from "@/lib/social/mock-store";
import {
  ANTI_GAMING_MAX_COMMITS_PER_DAY,
  VERIFIED_REPO_SCORE_MULTIPLIER,
  type LeaderboardEntry,
  type LeaderboardPeriod,
} from "./contracts";

/** Mirrors d1-store's recomputeLeaderboard, computed in-memory instead of via SQL window functions. */
export function getLeaderboard(_period: LeaderboardPeriod, limit = 50): LeaderboardEntry[] {
  const bounded = Math.min(Math.max(1, Math.trunc(limit)), 200);
  const totals = new Map<string, { score: number; activeDays: number; storyCount: number }>();
  for (const project of listProjectStatsForLeaderboard()) {
    const cappedCommits = Math.min(
      project.latestCommitCount,
      project.latestActiveDays * ANTI_GAMING_MAX_COMMITS_PER_DAY,
    );
    const boosted = Math.round(cappedCommits * (project.verifiedRepoAt ? VERIFIED_REPO_SCORE_MULTIPLIER : 1));
    const existing = totals.get(project.ownerUserId) ?? { score: 0, activeDays: 0, storyCount: 0 };
    existing.score += boosted;
    existing.activeDays += project.latestActiveDays;
    existing.storyCount += project.publishedStoryCount;
    totals.set(project.ownerUserId, existing);
  }

  const ranked = Array.from(totals.entries())
    .sort(([leftId, left], [rightId, right]) => {
      if (right.score !== left.score) return right.score - left.score;
      if (right.activeDays !== left.activeDays) return right.activeDays - left.activeDays;
      return leftId.localeCompare(rightId);
    })
    .slice(0, bounded);

  const entries: LeaderboardEntry[] = [];
  for (const [userId, totalsForUser] of ranked) {
    const profile = getProfile(userId);
    if (!profile) continue;
    entries.push({
      rank: entries.length + 1,
      user: { id: profile.id, handle: profile.handle, displayName: profile.displayName, avatarUrl: profile.avatarUrl },
      score: totalsForUser.score,
      activeDays: totalsForUser.activeDays,
      storyCount: totalsForUser.storyCount,
    });
  }
  return entries;
}
