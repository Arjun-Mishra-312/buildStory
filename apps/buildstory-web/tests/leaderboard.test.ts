import assert from "node:assert/strict";
import test from "node:test";
import {
  acceptSnapshot,
  claimUploadSession,
  createUploadSession,
  ensureUser,
  getReport,
  publishReport,
} from "../lib/ingestion/mock-store";
import { sha256Digest } from "../lib/ingestion/local-contract";
import { ANTI_GAMING_MAX_COMMITS_PER_DAY } from "../lib/leaderboard/contracts";
import { getLeaderboard } from "../lib/leaderboard/mock-store";
import scannerFixture from "./fixtures/scanner-project-snapshot.json";

process.env.BUILDSTORY_REPORT_READY_DELAY_MS = "0";

/** The fixture's milestone summary is a scanner-generated aggregate the server cross-checks against git.commits, so both must change together. */
function withCommitCount(commits: number) {
  const snapshot = structuredClone(scannerFixture);
  snapshot.git.commits = commits;
  const repositoryMilestone = snapshot.milestones.find((milestone) => milestone.kind === "repository-activity");
  if (repositoryMilestone) {
    repositoryMilestone.summary = `${commits} commits observed in the selected time window.`;
  }
  return snapshot;
}

async function publishSnapshotForUser(creatorId: string, commits: number) {
  const created = await createUploadSession(creatorId, "Leaderboard test project", "http://localhost/");
  const { sessionId, userCode } = created.deviceAuthorization;
  const claim = await claimUploadSession(sessionId, userCode);
  const snapshot = withCommitCount(commits);
  const raw = JSON.stringify(snapshot);
  const receipt = await acceptSnapshot(sessionId, claim.uploadGrant.bearerToken, await sha256Digest(raw), snapshot);
  const reportId = receipt.reportEndpoint!.split("/").at(-1)!;
  await getReport(creatorId, reportId); // lazily flips the report to "ready"
  await publishReport(creatorId, reportId);
}

test("leaderboard: caps a project's commit contribution at activeDays * daily max, not the raw count", async () => {
  const gamerCreatorId = "dev:leaderboard-gamer";
  const gamerUser = ensureUser({
    creatorId: gamerCreatorId,
    name: "Leaderboard Gamer",
    email: "gamer@buildstory.local",
    image: null,
  });
  const modestCreatorId = "dev:leaderboard-modest";
  const modestUser = ensureUser({
    creatorId: modestCreatorId,
    name: "Leaderboard Modest",
    email: "modest@buildstory.local",
    image: null,
  });

  // The fixture's single session gives exactly 1 active day, so the cap for
  // one project is 1 * ANTI_GAMING_MAX_COMMITS_PER_DAY regardless of git.commits.
  await publishSnapshotForUser(gamerCreatorId, 500);
  await publishSnapshotForUser(modestCreatorId, 5);

  const entries = getLeaderboard("all-time", 100);
  const gamerEntry = entries.find((entry) => entry.user.id === gamerUser.id);
  const modestEntry = entries.find((entry) => entry.user.id === modestUser.id);
  assert.ok(gamerEntry, "gamer should appear on the leaderboard");
  assert.ok(modestEntry, "modest builder should appear on the leaderboard");

  assert.equal(gamerEntry!.score, ANTI_GAMING_MAX_COMMITS_PER_DAY);
  assert.equal(modestEntry!.score, 5);
  assert.ok(
    gamerEntry!.rank < modestEntry!.rank,
    "capped score still outranks a smaller uncapped score, but never reflects the raw 500 commits",
  );
});

test("leaderboard: unpublished reports never contribute", async () => {
  const draftCreatorId = "dev:leaderboard-draft-only";
  const draftUser = ensureUser({
    creatorId: draftCreatorId,
    name: "Leaderboard Draft Only",
    email: "draft@buildstory.local",
    image: null,
  });
  const created = await createUploadSession(draftCreatorId, "Unpublished project", "http://localhost/");
  const { sessionId, userCode } = created.deviceAuthorization;
  const claim = await claimUploadSession(sessionId, userCode);
  const snapshot = withCommitCount(999);
  const raw = JSON.stringify(snapshot);
  await acceptSnapshot(sessionId, claim.uploadGrant.bearerToken, await sha256Digest(raw), snapshot);
  // Deliberately never published.

  const entries = getLeaderboard("all-time", 200);
  assert.equal(entries.some((entry) => entry.user.id === draftUser.id), false);
});
