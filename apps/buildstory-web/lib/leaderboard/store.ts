import type { LeaderboardMetric, LeaderboardPeriod } from "./contracts";

function shouldUseDurableStore() {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.BUILDSTORY_STORE === "d1"
  );
}

export async function getLeaderboard(period: LeaderboardPeriod, limit?: number, metric?: LeaderboardMetric) {
  if (shouldUseDurableStore()) {
    const { getLeaderboard: get } = await import("./d1-store");
    return get(period, limit, metric);
  }
  const { getLeaderboard: get } = await import("./mock-store");
  return get(period, limit, metric);
}

/** No-op in mock mode - the in-memory computation is always live, there is nothing to precompute. */
export async function recomputeLeaderboard(period: LeaderboardPeriod) {
  if (!shouldUseDurableStore()) return;
  const { recomputeLeaderboard: recompute } = await import("./d1-store");
  await recompute(period);
}

export async function recomputeAllLeaderboards() {
  if (!shouldUseDurableStore()) return;
  const { recomputeAllLeaderboards: recompute } = await import("./d1-store");
  await recompute();
}
