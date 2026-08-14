import assert from "node:assert/strict";
import test from "node:test";
import {
  acceptSnapshot,
  claimUploadSession,
  createUploadSession,
  ensureUser,
  getReport,
  publishReport,
  unpublishReport,
  updateReport,
} from "../lib/ingestion/mock-store";
import { sha256Digest } from "../lib/ingestion/local-contract";
import { getLeaderboard } from "../lib/leaderboard/mock-store";
import scannerFixture from "./fixtures/scanner-project-snapshot.json";

process.env.BUILDSTORY_REPORT_READY_DELAY_MS = "0";

function withUsage(args: { commits: number; tokens: number; costMicroUsd: number | null; startedAt: string; fingerprint?: string }) {
  const snapshot = structuredClone(scannerFixture);
  snapshot.git.commits = args.commits;
  if (args.fingerprint) snapshot.repository.fingerprint = args.fingerprint;
  const repositoryMilestone = snapshot.milestones.find((milestone) => milestone.kind === "repository-activity");
  if (repositoryMilestone) {
    repositoryMilestone.summary = `${args.commits} commits observed in the selected time window.`;
  }
  const session = snapshot.sessions[0]!;
  session.startedAt = args.startedAt;
  session.endedAt = args.startedAt;
  session.tokenUsage = {
    inputTokens: args.tokens,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens: args.tokens,
  };
  snapshot.usage.tokenUsage = session.tokenUsage;
  snapshot.usage.models[0]!.tokenUsage = session.tokenUsage;
  const model = snapshot.usage.models[0] as { costMicroUsd: number | null };
  model.costMicroUsd = args.costMicroUsd;
  snapshot.usage.cost = {
    totalMicroUsd: args.costMicroUsd,
    pricedTokens: args.costMicroUsd == null ? 0 : args.tokens,
    unpricedTokens: args.costMicroUsd == null ? args.tokens : 0,
    pricingTableVersion: "2026-08-05.1",
  } as typeof snapshot.usage.cost;
  snapshot.timeWindow.start = args.startedAt;
  snapshot.timeWindow.end = args.startedAt;
  return snapshot;
}

async function publishSnapshotForUser(creatorId: string, snapshot: ReturnType<typeof withUsage>) {
  const created = await createUploadSession(creatorId, "Leaderboard test project", "http://localhost/");
  const { sessionId, userCode } = created.deviceAuthorization;
  const claim = await claimUploadSession(sessionId, userCode);
  const raw = JSON.stringify(snapshot);
  const receipt = await acceptSnapshot(sessionId, claim.uploadGrant.bearerToken, await sha256Digest(raw), snapshot);
  const reportId = receipt.reportEndpoint!.split("/").at(-1)!;
  await getReport(creatorId, reportId);
  updateReport(creatorId, reportId, { category: "developer-tools" });
  await publishReport(creatorId, reportId);
  return reportId;
}

test("leaderboard: ranks by estimated spend, not commits", async () => {
  const spendCreatorId = "dev:leaderboard-spender";
  const spendUser = ensureUser({
    creatorId: spendCreatorId,
    name: "Leaderboard Spender",
    email: "spender@buildstory.local",
    image: null,
  });
  const tokenCreatorId = "dev:leaderboard-tokenizer";
  const tokenUser = ensureUser({
    creatorId: tokenCreatorId,
    name: "Leaderboard Tokenizer",
    email: "tokenizer@buildstory.local",
    image: null,
  });

  await publishSnapshotForUser(spendCreatorId, withUsage({
    commits: 2,
    tokens: 1_000,
    costMicroUsd: 5_000_000,
    startedAt: "2026-08-12T12:00:00.000Z",
    fingerprint: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
  }));
  await publishSnapshotForUser(tokenCreatorId, withUsage({
    commits: 80,
    tokens: 50_000,
    costMicroUsd: 1_000_000,
    startedAt: "2026-08-12T12:00:00.000Z",
    fingerprint: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
  }));

  const bySpend = getLeaderboard("all-time", 100, "spend");
  const byTokens = getLeaderboard("all-time", 100, "tokens");
  const spendEntry = bySpend.find((entry) => entry.user.id === spendUser.id);
  const tokenEntry = bySpend.find((entry) => entry.user.id === tokenUser.id);
  assert.ok(spendEntry && tokenEntry);
  assert.equal(spendEntry!.spendMicroUsd, 5_000_000);
  assert.equal(tokenEntry!.tokens, 50_000);
  assert.ok(spendEntry!.rank < tokenEntry!.rank, "higher estimated spend outranks more tokens");
  assert.ok(byTokens.find((entry) => entry.user.id === tokenUser.id)!.rank < byTokens.find((entry) => entry.user.id === spendUser.id)!.rank);
});

