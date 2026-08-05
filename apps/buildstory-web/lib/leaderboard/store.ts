import type { LeaderboardPeriod } from "./contracts";

function shouldUseDurableStore() {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.BUILDSTORY_STORE === "d1"
  );
}

export async function getLeaderboard(period: LeaderboardPeriod, limit?: number) {
  if (shouldUseDurableStore()) {
    const { getLeaderboard: get } = await import("./d1-store");
    return get(period, limit);
  }
  const { getLeaderboard: get } = await import("./mock-store");
  return get(period, limit);
}

/** No-op in mock mode - the in-memory computation is always live, there is nothing to precompute. */
export async function recomputeLeaderboard(period: LeaderboardPeriod) {
  if (!shouldUseDurableStore()) return;
  const { recomputeLeaderboard: recompute } = await import("./d1-store");
  await recompute(period);
}
