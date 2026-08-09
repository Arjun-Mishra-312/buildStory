import assert from "node:assert/strict";
import test from "node:test";
import {
  completeOnboarding,
  deleteAccountData,
  ensureUser,
  listGuidance,
  setGuidance,
} from "../lib/ingestion/mock-store";

test("new mock accounts stay incomplete until onboarding is submitted", () => {
  const session = { creatorId: "test:onboarding-incomplete", name: "New Builder", email: "new-builder@example.test", image: null };
  const user = ensureUser(session);
  assert.equal(user.onboardingCompletedAt, null);

  const profile = completeOnboarding(user.id, {
    displayName: "New Builder",
    handle: "new-builder",
    bio: "Building in public, thoughtfully.",
    builderRole: "engineer",
  });
  assert.equal(profile.handle, "new-builder");
  assert.equal(profile.builderRole, "engineer");
  assert.ok(profile.onboardingCompletedAt);

  const retry = completeOnboarding(user.id, {
    displayName: "New Builder",
    handle: "new-builder",
    bio: "Building in public, thoughtfully.",
    builderRole: "engineer",
  });
  assert.equal(retry.onboardingCompletedAt, profile.onboardingCompletedAt);
  assert.throws(() => completeOnboarding(user.id, { displayName: "Changed", handle: "changed-name" }), /already complete/);
});

test("guidance is versioned, replayable, and deleted with the account", () => {
  const user = ensureUser({ creatorId: "test:guidance-account", name: "Guide Builder", email: "guide-builder@example.test", image: null });
  const saved = setGuidance(user.id, "studio-overview", 1, "dismissed");
  assert.equal(saved.state, "dismissed");
  assert.deepEqual(listGuidance(user.id), [saved]);

  setGuidance(user.id, "studio-overview", 1, "completed");
  assert.equal(listGuidance(user.id)[0]?.state, "completed");
  assert.throws(() => setGuidance(user.id, "studio-overview", 2, "completed"), /not available/);

  deleteAccountData(user.id);
  assert.deepEqual(listGuidance(user.id), []);
});
