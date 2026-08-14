import { USAGE_ACTIVITY_MODEL } from "@/lib/usage/fold";
import type { FeatSession } from "@/lib/usage/fold";
import type { ProfileUsage } from "@/lib/usage/contracts";
import { formatUsageTokens } from "@/lib/usage/format";
import type { BadgeCandidate, BadgeEvidence, BadgeId, LeaderboardRankSnapshot } from "./contracts";

const MINUTES_4H = 4 * 60;
const MINUTES_12H = 12 * 60;
const MINUTES_24H = 24 * 60;
const TOKENS_1M = 1_000_000;
const TOKENS_50M = 50_000_000;
const TOKENS_500M = 500_000_000;

export type ProjectFeatInput = {
  projectId: string;
  chapterId: string | null;
  sessions: FeatSession[];
};

export type EvaluateBadgesInput = {
  projects: ProjectFeatInput[];
  usage: Pick<ProfileUsage, "currentStreak" | "longestStreak" | "days">;
  publishedStoryCount: number;
  maxChapterIndex: number;
  hasVerifiedPublishedRepo: boolean;
  ranks: LeaderboardRankSnapshot[];
};

export function evaluateBadges(input: EvaluateBadgesInput): BadgeCandidate[] {
  const earned: BadgeCandidate[] = [];
  earned.push(...evaluateEnduranceAndVolume(input.projects));
  earned.push(...evaluateConsistency(input.usage));
  earned.push(...evaluateCraft(input));
  earned.push(...evaluateLeague(input.ranks));
  return uniqueByBadge(earned);
}

export function evaluateLeague(ranks: LeaderboardRankSnapshot[]): BadgeCandidate[] {
  const earned: BadgeCandidate[] = [];
  if (ranks.length === 0) return earned;
  const bestSpend = Math.min(...ranks.map((row) => row.rankSpend));
  const bestTokens = Math.min(...ranks.map((row) => row.rankTokens));
  const allTime = ranks.find((row) => row.period === "all-time");
  earned.push({
    badgeId: "on-the-board",
    evidence: {
      value: Math.min(bestSpend, bestTokens),
      unit: "rank",
      label: `Ranked #${Math.min(bestSpend, bestTokens)} on the public board`,
    },
    sourceProjectId: null,
    sourceChapterId: null,
  });
  if (allTime && (allTime.rankSpend <= 10 || allTime.rankTokens <= 10)) {
    const rank = Math.min(allTime.rankSpend, allTime.rankTokens);
    earned.push({
      badgeId: "podium",
      evidence: {
        value: rank,
        unit: "rank",
        label: `All-time #${rank} on ${allTime.rankTokens <= allTime.rankSpend ? "tokens" : "spend"}`,
      },
      sourceProjectId: null,
      sourceChapterId: null,
    });
  }
  const champion = ranks.find((row) => row.rankSpend === 1 || row.rankTokens === 1);
  if (champion) {
    const metric = champion.rankTokens === 1 ? "tokens" : "spend";
    earned.push({
      badgeId: "league-champion",
      evidence: {
        value: 1,
        unit: "rank",
        label: `First on ${champion.period} ${metric}`,
      },
      sourceProjectId: null,
      sourceChapterId: null,
    });
  }
  return earned;
}

function evaluateEnduranceAndVolume(projects: ProjectFeatInput[]): BadgeCandidate[] {
  const earned: BadgeCandidate[] = [];
  let longest: { session: FeatSession; project: ProjectFeatInput } | null = null;
  let heaviest: { session: FeatSession; project: ProjectFeatInput } | null = null;
  for (const project of projects) {
    for (const session of project.sessions) {
      if (!longest || session.durationMinutes > longest.session.durationMinutes) {
        longest = { session, project };
      }
      if (!heaviest || session.totalTokens > heaviest.session.totalTokens) {
        heaviest = { session, project };
      }
    }
  }
  if (longest) {
    const minutes = longest.session.durationMinutes;
    const label = `${formatDuration(minutes)} session · ${dayLabel(longest.session.startedAt)}`;
    const evidence = sessionEvidence(longest, minutes, "minutes", label);
    if (minutes >= MINUTES_4H) earned.push(candidate("dawn-watch", evidence, longest.project));
    if (minutes >= MINUTES_12H) earned.push(candidate("iron-session", evidence, longest.project));
    if (minutes >= MINUTES_24H) earned.push(candidate("sleepless", evidence, longest.project));
  }
  if (heaviest && heaviest.session.totalTokens > 0) {
    const tokens = heaviest.session.totalTokens;
    const label = `${formatUsageTokens(tokens)} tokens in one session · ${dayLabel(heaviest.session.startedAt)}`;
    const evidence = sessionEvidence(heaviest, tokens, "tokens", label);
    if (tokens >= TOKENS_1M) earned.push(candidate("heavyweight", evidence, heaviest.project));
    if (tokens >= TOKENS_50M) earned.push(candidate("furnace", evidence, heaviest.project));
    if (tokens >= TOKENS_500M) earned.push(candidate("token-titan", evidence, heaviest.project));
  }
  return earned;
}

