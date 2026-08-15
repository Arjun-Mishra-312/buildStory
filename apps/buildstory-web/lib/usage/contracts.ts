export type ProfileUsageDayModel = {
  key: string;
  label: string;
  tokens: number;
  spendMicroUsd: number | null;
};

export type ProfileUsageDay = {
  day: string;
  sessionCount: number;
  models: ProfileUsageDayModel[];
};

export type ProfileUsageHour = {
  hour: number;
  sessions: number;
  spendMicroUsd: number;
};

export type ProfileUsage = {
  spendMicroUsd: number | null;
  tokens: number;
  unpricedTokens: number;
  sessionCount: number;
  activeDays: number;
  currentStreak: number;
  longestStreak: number;
  lastActiveAt: string | null;
  topSpendModel: { key: string; label: string } | null;
  rank: number | null;
  days: ProfileUsageDay[];
  /** Session-start hours (UTC). Present on the owner private view only. */
  hours?: ProfileUsageHour[];
};
