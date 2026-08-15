import { listOwnerUsageChapterSets, listPublishedUsageProjects } from "@/lib/ingestion/mock-store";
import { getProfile } from "@/lib/social/mock-store";
import { EMPTY_PROFILE_USAGE, aggregateProfileUsage } from "@/lib/usage/aggregate";
import { foldChaptersToDailyRows, foldUnionToDailyRows, hourlyFromSessions, unionUnpublishedOntoPublished, periodStartDay, type UsageDailyRow } from "@/lib/usage/fold";
import {
  DEFAULT_LEADERBOARD_METRIC,
  type LeaderboardEntry,
  type LeaderboardMetric,
  type LeaderboardPeriod,
} from "./contracts";

type UserTotals = {
  spendMicroUsd: number;
  priced: boolean;
  tokens: number;
  commitCount: number;
  days: Set<string>;
  lastActiveAt: string | null;
  sessionCount: number;
  storyCount: number;
};

function totalsForPeriod(period: LeaderboardPeriod): Map<string, UserTotals> {
  const cutoff = periodStartDay(period);
  const totals = new Map<string, UserTotals>();
  for (const project of listPublishedUsageProjects()) {
    const existing = totals.get(project.ownerUserId) ?? {
      spendMicroUsd: 0,
      priced: false,
      tokens: 0,
      commitCount: 0,
      days: new Set<string>(),
      lastActiveAt: null,
      sessionCount: 0,
      storyCount: 0,
    };
    existing.commitCount += project.commitCount;
    existing.storyCount += project.storyCount;
    const daily = foldChaptersToDailyRows(project.chapters).filter((row) => !cutoff || row.day >= cutoff);
    for (const row of daily) {
      existing.days.add(row.day);
      if (row.modelKey === "__activity") {
        existing.sessionCount += row.sessionCount;
        continue;
      }
      existing.tokens += row.tokens;
      if (row.costMicroUsd != null) {
        existing.spendMicroUsd += row.costMicroUsd;
        existing.priced = true;
      }
      if (!existing.lastActiveAt || row.day > existing.lastActiveAt) existing.lastActiveAt = row.day;
    }
    totals.set(project.ownerUserId, existing);
  }
  return totals;
}

function compareEntries(metric: LeaderboardMetric, left: UserTotals, leftId: string, right: UserTotals, rightId: string) {
  if (metric === "tokens") {
    if (right.tokens !== left.tokens) return right.tokens - left.tokens;
    if (right.spendMicroUsd !== left.spendMicroUsd) return right.spendMicroUsd - left.spendMicroUsd;
  } else {
    if (right.spendMicroUsd !== left.spendMicroUsd) return right.spendMicroUsd - left.spendMicroUsd;
    if (right.tokens !== left.tokens) return right.tokens - left.tokens;
  }
  const last = (right.lastActiveAt ?? "").localeCompare(left.lastActiveAt ?? "");
  if (last !== 0) return last;
  return leftId.localeCompare(rightId);
}

/** Mirrors d1-store's getLeaderboard, computed in-memory from published snapshots. */
export function getLeaderboard(
  period: LeaderboardPeriod,
  limit = 50,
  metric: LeaderboardMetric = DEFAULT_LEADERBOARD_METRIC,
): LeaderboardEntry[] {
  const bounded = Math.min(Math.max(1, Math.trunc(limit)), 200);
  const totals = totalsForPeriod(period);
  const ranked = Array.from(totals.entries())
    .sort(([leftId, left], [rightId, right]) => compareEntries(metric, left, leftId, right, rightId))
    .slice(0, bounded);

  const entries: LeaderboardEntry[] = [];
  for (const [userId, totalsForUser] of ranked) {
    const profile = getProfile(userId);
    if (!profile) continue;
    entries.push({
      rank: entries.length + 1,
      user: { id: profile.id, handle: profile.handle, displayName: profile.displayName, avatarUrl: profile.avatarUrl },
      spendMicroUsd: totalsForUser.priced ? totalsForUser.spendMicroUsd : null,
      tokens: totalsForUser.tokens,
      commitCount: totalsForUser.commitCount,
      activeDays: totalsForUser.days.size,
      lastActiveAt: totalsForUser.lastActiveAt,
      sessionCount: totalsForUser.sessionCount,
      storyCount: totalsForUser.storyCount,
    });
  }
  return entries;
}

function usageFromProjects(
  userId: string,
  projects: ReturnType<typeof listPublishedUsageProjects>,
) {
  const rows: UsageDailyRow[] = [];
  const allTimeRank = getLeaderboard("all-time", 200, "spend").find((entry) => entry.user.id === userId)?.rank ?? null;
  for (const project of projects) {
    if (project.ownerUserId !== userId) continue;
    rows.push(...foldChaptersToDailyRows(project.chapters));
  }
  if (rows.length === 0) return { ...EMPTY_PROFILE_USAGE, rank: allTimeRank };
  return aggregateProfileUsage(rows, allTimeRank);
}

export function getProfileUsage(userId: string) {
  return usageFromProjects(userId, listPublishedUsageProjects());
}

export function getPrivateProfileUsage(userId: string) {
  const rows: UsageDailyRow[] = [];
  const hourSessions = [];
  const allTimeRank = getLeaderboard("all-time", 200, "spend").find((entry) => entry.user.id === userId)?.rank ?? null;
  for (const project of listOwnerUsageChapterSets()) {
    if (project.ownerUserId !== userId) continue;
    rows.push(...foldUnionToDailyRows(project.published, project.unpublished));
    hourSessions.push(...unionUnpublishedOntoPublished(project.published, project.unpublished));
  }
  if (rows.length === 0) return { ...EMPTY_PROFILE_USAGE, rank: allTimeRank };
  return { ...aggregateProfileUsage(rows, allTimeRank), hours: hourlyFromSessions(hourSessions) };
}
