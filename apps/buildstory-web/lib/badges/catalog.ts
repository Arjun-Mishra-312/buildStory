import type { BadgeId, BadgeRarity, BadgeSet } from "./contracts";

export type BadgeCatalogEntry = {
  id: BadgeId;
  name: string;
  kicker: string;
  set: BadgeSet;
  rarity: BadgeRarity;
  assetPath: string;
  storyNative: boolean;
};

const LOCKED_ASSET = "/assets/badges/locked.png";

const CATALOG: Record<BadgeId, Omit<BadgeCatalogEntry, "id">> = {
  "dawn-watch": {
    name: "Dawn Watch",
    kicker: "One sitting that outlasted the ordinary afternoon.",
    set: "endurance",
    rarity: "common",
    assetPath: "/assets/badges/dawn-watch.png",
    storyNative: true,
  },
  "iron-session": {
    name: "Iron Session",
    kicker: "Twelve hours in the same problem, without closing the trail.",
    set: "endurance",
    rarity: "rare",
    assetPath: "/assets/badges/iron-session.png",
    storyNative: true,
  },
  sleepless: {
    name: "Sleepless",
    kicker: "A session that crossed a full day and kept going.",
    set: "endurance",
    rarity: "legendary",
    assetPath: "/assets/badges/sleepless.png",
    storyNative: true,
  },
  heavyweight: {
    name: "Heavyweight",
    kicker: "A million tokens moved in a single session.",
    set: "volume",
    rarity: "common",
    assetPath: "/assets/badges/heavyweight.png",
    storyNative: true,
  },
  furnace: {
    name: "Furnace",
    kicker: "Fifty million tokens through one sitting.",
    set: "volume",
    rarity: "rare",
    assetPath: "/assets/badges/furnace.png",
    storyNative: true,
  },
  "token-titan": {
    name: "Token Titan",
    kicker: "Five hundred million tokens in one session — a receipt, not a slogan.",
    set: "volume",
    rarity: "legendary",
    assetPath: "/assets/badges/token-titan.png",
    storyNative: true,
  },
  "seven-suns": {
    name: "Seven Suns",
    kicker: "A week of consecutive published-scan days.",
    set: "consistency",
    rarity: "common",
    assetPath: "/assets/badges/seven-suns.png",
    storyNative: false,
  },
  "month-of-making": {
    name: "Month of Making",
    kicker: "Thirty consecutive active days on the public trail.",
    set: "consistency",
    rarity: "rare",
    assetPath: "/assets/badges/month-of-making.png",
    storyNative: false,
  },
  century: {
    name: "Century",
    kicker: "A hundred-day streak. The calendar bent around the work.",
    set: "consistency",
    rarity: "legendary",
    assetPath: "/assets/badges/century.png",
    storyNative: false,
  },
  "first-light": {
    name: "First Light",
    kicker: "The first published build story.",
    set: "league",
    rarity: "common",
    assetPath: "/assets/badges/first-light.png",
    storyNative: false,
  },
  polyglot: {
    name: "Polyglot",
    kicker: "Four distinct models on published scans.",
    set: "league",
    rarity: "rare",
    assetPath: "/assets/badges/polyglot.png",
    storyNative: false,
  },
  "on-the-board": {
    name: "On the Board",
    kicker: "Ranked among published builders.",
    set: "league",
    rarity: "common",
    assetPath: "/assets/badges/on-the-board.png",
    storyNative: false,
  },
  podium: {
    name: "Podium",
    kicker: "Top ten, all-time, on spend or tokens.",
    set: "league",
    rarity: "rare",
    assetPath: "/assets/badges/podium.png",
    storyNative: false,
  },
  "league-champion": {
    name: "League Champion",
    kicker: "First place on a live leaderboard window.",
    set: "league",
    rarity: "legendary",
    assetPath: "/assets/badges/league-champion.png",
    storyNative: false,
  },
  "chapter-two": {
    name: "Chapter Two",
    kicker: "A later chapter, published on the same trail.",
    set: "league",
    rarity: "common",
    assetPath: "/assets/badges/chapter-two.png",
    storyNative: false,
  },
  "verified-trail": {
    name: "Verified Trail",
    kicker: "A published story tied to a verified repository.",
    set: "league",
    rarity: "common",
    assetPath: "/assets/badges/verified-trail.png",
    storyNative: false,
  },
};

export const BADGE_CATALOG: BadgeCatalogEntry[] = (Object.keys(CATALOG) as BadgeId[]).map((id) => ({
  id,
  ...CATALOG[id],
}));

export function badgeEntry(id: BadgeId): BadgeCatalogEntry {
  return { id, ...CATALOG[id] };
}

export function lockedBadgeAsset(): string {
  return LOCKED_ASSET;
}

export function rarityRank(rarity: BadgeRarity): number {
  if (rarity === "legendary") return 3;
  if (rarity === "rare") return 2;
  return 1;
}

export const BADGES_BY_SET: Record<BadgeSet, BadgeId[]> = {
  endurance: ["dawn-watch", "iron-session", "sleepless"],
  volume: ["heavyweight", "furnace", "token-titan"],
  consistency: ["seven-suns", "month-of-making", "century"],
  league: ["first-light", "polyglot", "on-the-board", "podium", "league-champion", "chapter-two", "verified-trail"],
};
