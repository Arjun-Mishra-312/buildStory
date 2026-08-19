import type { ProfileUsage } from "./contracts";

function shouldUseDurableStore() {
  return process.env.NODE_ENV === "production" || process.env.BUILDSTORY_STORE === "d1";
}

/** Superset usage (published + not-yet-published ready scans) shown to every profile viewer. */
export async function getProfileUsage(userId: string): Promise<ProfileUsage> {
  if (shouldUseDurableStore()) {
    const { getProfileUsage: get } = await import("./d1-store");
    return get(userId);
  }
  const { getProfileUsage: get } = await import("../leaderboard/mock-store");
  return get(userId);
}

/** Published-only usage, for badges/leaderboard — not shown on the profile page. */
export async function getPublishedProfileUsage(userId: string): Promise<ProfileUsage> {
  if (shouldUseDurableStore()) {
    const { getPublishedProfileUsage: get } = await import("./d1-store");
    return get(userId);
  }
  const { getPublishedProfileUsage: get } = await import("../leaderboard/mock-store");
  return get(userId);
}
