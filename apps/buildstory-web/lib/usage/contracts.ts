export type ProfileUsageDayModel = {
  key: string;
  label: string;
  tokens: number;
  spendMicroUsd: number | null;
};

export type ProfileUsageDay = {
  day: string;
  models: ProfileUsageDayModel[];
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
};