test("leaderboard: 7d window excludes older sessions", async () => {
  const creatorId = "dev:leaderboard-window";
  const user = ensureUser({
    creatorId,
    name: "Leaderboard Window",
    email: "window@buildstory.local",
    image: null,
  });
  await publishSnapshotForUser(creatorId, withUsage({
    commits: 3,
    tokens: 9_000,
    costMicroUsd: 3_000_000,
    startedAt: "2020-01-01T12:00:00.000Z",
    fingerprint: "sha256:3333333333333333333333333333333333333333333333333333333333333333",
  }));

  const allTime = getLeaderboard("all-time", 100, "spend").find((entry) => entry.user.id === user.id);
  const week = getLeaderboard("7d", 100, "spend").find((entry) => entry.user.id === user.id);
  assert.ok(allTime);
  assert.equal(allTime!.tokens, 9_000);
  assert.equal(week?.tokens ?? 0, 0);
});

test("leaderboard: counts every published chapter while folding each project once", async () => {
  const creatorId = "dev:leaderboard-chapters";
  const user = ensureUser({
    creatorId,
    name: "Leaderboard Chapters",
    email: "chapters@buildstory.local",
    image: null,
  });

  await publishSnapshotForUser(creatorId, withUsage({
    commits: 5,
    tokens: 1_400,
    costMicroUsd: 1_000_000,
    startedAt: "2026-08-03T11:30:00.000Z",
    fingerprint: "sha256:4444444444444444444444444444444444444444444444444444444444444444",
  }));
  await publishSnapshotForUser(creatorId, withUsage({
    commits: 8,
    tokens: 1_400,
    costMicroUsd: 1_000_000,
    startedAt: "2026-08-03T11:30:00.000Z",
    fingerprint: "sha256:4444444444444444444444444444444444444444444444444444444444444444",
  }));

  const entry = getLeaderboard("all-time", 100, "spend").find((candidate) => candidate.user.id === user.id);
  assert.ok(entry);
  assert.equal(entry!.storyCount, 2);
  assert.equal(entry!.tokens, 1_400);
  assert.equal(entry!.commitCount, 8);
});

test("leaderboard: a published story in draft_changes remains counted", async () => {
  const creatorId = "dev:leaderboard-draft-changes";
  const user = ensureUser({
    creatorId,
    name: "Leaderboard Draft Changes",
    email: "draft-changes@buildstory.local",
    image: null,
  });

  const reportId = await publishSnapshotForUser(creatorId, withUsage({
    commits: 5,
    tokens: 700,
    costMicroUsd: 500_000,
    startedAt: "2026-08-12T12:00:00.000Z",
    fingerprint: "sha256:5555555555555555555555555555555555555555555555555555555555555555",
  }));
  updateReport(creatorId, reportId, { editorial: { tagline: "Edited but still public" } });

  const entry = getLeaderboard("all-time", 100, "spend").find((candidate) => candidate.user.id === user.id);
  assert.ok(entry);
  assert.equal(entry!.storyCount, 1);
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
  const snapshot = withUsage({
    commits: 999,
    tokens: 99_000,
    costMicroUsd: 9_000_000,
    startedAt: "2026-08-12T12:00:00.000Z",
    fingerprint: "sha256:6666666666666666666666666666666666666666666666666666666666666666",
  });
  const raw = JSON.stringify(snapshot);
  await acceptSnapshot(sessionId, claim.uploadGrant.bearerToken, await sha256Digest(raw), snapshot);

  const entries = getLeaderboard("all-time", 200, "spend");
  assert.equal(entries.some((entry) => entry.user.id === draftUser.id), false);
});

test("leaderboard: unpublish removes the contribution", async () => {
  const creatorId = "dev:leaderboard-unpublish";
  const user = ensureUser({
    creatorId,
    name: "Leaderboard Unpublish",
    email: "unpublish@buildstory.local",
    image: null,
  });
  const reportId = await publishSnapshotForUser(creatorId, withUsage({
    commits: 4,
    tokens: 2_000,
    costMicroUsd: 750_000,
    startedAt: "2026-08-12T12:00:00.000Z",
    fingerprint: "sha256:7777777777777777777777777777777777777777777777777777777777777777",
  }));
  assert.ok(getLeaderboard("all-time", 100, "spend").some((entry) => entry.user.id === user.id));
  unpublishReport(creatorId, reportId);
  assert.equal(getLeaderboard("all-time", 100, "spend").some((entry) => entry.user.id === user.id), false);
});
