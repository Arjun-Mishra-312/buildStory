import type { ReactionKind, ReactionSummary } from "./contracts";

/** Mirrors the server's one-reaction-per-viewer toggle semantics before the request resolves. */
export function optimisticReactionSummary(current: ReactionSummary, kind: ReactionKind): ReactionSummary {
  const counts = { ...current.counts };
  if (current.viewerReaction === kind) {
    counts[kind] = Math.max(0, (counts[kind] ?? 0) - 1);
    return { counts, total: Math.max(0, current.total - 1), viewerReaction: null };
  }
  if (current.viewerReaction) counts[current.viewerReaction] = Math.max(0, (counts[current.viewerReaction] ?? 0) - 1);
  counts[kind] = (counts[kind] ?? 0) + 1;
  return { counts, total: current.total + (current.viewerReaction ? 0 : 1), viewerReaction: kind };
}
