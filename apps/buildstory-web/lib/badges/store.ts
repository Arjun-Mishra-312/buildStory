import type { BadgeAwardRecord, BadgeCandidate, BadgeEvidence, BadgeId, ProfileBadgeView, PublicBadgeAward } from "./contracts";
import { isBadgeId } from "./contracts";
import { storySeals } from "./assemble";
import { badgeEntry } from "./catalog";

function shouldUseDurableStore() {
  return process.env.NODE_ENV === "production" || process.env.BUILDSTORY_STORE === "d1";
}

async function backend() {
  if (shouldUseDurableStore()) return import("./d1-store");
  return import("./mock-store");
}

export async function listUserAwards(userId: string): Promise<PublicBadgeAward[]> {
  return (await backend()).listUserAwards(userId);
}

export async function getProfileBadges(userId: string, isOwner: boolean): Promise<ProfileBadgeView> {
  return (await backend()).getProfileBadges(userId, isOwner);
}

export async function getStorySeals(userId: string, projectId: string): Promise<PublicBadgeAward[]> {
  const awards = await (await backend()).listUserAwards(userId);
  return storySeals(awards, projectId);
}

export async function getStorySealsForPath(handle: string, slug: string): Promise<PublicBadgeAward[]> {
  return (await backend()).getStorySealsForPath(handle, slug);
}

export async function getPinnedBadgesByUserIds(userIds: string[]): Promise<Map<string, PublicBadgeAward[]>> {
  return (await backend()).getPinnedBadgesByUserIds(userIds);
}

export async function pinBadges(userId: string, badgeIds: BadgeId[]): Promise<ProfileBadgeView> {
  return (await backend()).pinBadges(userId, badgeIds);
}

export async function refreshUserBadges(userId: string): Promise<PublicBadgeAward[]> {
  return (await backend()).refreshUserBadges(userId);
}

export async function refreshLeagueBadges(): Promise<void> {
  await (await backend()).refreshLeagueBadges();
}

export function summarizeAwards(awards: PublicBadgeAward[]) {
  return awards.map((award) => ({
    badgeId: award.badgeId,
    name: award.name,
    kicker: award.kicker,
    rarity: award.rarity,
    evidence: award.evidence.label,
  }));
}

export function catalogName(id: BadgeId) {
  return badgeEntry(id).name;
}

export type { BadgeAwardRecord, BadgeCandidate, BadgeEvidence, BadgeId, ProfileBadgeView, PublicBadgeAward };
export { isBadgeId };
