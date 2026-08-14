export const LEADERBOARD_PERIODS = ["7d", "30d", "all-time"] as const;
export type LeaderboardPeriod = (typeof LEADERBOARD_PERIODS)[number];

export const LEADERBOARD_METRICS = ["spend", "tokens"] as const;
export type LeaderboardMetric = (typeof LEADERBOARD_METRICS)[number];

export const DEFAULT_LEADERBOARD_PERIOD: LeaderboardPeriod = "30d";
export const DEFAULT_LEADERBOARD_METRIC: LeaderboardMetric = "spend";

export function isLeaderboardPeriod(value: unknown): value is LeaderboardPeriod {
  return typeof value === "string" && (LEADERBOARD_PERIODS as readonly string[]).includes(value);
}

export function isLeaderboardMetric(value: unknown): value is LeaderboardMetric {
  return typeof value === "string" && (LEADERBOARD_METRICS as readonly string[]).includes(value);
}

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
  spendMicroUsd: number | null;
  tokens: number;
  commitCount: number;
  activeDays: number;
  lastActiveAt: string | null;
  sessionCount: number;
  storyCount: number;
};
