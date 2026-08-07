import assert from "node:assert/strict";
import test from "node:test";
import { deleteAccount, exportAccountData } from "../lib/account/mock-store";
import {
  acceptSnapshot,
  claimUploadSession,
  createUploadSession,
  ensureUser,
  getReport,
  publishReport,
  updateReport,
} from "../lib/ingestion/mock-store";
import { sha256Digest } from "../lib/ingestion/local-contract";
import { AccountError } from "../lib/account/contracts";
import { createComment, followUser, getFollowState, setReaction } from "../lib/social/mock-store";
import scannerFixture from "./fixtures/scanner-project-snapshot.json";

process.env.BUILDSTORY_REPORT_READY_DELAY_MS = "0";

async function publishSnapshotForUser(creatorId: string) {
  const created = await createUploadSession(creatorId, "Account test project", "http://localhost/");
  const { sessionId, userCode } = created.deviceAuthorization;
  const claim = await claimUploadSession(sessionId, userCode);
  const raw = JSON.stringify(scannerFixture);
  const receipt = await acceptSnapshot(sessionId, claim.uploadGrant.bearerToken, await sha256Digest(raw), scannerFixture);
  const reportId = receipt.reportEndpoint!.split("/").at(-1)!;
  await getReport(creatorId, reportId);
  updateReport(creatorId, reportId, { category: "web-apps" });
  await publishReport(creatorId, reportId);
  return reportId;
}

test("account export includes the profile, projects, reports, comments, reactions, and follow graph", async () => {
  const ownerCreatorId = "dev:account-export-owner";
  const owner = ensureUser({ creatorId: ownerCreatorId, name: "Export Owner", email: "owner@buildstory.local", image: null });
  const reportId = await publishSnapshotForUser(ownerCreatorId);

  const fanCreatorId = "dev:account-export-fan";
  const fan = ensureUser({ creatorId: fanCreatorId, name: "Export Fan", email: "fan@buildstory.local", image: null });
  followUser(fan.id, owner.id);
  setReaction(reportId, fan.id, "fire");
  createComment(reportId, fan.id, "Real, tested comment body here.", null);

  const ownerExport = exportAccountData(owner.id);
  assert.equal(ownerExport.profile.handle, owner.handle);
  assert.equal(ownerExport.reports.length, 1);
  assert.equal(ownerExport.reports[0]?.publicationStatus, "published");
  assert.ok(ownerExport.followers.includes(fan.handle));

  const fanExport = exportAccountData(fan.id);
  assert.deepEqual(fanExport.following, [owner.handle]);
  assert.equal(fanExport.reactionsGiven.length, 1);
  assert.equal(fanExport.commentsAuthored.length, 1);

  assert.throws(
    () => exportAccountData("usr_does_not_exist"),
    (error) => error instanceof AccountError && error.code === "not_found",
  );
});

test("account deletion is permanent and removes owned reports plus this user's social footprint, without deleting other users' data on those reports", async () => {
  const ownerCreatorId = "dev:account-delete-owner";
  const owner = ensureUser({ creatorId: ownerCreatorId, name: "Delete Owner", email: "delowner@buildstory.local", image: null });
  const reportId = await publishSnapshotForUser(ownerCreatorId);

  const fanCreatorId = "dev:account-delete-fan";
  const fan = ensureUser({ creatorId: fanCreatorId, name: "Delete Fan", email: "delfan@buildstory.local", image: null });
  followUser(fan.id, owner.id);
  setReaction(reportId, fan.id, "fire");
  const fanComment = createComment(reportId, fan.id, "A comment from someone who is not being deleted.", null);

  deleteAccount(owner.id);

  assert.throws(
    () => exportAccountData(owner.id),
    (error) => error instanceof AccountError && error.code === "not_found",
  );
  assert.throws(
    () => getFollowState(owner.id, null),
    (error) => (error as { code?: string }).code === "not_found",
  );

  // The fan's own account, their reaction/comment record, and their follow
  // of the (now-deleted) owner must not have been collaterally corrupted
  // into a crash - reading their data back should still work cleanly.
  const fanExport = exportAccountData(fan.id);
  assert.equal(fanExport.profile.handle, fan.handle);
  assert.deepEqual(fanExport.following, []); // the followed account no longer exists
  assert.equal(fanExport.commentsAuthored.some((comment) => comment.id === fanComment.id), true);
});

test("account deletion of a user with no data is a clean no-crash operation", () => {
  const creatorId = "dev:account-delete-empty";
  const user = ensureUser({ creatorId, name: "Empty Account", email: "empty@buildstory.local", image: null });
  deleteAccount(user.id);
  assert.throws(
    () => exportAccountData(user.id),
    (error) => error instanceof AccountError && error.code === "not_found",
  );
});
