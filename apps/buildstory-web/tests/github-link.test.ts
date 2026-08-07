import assert from "node:assert/strict";
import test from "node:test";
import { pickVerifiedPrimaryEmail, resolveGithubCreatorId, type GithubIdentityStore } from "../lib/auth/github-link";

test("pickVerifiedPrimaryEmail only trusts an email that is both primary and verified", () => {
  assert.equal(
    pickVerifiedPrimaryEmail([
      { email: "old@example.com", primary: false, verified: true },
      { email: "unverified@example.com", primary: true, verified: false },
      { email: "real@example.com", primary: true, verified: true },
    ]),
    "real@example.com",
  );
  assert.equal(pickVerifiedPrimaryEmail([{ email: "unverified@example.com", primary: true, verified: false }]), null);
  assert.equal(pickVerifiedPrimaryEmail([]), null);
});

function fakeStore(seed: { identities?: Map<string, { userId: string; authSubject: string }>; usersByEmail?: Map<string, { userId: string; authSubject: string }> } = {}) {
  const identities = seed.identities ?? new Map<string, { userId: string; authSubject: string }>();
  const usersByEmail = seed.usersByEmail ?? new Map<string, { userId: string; authSubject: string }>();
  const linked: Array<{ userId: string; provider: string; subject: string; email: string }> = [];
  const verifiedMarks: string[] = [];
  const store: GithubIdentityStore = {
    async findUserByIdentity(provider, subject) {
      return identities.get(`${provider}:${subject}`) ?? null;
    },
    async findUserByVerifiedEmail(email) {
      return usersByEmail.get(email.toLowerCase()) ?? null;
    },
    async linkIdentity(userId, provider, subject, email) {
      linked.push({ userId, provider, subject, email });
      identities.set(`${provider}:${subject}`, { userId, authSubject: usersByEmail.get(email.toLowerCase())?.authSubject ?? userId });
    },
    async markEmailVerified(userId) {
      verifiedMarks.push(userId);
    },
  };
  return { store, linked, verifiedMarks };
}

test("resolveGithubCreatorId returns a fresh github:<subject> for a brand-new subject with no email match", async () => {
  const { store, linked } = fakeStore();
  const creatorId = await resolveGithubCreatorId("999", async () => null, store);
  assert.equal(creatorId, "github:999");
  assert.equal(linked.length, 0, "nothing is linked when there's no match to link to");
});

test("resolveGithubCreatorId auto-links and resolves to the existing user's original authSubject on a verified email match", async () => {
  const usersByEmail = new Map([["dev@buildstory.local", { userId: "usr_1", authSubject: "google:sub-1" }]]);
  const { store, linked, verifiedMarks } = fakeStore({ usersByEmail });

  const creatorId = await resolveGithubCreatorId("42", async () => "dev@buildstory.local", store);

  assert.equal(creatorId, "google:sub-1", "resolves back to the ORIGINAL authSubject, not a new github: one");
  assert.deepEqual(linked, [{ userId: "usr_1", provider: "github", subject: "42", email: "dev@buildstory.local" }]);
  assert.deepEqual(verifiedMarks, ["usr_1"]);
});

test("resolveGithubCreatorId never auto-links when the incoming email isn't verified (fetcher returns null)", async () => {
  const usersByEmail = new Map([["dev@buildstory.local", { userId: "usr_1", authSubject: "google:sub-1" }]]);
  const { store, linked } = fakeStore({ usersByEmail });

  const creatorId = await resolveGithubCreatorId("42", async () => null, store);

  assert.equal(creatorId, "github:42", "falls back to a fresh identity rather than guessing a match");
  assert.equal(linked.length, 0);
});

test("resolveGithubCreatorId short-circuits on an already-linked subject without re-fetching email", async () => {
  const identities = new Map([["github:42", { userId: "usr_1", authSubject: "google:sub-1" }]]);
  const { store, verifiedMarks } = fakeStore({ identities });
  let fetchCalls = 0;

  const creatorId = await resolveGithubCreatorId(
    "42",
    async () => {
      fetchCalls += 1;
      return "dev@buildstory.local";
    },
    store,
  );

  assert.equal(creatorId, "google:sub-1");
  assert.equal(fetchCalls, 0, "an already-linked subject resolves without hitting the emails API");
  assert.deepEqual(verifiedMarks, ["usr_1"]);
});
