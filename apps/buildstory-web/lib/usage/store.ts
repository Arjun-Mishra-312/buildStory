import type { ProfileUsage } from "./contracts";

function shouldUseDurableStore() {
  return process.env.NODE_ENV === "production" || process.env.BUILDSTORY_STORE === "d1";
}

export async function getProfileUsage(userId: string): Promise<ProfileUsage> {
  if (shouldUseDurableStore()) {
    const { getProfileUsage: get } = await import("./d1-store");
    return get(userId);
  }
  const { getProfileUsage: get } = await import("../leaderboard/mock-store");
  return get(userId);
}

export async function getPrivateProfileUsage(userId: string): Promise<ProfileUsage> {
  if (shouldUseDurableStore()) {
    const { getPrivateProfileUsage: get } = await import("./d1-store");
    return get(userId);
  }
  const { getPrivateProfileUsage: get } = await import("../leaderboard/mock-store");
  return get(userId);
}
