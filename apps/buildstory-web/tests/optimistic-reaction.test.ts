import assert from "node:assert/strict";
import test from "node:test";
import { optimisticReactionSummary } from "../lib/social/optimistic-reaction";

const empty = { counts: { fire: 0, mindblown: 0, relatable: 0, shipped: 0 }, total: 0, viewerReaction: null } as const;

test("optimistic reactions add, switch, and toggle off without violating one reaction per viewer", () => {
  const added = optimisticReactionSummary(empty, "fire");
  assert.deepEqual(added, { counts: { fire: 1, mindblown: 0, relatable: 0, shipped: 0 }, total: 1, viewerReaction: "fire" });
  const switched = optimisticReactionSummary(added, "mindblown");
  assert.deepEqual(switched, { counts: { fire: 0, mindblown: 1, relatable: 0, shipped: 0 }, total: 1, viewerReaction: "mindblown" });
  const removed = optimisticReactionSummary(switched, "mindblown");
  assert.deepEqual(removed, empty);
});

test("the previous summary remains untouched for a failed-request rollback", () => {
  const previous = structuredClone(empty);
  optimisticReactionSummary(previous, "relatable");
  assert.deepEqual(previous, empty);
});
