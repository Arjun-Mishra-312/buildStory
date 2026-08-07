export const LEADERBOARD_PERIODS = ["all-time"] as const;
export type LeaderboardPeriod = (typeof LEADERBOARD_PERIODS)[number];

export function isLeaderboardPeriod(value: unknown): value is LeaderboardPeriod {
  return typeof value === "string" && (LEADERBOARD_PERIODS as readonly string[]).includes(value);
}

/**
 * A single overnight run should not outrank sustained daily building - each
 * project's commit contribution is capped at activeDays * this value before
 * summing across a builder's projects. See lib/leaderboard/compute.
 */
export const ANTI_GAMING_MAX_COMMITS_PER_DAY = 20;

/**
 * A project with a GitHub-ownership-verified repository (buildstory_projects.
 * verified_repo_at) contributes this much more to its owner's score than an
 * unverified one - proof beats self-report. Applied per project, after the
 * anti-gaming cap above, not as a flat leaderboard-wide multiplier.
 */
export const VERIFIED_REPO_SCORE_MULTIPLIER = 1.15;

/** A read older than this triggers a bounded lazy recompute if no scheduled/manual run has happened recently. */
export const LEADERBOARD_STALE_MS = 60 * 60 * 1_000;

export type LeaderboardMember = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
};

export type LeaderboardEntry = {
  rank: number;
  user: LeaderboardMember;
  score: number;
  activeDays: number;
  storyCount: number;
};
