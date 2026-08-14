import type { BadgeAwardRecord, BadgeSet, ProfileBadgeView, PublicBadgeAward } from "./contracts";
import { BADGE_CATALOG, BADGES_BY_SET, badgeEntry, lockedBadgeAsset, rarityRank } from "./catalog";

export function toPublicAward(
  record: BadgeAwardRecord,
  sourceStoryHref: string | null,
): PublicBadgeAward {
  const entry = badgeEntry(record.badgeId);
  return {
    badgeId: record.badgeId,
    name: entry.name,
    kicker: entry.kicker,
    set: entry.set,
    rarity: entry.rarity,
    assetPath: entry.assetPath,
    earnedAt: record.earnedAt,
    evidence: record.evidence,
    sourceProjectId: record.sourceProjectId,
    sourceStoryHref,
    pinnedRank: record.pinnedRank,
  };
}

export function assembleProfileBadges(awards: PublicBadgeAward[], isOwner: boolean): ProfileBadgeView {
  const earnedIds = new Set(awards.map((award) => award.badgeId));
  const completedSets = (Object.keys(BADGES_BY_SET) as BadgeSet[]).filter((set) =>
    BADGES_BY_SET[set].every((id) => earnedIds.has(id)),
  );
  const showcase = pickShowcase(awards);
  const showcaseIds = new Set(showcase.map((award) => award.badgeId));
  const collection = [...awards]
    .sort(compareAwards)
    .filter((award) => !showcaseIds.has(award.badgeId));
  const locked = isOwner
    ? BADGE_CATALOG.filter((entry) => !earnedIds.has(entry.id)).map((entry) => ({
        badgeId: entry.id,
        name: entry.name,
        kicker: entry.kicker,
        set: entry.set,
        rarity: entry.rarity,
        assetPath: lockedBadgeAsset(),
      }))
    : [];
  return { showcase, collection, locked, completedSets };
}

export function pickShowcase(awards: PublicBadgeAward[], limit = 3): PublicBadgeAward[] {
  const pinned = awards
    .filter((award) => award.pinnedRank != null)
    .sort((left, right) => (left.pinnedRank ?? 99) - (right.pinnedRank ?? 99));
  if (pinned.length > 0) return pinned.slice(0, limit);
  return [...awards].sort(compareAwards).slice(0, limit);
}

export function storySeals(awards: PublicBadgeAward[], projectId: string, limit = 3): PublicBadgeAward[] {
  return awards
    .filter((award) => award.sourceProjectId === projectId)
    .sort(compareAwards)
    .slice(0, limit);
}

function compareAwards(left: PublicBadgeAward, right: PublicBadgeAward): number {
  const rarity = rarityRank(right.rarity) - rarityRank(left.rarity);
  if (rarity !== 0) return rarity;
  return right.earnedAt.localeCompare(left.earnedAt);
}
