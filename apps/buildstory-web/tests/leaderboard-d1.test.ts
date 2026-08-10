import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { __setD1ForTests } from "../db";
import { orbitNotesSnapshot } from "../lib/mock-projects";
import { openSqliteD1 } from "../lib/testing/sqlite-d1";

Reflect.set(process.env, "NODE_ENV", "test");
process.env.BUILDSTORY_PUBLIC_ORIGIN = "https://buildstory.dev";

const sqlitePath = path.join(process.cwd(), ".tmp", `leaderboard-${process.pid}.sqlite`);
execFileSync(process.execPath, [path.join(process.cwd(), "..", "..", "node_modules/tsx/dist/cli.mjs"), "scripts/migrate-d1.ts", "--local-sqlite", "--db-path", sqlitePath], { stdio: "ignore" });
const localD1 = openSqliteD1(sqlitePath);
__setD1ForTests(localD1 as unknown as D1Database);

const d1Ingestion = await import("../lib/ingestion/d1-store");
const d1Leaderboard = await import("../lib/leaderboard/d1-store");
const ownerSession = { creatorId: "dev:leaderboard-cache", name: "Cache Owner", email: "cache@buildstory.local", image: null };

function insertReadyReport(args: { reportId: string; projectId: string; slug: string; label: string }) {
  const now = new Date().toISOString();
  const sessionId = `${args.reportId}_session`;
  const database = localD1.database;
  database.prepare(
    `INSERT INTO buildstory_upload_sessions (id, creator_id, owner_user_id, project_label, status, created_at, expires_at, status_detail, device_code_hash, device_code_attempts, updated_at)
     VALUES (?, ?, ?, ?, 'report_ready', ?, ?, ?, ?, 0, ?)`,
  ).run(sessionId, ownerSession.creatorId, null, args.label, now, new Date(Date.now() + 86_400_000).toISOString(), "Private report ready for review.", `${args.reportId}-device-hash`, now);
  const snapshot = JSON.stringify({ ...structuredClone(orbitNotesSnapshot), identity: { ...orbitNotesSnapshot.identity, slug: args.slug, name: args.label } });
  database.prepare(
    `INSERT INTO buildstory_reports (id, creator_id, owner_user_id, project_id, upload_session_id, status, created_at, ready_at, source_snapshot_json, snapshot_json, selected_public_fields_json, editorial_tagline, editorial_description, editorial_reflection, category, publication_status, publication_slug, updated_at)
     VALUES (?, ?, ?, ?, ?, 'ready', ?, ?, ?, ?, ?, ?, ?, ?, 'web-apps', 'not_published', ?, ?)`,
  ).run(
    args.reportId,
    ownerSession.creatorId,
    null,
    args.projectId,
    sessionId,
    now,
    now,
    snapshot,
    snapshot,
    JSON.stringify(["tagline", "description", "timeWindow", "sessionSummary", "milestones", "modelMix", "gitAggregates", "redactionSummary"]),
    args.label,
    "A public story used by the leaderboard cache test.",
    "Testing leaderboard freshness.",
    args.slug,
    now,
  );
}

async function seedAndPublish(ownerUserId: string, index: number, existingProjectId?: string) {
  const now = new Date().toISOString();
  const existingProject = existingProjectId
    ? localD1.database.prepare("SELECT slug FROM buildstory_projects WHERE id = ?").get(existingProjectId) as { slug: string } | undefined
    : undefined;
  const projectId = existingProjectId ?? `prj_leaderboard_cache_${index}`;
  const reportId = `rpt_leaderboard_cache_${index}`;
  const slug = existingProject?.slug ?? `cache-project-${index}`;
  if (!existingProject) {
    localD1.database.prepare(
      `INSERT INTO buildstory_projects (id, owner_user_id, slug, name, repository_fingerprint, fingerprint_basis, first_scan_at, last_scan_at, story_count, latest_session_count, latest_commit_count, latest_active_days, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?, ?)`,
    ).run(projectId, ownerUserId, slug, `Cache project ${index}`, `sha256:${String(index).repeat(64)}`, "local-path", now, now, orbitNotesSnapshot.git.commits, orbitNotesSnapshot.timeWindow.activeDays, now, now);
  }
  insertReadyReport({ reportId, projectId, slug, label: `Cache project ${index}` });
  await d1Ingestion.publishReport(ownerSession.creatorId, reportId);
  return { reportId, projectId };
}

test("leaderboard refreshes a cached story count when a second story is published", async () => {
  const owner = await d1Ingestion.ensureUser(ownerSession);
  const first = await seedAndPublish(owner.id, 1);
  const firstRead = await d1Leaderboard.getLeaderboard("all-time", 50);
  assert.equal(firstRead.find((entry) => entry.user.id === owner.id)?.storyCount, 1);

  await new Promise((resolve) => setTimeout(resolve, 5));
  await seedAndPublish(owner.id, 2);
  const secondRead = await d1Leaderboard.getLeaderboard("all-time", 50);
  assert.equal(secondRead.find((entry) => entry.user.id === owner.id)?.storyCount, 2);

  await new Promise((resolve) => setTimeout(resolve, 5));
  await seedAndPublish(owner.id, 3, first.projectId);
  const thirdRead = await d1Leaderboard.getLeaderboard("all-time", 50);
  assert.equal(thirdRead.find((entry) => entry.user.id === owner.id)?.storyCount, 3);
});

test.after(async () => {
  localD1.close();
  __setD1ForTests(null);
  await rm(sqlitePath, { force: true });
});
