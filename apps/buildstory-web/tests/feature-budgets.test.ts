import assert from "node:assert/strict";
import test from "node:test";
import {
  acceptSnapshot,
  applyBillingUpdate,
  claimUploadSession,
  createHighlight,
  createUploadSession,
  ensureUser,
  getActiveHighlights,
  getFeatureBudgetCount,
  getReport,
  publishReport,
  updateReport,
} from "../lib/ingestion/mock-store";
import { sha256Digest } from "../lib/ingestion/local-contract";
import scannerFixture from "./fixtures/scanner-project-snapshot.json";

Reflect.set(process.env, "NODE_ENV", "test");
process.env.BUILDSTORY_REPORT_READY_DELAY_MS = "0";

/** publishReport requires a category to have been chosen first. */
async function publish(creatorId: string, reportId: string) {
  updateReport(creatorId, reportId, { category: "developer-tools" });
  return publishReport(creatorId, reportId);
}

/** Drives one full connect -> accept round trip against an existing project (or a fresh one if targetProjectId is null). */
async function scan(creatorId: string, ownerUserId: string, targetProjectId: string | null, fingerprint: string) {
  const created = await createUploadSession(creatorId, "Feature budget test", "http://localhost/", ownerUserId, null, "off", targetProjectId);
  const { sessionId, userCode } = created.deviceAuthorization;
  const claim = await claimUploadSession(sessionId, userCode);
  const snapshot = { ...structuredClone(scannerFixture), repository: { ...scannerFixture.repository, fingerprint } };
  const raw = JSON.stringify(snapshot);
  const receipt = await acceptSnapshot(sessionId, claim.uploadGrant.bearerToken, await sha256Digest(raw), snapshot);
  const reportId = receipt.reportEndpoint!.split("/").at(-1)!;
  await getReport(creatorId, reportId); // triggers the lazy queued -> ready lifecycle refresh
  return reportId;
}

test("free accounts are capped at 3 rescans a month; a project's first scan is never counted", async () => {
  const creatorId = "dev:rescan-cap-free-user";
  const fingerprint = `sha256:${"c".repeat(64)}`;
  const user = ensureUser({ creatorId, name: "Rescan Cap Free User", email: "rescan-cap-free@buildstory.local", image: null });

  const firstReportId = await scan(creatorId, user.id, null, fingerprint);
  const firstReport = await getReport(creatorId, firstReportId);
  const projectId = firstReport.projectId;
  assert.equal(getFeatureBudgetCount(user.id, "rescan"), 0, "a project's first-ever scan is never counted as a rescan");

  await scan(creatorId, user.id, projectId, fingerprint);
  await scan(creatorId, user.id, projectId, fingerprint);
  await scan(creatorId, user.id, projectId, fingerprint);
  assert.equal(getFeatureBudgetCount(user.id, "rescan"), 3);

  await assert.rejects(
    () => scan(creatorId, user.id, projectId, fingerprint),
    (error: unknown) => (error as { code?: string }).code === "rescan_limit_reached",
    "the 4th rescan this month must be rejected",
  );
});

test("Pro accounts are never rescan-limited", async () => {
  const creatorId = "dev:rescan-cap-pro-user";
  const fingerprint = `sha256:${"d".repeat(64)}`;
  const user = ensureUser({ creatorId, name: "Rescan Cap Pro User", email: "rescan-cap-pro@buildstory.local", image: null });
  applyBillingUpdate(user.id, { plan: "pro" });

  const firstReportId = await scan(creatorId, user.id, null, fingerprint);
  const firstReport = await getReport(creatorId, firstReportId);
  const projectId = firstReport.projectId;

  for (let i = 0; i < 5; i += 1) {
    await scan(creatorId, user.id, projectId, fingerprint);
  }
  assert.equal(getFeatureBudgetCount(user.id, "rescan"), 5, "usage is still tracked for Pro accounts, just never enforced");
});

test("highlighting a story requires Pro, requires ownership of a published report, and is capped at 5 a month", async () => {
  const freeCreatorId = "dev:highlight-free-user";
  const freeUser = ensureUser({ creatorId: freeCreatorId, name: "Highlight Free User", email: "highlight-free@buildstory.local", image: null });
  const freeReportId = await scan(freeCreatorId, freeUser.id, null, `sha256:${"e".repeat(64)}`);
  await publish(freeCreatorId, freeReportId);
  assert.throws(
    () => createHighlight(freeUser.id, freeReportId),
    (error: unknown) => (error as { code?: string }).code === "highlight_requires_pro",
  );

  const proCreatorId = "dev:highlight-pro-user";
  const proUser = ensureUser({ creatorId: proCreatorId, name: "Highlight Pro User", email: "highlight-pro@buildstory.local", image: null });
  applyBillingUpdate(proUser.id, { plan: "pro" });

  const unpublishedReportId = await scan(proCreatorId, proUser.id, null, `sha256:${"f".repeat(64)}`);
  assert.throws(
    () => createHighlight(proUser.id, unpublishedReportId),
    (error: unknown) => (error as { code?: string }).code === "not_found",
    "an unpublished report cannot be highlighted",
  );

  await publish(proCreatorId, unpublishedReportId);
  createHighlight(proUser.id, unpublishedReportId);
  const active = getActiveHighlights();
  assert.ok(active.some((highlight) => highlight.reportId === unpublishedReportId && highlight.ownerHandle === proUser.handle));

  for (let i = 0; i < 4; i += 1) {
    const reportId = await scan(proCreatorId, proUser.id, null, `sha256:${(i + 10).toString().repeat(64).slice(0, 64)}`);
    await publish(proCreatorId, reportId);
    createHighlight(proUser.id, reportId);
  }
  assert.throws(
    () => createHighlight(proUser.id, unpublishedReportId),
    (error: unknown) => (error as { code?: string }).code === "highlight_limit_reached",
    "the 6th highlight this month must be rejected",
  );
});

test("getActiveHighlights excludes a highlight once it passes its 24h expiry", async () => {
  const creatorId = "dev:highlight-expiry-user";
  const user = ensureUser({ creatorId, name: "Highlight Expiry User", email: "highlight-expiry@buildstory.local", image: null });
  applyBillingUpdate(user.id, { plan: "pro" });
  const reportId = await scan(creatorId, user.id, null, `sha256:${"9".repeat(64)}`);
  await publish(creatorId, reportId);
  createHighlight(user.id, reportId);

  assert.ok(getActiveHighlights().some((highlight) => highlight.reportId === reportId), "active immediately after creation");

  const RealDate = Date;
  const future = RealDate.now() + 25 * 60 * 60 * 1000;
  // @ts-expect-error - minimal Date stub for one read-time expiry check, restored immediately after.
  globalThis.Date = class extends RealDate {
    static now() {
      return future;
    }
  };
  try {
    assert.ok(!getActiveHighlights().some((highlight) => highlight.reportId === reportId), "excluded 25h later, past the 24h window");
  } finally {
    globalThis.Date = RealDate;
  }
});
