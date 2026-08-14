export const BADGE_RARITIES = ["common", "rare", "legendary"] as const;
export type BadgeRarity = (typeof BADGE_RARITIES)[number];

export const BADGE_SETS = ["endurance", "volume", "consistency", "league"] as const;
export type BadgeSet = (typeof BADGE_SETS)[number];

export const BADGE_IDS = [
  "dawn-watch",
  "iron-session",
  "sleepless",
  "heavyweight",
  "furnace",
  "token-titan",
  "seven-suns",
  "month-of-making",
  "century",
  "first-light",
  "polyglot",
  "on-the-board",
  "podium",
  "league-champion",
  "chapter-two",
  "verified-trail",
] as const;
export type BadgeId = (typeof BADGE_IDS)[number];

export function isBadgeId(value: unknown): value is BadgeId {
  return typeof value === "string" && (BADGE_IDS as readonly string[]).includes(value);
}

export type BadgeEvidence = {
  value: number;
  unit: "minutes" | "tokens" | "days" | "count" | "rank";
  label: string;
  projectId?: string;
  sessionRef?: string;
};

export type BadgeCandidate = {
  badgeId: BadgeId;
  evidence: BadgeEvidence;
  sourceProjectId: string | null;
  sourceChapterId: string | null;
};

export type BadgeAwardRecord = {
  id: string;
  userId: string;
  badgeId: BadgeId;
  earnedAt: string;
  evidence: BadgeEvidence;
  sourceProjectId: string | null;
  sourceChapterId: string | null;
  pinnedRank: 1 | 2 | 3 | null;
};

export type PublicBadgeAward = {
  badgeId: BadgeId;
  name: string;
  kicker: string;
  set: BadgeSet;
  rarity: BadgeRarity;
  assetPath: string;
  earnedAt: string;
  evidence: BadgeEvidence;
  sourceProjectId: string | null;
  sourceStoryHref: string | null;
  pinnedRank: 1 | 2 | 3 | null;
};

export type ProfileBadgeView = {
  showcase: PublicBadgeAward[];
  collection: PublicBadgeAward[];
  locked: Array<{
    badgeId: BadgeId;
    name: string;
    kicker: string;
    set: BadgeSet;
    rarity: BadgeRarity;
    assetPath: string;
  }>;
  completedSets: BadgeSet[];
};

export type LeaderboardRankSnapshot = {
  period: "7d" | "30d" | "all-time";
  rankSpend: number;
  rankTokens: number;
};

export function parseBadgeEvidence(json: string): BadgeEvidence {
  try {
    const value = JSON.parse(json) as Partial<BadgeEvidence>;
    if (!value || typeof value !== "object") throw new Error("invalid");
    const unit = value.unit;
    if (unit !== "minutes" && unit !== "tokens" && unit !== "days" && unit !== "count" && unit !== "rank") {
      throw new Error("invalid unit");
    }
    return {
      value: typeof value.value === "number" ? value.value : 0,
      unit,
      label: typeof value.label === "string" ? value.label : "",
      projectId: typeof value.projectId === "string" ? value.projectId : undefined,
      sessionRef: typeof value.sessionRef === "string" ? value.sessionRef : undefined,
    };
  } catch {
    return { value: 0, unit: "count", label: "" };
  }
}
