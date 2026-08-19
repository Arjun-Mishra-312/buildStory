import { listPublishedUsageProjects } from "@/lib/ingestion/mock-store";
import { getProfile } from "@/lib/social/mock-store";
import { foldChaptersToFeatSessions } from "@/lib/usage/fold";
import { getLeaderboard, getPublishedProfileUsage } from "@/lib/leaderboard/mock-store";
import { LEADERBOARD_PERIODS } from "@/lib/leaderboard/contracts";
import { assembleProfileBadges, pickShowcase, storySeals, toPublicAward } from "./assemble";
import {
  isBadgeId,
  type BadgeAwardRecord,
  type BadgeCandidate,
  type BadgeId,
  type LeaderboardRankSnapshot,
  type ProfileBadgeView,
  type PublicBadgeAward,
} from "./contracts";
import { evaluateBadges, evaluateLeague } from "./evaluate";

const awards = new Map<string, BadgeAwardRecord>();

function keyFor(userId: string, badgeId: BadgeId) {
  return `${userId}|${badgeId}`;
}

function sourceHref(record: BadgeAwardRecord): string | null {
  if (!record.sourceProjectId) return null;
  const project = listPublishedUsageProjects().find((item) => item.projectId === record.sourceProjectId);
  if (!project) return null;
  const profile = getProfile(project.ownerUserId);
  if (!profile) return null;
  return `/u/${profile.handle}/${project.slug}`;
}

function toPublic(record: BadgeAwardRecord): PublicBadgeAward {
  return toPublicAward(record, sourceHref(record));
}

export function listUserAwards(userId: string): PublicBadgeAward[] {
  return Array.from(awards.values())
    .filter((record) => record.userId === userId)
    .map(toPublic);
}

export function getStorySealsForPath(handle: string, slug: string): PublicBadgeAward[] {
  const project = listPublishedUsageProjects().find((item) => {
    const profile = getProfile(item.ownerUserId);
    return item.slug === slug && profile?.handle.toLocaleLowerCase("en-US") === handle.toLocaleLowerCase("en-US");
  });
  if (!project) return [];
  return storySeals(listUserAwards(project.ownerUserId), project.projectId);
}

export function getProfileBadges(userId: string, isOwner: boolean): ProfileBadgeView {
  return assembleProfileBadges(listUserAwards(userId), isOwner);
}

export function getPinnedBadgesByUserIds(userIds: string[]): Map<string, PublicBadgeAward[]> {
  const result = new Map<string, PublicBadgeAward[]>();
  for (const userId of userIds) {
    result.set(userId, pickShowcase(listUserAwards(userId)));
  }
  return result;
}

export function pinBadges(userId: string, badgeIds: BadgeId[]): ProfileBadgeView {
  const unique = [...new Set(badgeIds)].slice(0, 3);
  const owned = listUserAwards(userId);
  const ownedIds = new Set(owned.map((award) => award.badgeId));
  if (unique.some((id) => !ownedIds.has(id))) {
    throw Object.assign(new Error("Can only pin earned badges."), { status: 422, code: "unearned_badge" });
  }
  for (const record of awards.values()) {
    if (record.userId !== userId) continue;
    record.pinnedRank = null;
  }
  unique.forEach((id, index) => {
    const record = awards.get(keyFor(userId, id));
    if (record) record.pinnedRank = (index + 1) as 1 | 2 | 3;
  });
  return getProfileBadges(userId, true);
}

export function refreshUserBadges(userId: string): PublicBadgeAward[] {
  const projects = listPublishedUsageProjects().filter((project) => project.ownerUserId === userId);
  const usage = getPublishedProfileUsage(userId);
  const candidates = evaluateBadges({
    projects: projects.map((project) => ({
      projectId: project.projectId,
      chapterId: null,
      sessions: foldChaptersToFeatSessions(project.chapters),
    })),
    usage,
    publishedStoryCount: projects.length,
    maxChapterIndex: Math.max(0, ...projects.map((project) => project.maxChapterIndex)),
    hasVerifiedPublishedRepo: projects.some((project) => project.verifiedRepoAt != null),
    ranks: getUserLeaderboardRanks(userId),
  });
  return upsertCandidates(userId, candidates);
}

export function refreshLeagueBadges(): void {
  const userIds = new Set<string>();
  for (const period of LEADERBOARD_PERIODS) {
    for (const entry of getLeaderboard(period, 200, "spend")) userIds.add(entry.user.id);
    for (const entry of getLeaderboard(period, 200, "tokens")) userIds.add(entry.user.id);
  }
  for (const userId of userIds) {
    upsertCandidates(userId, evaluateLeague(getUserLeaderboardRanks(userId)));
  }
}

function getUserLeaderboardRanks(userId: string): LeaderboardRankSnapshot[] {
  const ranks: LeaderboardRankSnapshot[] = [];
  for (const period of LEADERBOARD_PERIODS) {
    const spend = getLeaderboard(period, 200, "spend").find((entry) => entry.user.id === userId);
    const tokens = getLeaderboard(period, 200, "tokens").find((entry) => entry.user.id === userId);
    if (!spend && !tokens) continue;
    ranks.push({
      period,
      rankSpend: spend?.rank ?? Number.MAX_SAFE_INTEGER,
      rankTokens: tokens?.rank ?? Number.MAX_SAFE_INTEGER,
    });
  }
  return ranks;
}

function upsertCandidates(userId: string, candidates: BadgeCandidate[]): PublicBadgeAward[] {
  const now = new Date().toISOString();
  const newly: PublicBadgeAward[] = [];
  for (const candidate of candidates) {
    if (!isBadgeId(candidate.badgeId)) continue;
    const id = keyFor(userId, candidate.badgeId);
    if (awards.has(id)) continue;
    const record: BadgeAwardRecord = {
      id,
      userId,
      badgeId: candidate.badgeId,
      earnedAt: now,
      evidence: candidate.evidence,
      sourceProjectId: candidate.sourceProjectId,
      sourceChapterId: candidate.sourceChapterId,
      pinnedRank: null,
    };
    awards.set(id, record);
    newly.push(toPublic(record));
  }
  return newly;
}