function evaluateConsistency(usage: Pick<ProfileUsage, "currentStreak" | "longestStreak">): BadgeCandidate[] {
  const earned: BadgeCandidate[] = [];
  const streak = Math.max(usage.currentStreak, usage.longestStreak);
  if (streak >= 7) {
    earned.push(career("seven-suns", streak, "days", `${streak}-day streak`));
  }
  if (usage.longestStreak >= 30) {
    earned.push(career("month-of-making", usage.longestStreak, "days", `${usage.longestStreak}-day longest streak`));
  }
  if (usage.longestStreak >= 100) {
    earned.push(career("century", usage.longestStreak, "days", `${usage.longestStreak}-day longest streak`));
  }
  void streak;
  return earned;
}

function evaluateCraft(input: EvaluateBadgesInput): BadgeCandidate[] {
  const earned: BadgeCandidate[] = [];
  if (input.publishedStoryCount >= 1) {
    earned.push(career("first-light", input.publishedStoryCount, "count", "First published story"));
  }
  if (input.maxChapterIndex >= 2) {
    earned.push(career("chapter-two", input.maxChapterIndex, "count", `Chapter ${input.maxChapterIndex} published`));
  }
  if (input.hasVerifiedPublishedRepo) {
    earned.push(career("verified-trail", 1, "count", "Verified repository on a published story"));
  }
  const models = distinctModels(input.usage);
  if (models >= 4) {
    earned.push(career("polyglot", models, "count", `${models} models on published scans`));
  }
  return earned;
}

function distinctModels(usage: Pick<ProfileUsage, "days">): number {
  const keys = new Set<string>();
  for (const day of usage.days) {
    for (const model of day.models) {
      if (model.key && model.key !== USAGE_ACTIVITY_MODEL) keys.add(model.key);
    }
  }
  return keys.size;
}

function sessionEvidence(
  hit: { session: FeatSession; project: ProjectFeatInput },
  value: number,
  unit: BadgeEvidence["unit"],
  label: string,
): BadgeEvidence {
  return {
    value,
    unit,
    label,
    projectId: hit.project.projectId,
    sessionRef: hit.session.sessionRef,
  };
}

function candidate(badgeId: BadgeId, evidence: BadgeEvidence, project: ProjectFeatInput): BadgeCandidate {
  return {
    badgeId,
    evidence,
    sourceProjectId: project.projectId,
    sourceChapterId: project.chapterId,
  };
}

function career(badgeId: BadgeId, value: number, unit: BadgeEvidence["unit"], label: string): BadgeCandidate {
  return {
    badgeId,
    evidence: { value, unit, label },
    sourceProjectId: null,
    sourceChapterId: null,
  };
}

function uniqueByBadge(candidates: BadgeCandidate[]): BadgeCandidate[] {
  const seen = new Map<BadgeId, BadgeCandidate>();
  for (const candidate of candidates) {
    if (!seen.has(candidate.badgeId)) seen.set(candidate.badgeId, candidate);
  }
  return Array.from(seen.values());
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours <= 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

function dayLabel(timestamp: string): string {
  const day = timestamp.slice(0, 10);
  const parsed = Date.parse(`${day}T12:00:00.000Z`);
  if (!Number.isFinite(parsed)) return day;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(parsed);
}
