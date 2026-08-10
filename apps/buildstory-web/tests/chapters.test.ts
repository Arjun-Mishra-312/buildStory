import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { orbitNotesSnapshot } from "../lib/mock-projects";
import { __setD1ForTests } from "../db";
import { openSqliteD1 } from "../lib/testing/sqlite-d1";

Reflect.set(process.env, "NODE_ENV", "test");
process.env.BUILDSTORY_PUBLIC_ORIGIN = "https://buildstory.dev";

const sqlitePath = path.join(process.cwd(), ".tmp", `chapters-${process.pid}.sqlite`);
execFileSync(process.execPath, [path.join(process.cwd(), "..", "..", "node_modules/tsx/dist/cli.mjs"), "scripts/migrate-d1.ts", "--local-sqlite", "--db-path", sqlitePath], { stdio: "ignore" });
const localD1 = openSqliteD1(sqlitePath);
__setD1ForTests(localD1 as unknown as D1Database);

const d1Ingestion = await import("../lib/ingestion/d1-store");

const ownerSession = { creatorId: "dev:chapters-owner", name: "Chapters Owner", email: "chapters@buildstory.local", image: null };

/** Inserts a bare "ready" report row for an existing project, mirroring what a real scan produces before publication. */
function insertReadyReport(database: ReturnType<typeof openSqliteD1>["database"], args: {
  reportId: string;
  projectId: string;
  ownerUserId: string;
  slug: string;
  tagline: string;
}) {
  const now = new Date().toISOString();
  const sessionId = `${args.reportId}_session`;
  database.prepare(
    `INSERT INTO buildstory_upload_sessions (id, creator_id, owner_user_id, project_label, status, created_at, expires_at, status_detail, device_code_hash, device_code_attempts, updated_at)
     VALUES (?, ?, ?, ?, 'report_ready', ?, ?, ?, ?, 0, ?)`,
  ).run(sessionId, ownerSession.creatorId, args.ownerUserId, args.tagline, now, new Date(Date.now() + 86_400_000).toISOString(), "Private report ready for review.", `${args.reportId}-device-hash`, now);
  const snapshot = JSON.stringify({ ...structuredClone(orbitNotesSnapshot), identity: { ...orbitNotesSnapshot.identity, slug: args.slug, tagline: args.tagline } });
  database.prepare(
    `INSERT INTO buildstory_reports (id, creator_id, owner_user_id, project_id, upload_session_id, status, created_at, ready_at, source_snapshot_json, snapshot_json, selected_public_fields_json, editorial_tagline, editorial_description, editorial_reflection, category, publication_status, publication_slug, publication_path, published_at, public_url, chapter_index, updated_at)
     VALUES (?, ?, ?, ?, ?, 'ready', ?, ?, ?, ?, ?, ?, ?, ?, 'web-apps', 'not_published', ?, NULL, NULL, NULL, NULL, ?)`,
  ).run(
    args.reportId, ownerSession.creatorId, args.ownerUserId, args.projectId, sessionId, now, now, snapshot, snapshot,
    JSON.stringify(["tagline", "description", "timeWindow", "sessionSummary", "milestones", "modelMix", "gitAggregates", "redactionSummary"]),
    args.tagline, "A public story used by the chapters test.", "Testing chapters directly.", args.slug, now,
  );
}

test("chapters: publishing a second chapter keeps the first published at an archival path, and the feed/list surfaces only the latest", async () => {
  const owner = await d1Ingestion.ensureUser(ownerSession);
  const database = localD1.database;
  const projectId = "prj_chapters_test";
  const slug = "chapters-project";
  const now = new Date().toISOString();

  database.prepare(
    `INSERT INTO buildstory_projects (id, owner_user_id, slug, name, repository_fingerprint, fingerprint_basis, first_scan_at, last_scan_at, story_count, latest_session_count, latest_commit_count, latest_active_days, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?, ?)`,
  ).run(projectId, owner.id, slug, "Chapters Project", "sha256:" + "b".repeat(64), "local-path", now, now, orbitNotesSnapshot.git.commits, orbitNotesSnapshot.timeWindow.activeDays, now, now);

  insertReadyReport(database, { reportId: "rpt_chapter_1", projectId, ownerUserId: owner.id, slug, tagline: "Chapter one" });
  insertReadyReport(database, { reportId: "rpt_chapter_2", projectId, ownerUserId: owner.id, slug, tagline: "Chapter two" });

  // Publish chapter 1 - becomes canonical, gets chapterIndex 1.
  const published1 = await d1Ingestion.publishReport(ownerSession.creatorId, "rpt_chapter_1");
  assert.equal(published1.publication.chapterIndex, 1);
  assert.equal(published1.publication.publicUrl, `https://buildstory.dev/u/${owner.handle}/${slug}`);

  const storyAtCanonical1 = await d1Ingestion.getPublishedStory(owner.handle, slug);
  assert.equal(storyAtCanonical1?.reportId, "rpt_chapter_1", "chapter 1 is canonical while it's the only published chapter");

  // Publish chapter 2 - becomes the new canonical; chapter 1 is demoted to an archival path but stays published.
  const published2 = await d1Ingestion.publishReport(ownerSession.creatorId, "rpt_chapter_2");
  assert.equal(published2.publication.chapterIndex, 2);
  assert.equal(published2.publication.publicUrl, `https://buildstory.dev/u/${owner.handle}/${slug}`);

  const storyAtCanonical2 = await d1Ingestion.getPublishedStory(owner.handle, slug);
  assert.equal(storyAtCanonical2?.reportId, "rpt_chapter_2", "chapter 2 is now canonical");

  // Older reports may retain a legacy publication slug after the project slug
  // changes. The current canonical URL must still resolve their chapter paths.
  database.prepare("UPDATE buildstory_reports SET publication_slug = ? WHERE id = ?").run("legacy-chapters-project", "rpt_chapter_1");
  const archivalChapter1 = await d1Ingestion.getPublishedStoryChapter(owner.handle, slug, 1);
  assert.equal(archivalChapter1?.reportId, "rpt_chapter_1", "chapter 1 remains reachable at its own archival path");

  const chapters = await d1Ingestion.listPublishedChapters(owner.handle, slug);
  assert.deepEqual(chapters.map((chapter) => chapter.chapterIndex), [1, 2], "both chapters are listed, oldest first");

  const list = await d1Ingestion.listPublishedStories(30);
  const matches = list.filter((story) => story.slug === slug);
  assert.equal(matches.length, 1, "list views show exactly one entry per project, not one per chapter");
  assert.equal(matches[0]?.tagline, "Chapter two", "the one entry shown is the latest chapter");

  // Unpublishing the canonical chapter promotes chapter 1 back to the canonical path.
  await d1Ingestion.unpublishReport(ownerSession.creatorId, "rpt_chapter_2");
  const storyAfterUnpublish = await d1Ingestion.getPublishedStory(owner.handle, slug);
  assert.equal(storyAfterUnpublish?.reportId, "rpt_chapter_1", "chapter 1 is promoted back to canonical once chapter 2 is unpublished");
});

test("chapters: publishing a second chapter computes and freezes its delta, and comments roll up across chapters", async () => {
  const owner = await d1Ingestion.ensureUser(ownerSession);
  const database = localD1.database;
  const projectId = "prj_updates_test";
  const slug = "updates-project";
  const now = new Date().toISOString();

  database.prepare(
    `INSERT INTO buildstory_projects (id, owner_user_id, slug, name, repository_fingerprint, fingerprint_basis, first_scan_at, last_scan_at, story_count, latest_session_count, latest_commit_count, latest_active_days, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?, ?)`,
  ).run(projectId, owner.id, slug, "Updates Project", "sha256:" + "c".repeat(64), "local-path", now, now, orbitNotesSnapshot.git.commits, orbitNotesSnapshot.timeWindow.activeDays, now, now);

  insertReadyReport(database, { reportId: "rpt_upd_chapter_1", projectId, ownerUserId: owner.id, slug, tagline: "Chapter one" });
  // Chapter 2's snapshot has more commits than chapter 1's, so the delta is observable.
  const chapter2Snapshot = { ...structuredClone(orbitNotesSnapshot), identity: { ...orbitNotesSnapshot.identity, slug, tagline: "Chapter two" }, git: { ...orbitNotesSnapshot.git, commits: orbitNotesSnapshot.git.commits + 15 } };
  database.prepare(
    `INSERT INTO buildstory_upload_sessions (id, creator_id, owner_user_id, project_label, status, created_at, expires_at, status_detail, device_code_hash, device_code_attempts, updated_at)
     VALUES (?, ?, ?, ?, 'report_ready', ?, ?, ?, ?, 0, ?)`,
  ).run("rpt_upd_chapter_2_session", ownerSession.creatorId, owner.id, "Chapter two", now, new Date(Date.now() + 86_400_000).toISOString(), "Private report ready for review.", "rpt_upd_chapter_2-device-hash", now);
  database.prepare(
    `INSERT INTO buildstory_reports (id, creator_id, owner_user_id, project_id, upload_session_id, status, created_at, ready_at, source_snapshot_json, snapshot_json, selected_public_fields_json, editorial_tagline, editorial_description, editorial_reflection, category, publication_status, publication_slug, publication_path, published_at, public_url, chapter_index, updated_at)
     VALUES (?, ?, ?, ?, ?, 'ready', ?, ?, ?, ?, ?, ?, ?, ?, 'web-apps', 'not_published', ?, NULL, NULL, NULL, NULL, ?)`,
  ).run(
    "rpt_upd_chapter_2", ownerSession.creatorId, owner.id, projectId, "rpt_upd_chapter_2_session", now, now,
    JSON.stringify(chapter2Snapshot), JSON.stringify(chapter2Snapshot),
    JSON.stringify(["tagline", "description", "timeWindow", "sessionSummary", "milestones", "modelMix", "gitAggregates", "redactionSummary"]),
    "Chapter two", "A public story used by the chapters test.", "Testing chapters directly.", slug, now,
  );

  const published1 = await d1Ingestion.publishReport(ownerSession.creatorId, "rpt_upd_chapter_1");
  assert.equal(published1.chapterDelta, null, "a project's first chapter has nothing to compare against");

  const published2 = await d1Ingestion.publishReport(ownerSession.creatorId, "rpt_upd_chapter_2");
  assert.equal(published2.chapterDelta?.fromChapterIndex, 1);
  assert.equal(published2.chapterDelta?.toChapterIndex, 2);
  assert.equal(published2.chapterDelta?.build.commits.change, 15, "chapter 2 has 15 more commits than chapter 1");

  const publicStory = await d1Ingestion.getPublishedStory(owner.handle, slug);
  assert.equal(publicStory?.chapterDelta?.build.commits.change, 15, "the public read path carries the same frozen, gated delta");

  const projects = await d1Ingestion.listProjects(ownerSession.creatorId);
  const thisProject = projects.find((project) => project.id === projectId);
  assert.equal(thisProject?.chapterCount, 2);
  assert.equal(thisProject?.latestChapterIndex, 2);

  const detail = await d1Ingestion.getProjectDetail(ownerSession.creatorId, projectId);
  assert.equal(detail.reports.length, 2);
  const chapter2Detail = detail.reports.find((report) => report.reportId === "rpt_upd_chapter_2");
  assert.equal(chapter2Detail?.chapterDelta?.build.commits.change, 15);

  // Community continuity: a comment posted while chapter 1 was canonical must still
  // surface once chapter 2 becomes canonical - an update must never reset engagement.
  const socialD1 = await import("../lib/social/d1-store");
  const commenter = await d1Ingestion.ensureUser({ creatorId: "dev:commenter", name: "Commenter", email: "commenter@buildstory.local", image: null });
  await socialD1.createComment("rpt_upd_chapter_1", commenter.id, "Loving the progress on this one.", null);

  const rollupIds = await d1Ingestion.listPublishedReportIdsForProject(projectId);
  assert.deepEqual(rollupIds, ["rpt_upd_chapter_2", "rpt_upd_chapter_1"], "rollup lists the current chapter first");

  const rolledUpComments = await socialD1.listCommentsForReports(rollupIds);
  assert.equal(rolledUpComments.length, 1);
  assert.equal(rolledUpComments[0]?.chapterIndex, 1, "the comment is tagged with the chapter it was actually posted on");
});

test("legacy private reports remain readable through their durable project owner", async () => {
  const owner = await d1Ingestion.ensureUser(ownerSession);
  const database = localD1.database;
  const projectId = "prj_legacy_owner_access";
  const reportId = "rpt_legacy_owner_access";
  const sessionId = `${reportId}_session`;
  const now = new Date().toISOString();

  database.prepare(
    `INSERT INTO buildstory_projects (id, owner_user_id, slug, name, repository_fingerprint, fingerprint_basis, first_scan_at, last_scan_at, story_count, latest_session_count, latest_commit_count, latest_active_days, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?, ?)`,
  ).run(projectId, owner.id, "legacy-owner-access", "Legacy owner access", "sha256:" + "d".repeat(64), "local-path", now, now, orbitNotesSnapshot.git.commits, orbitNotesSnapshot.timeWindow.activeDays, now, now);

  const snapshot = JSON.stringify({ ...structuredClone(orbitNotesSnapshot), identity: { ...orbitNotesSnapshot.identity, id: projectId, slug: "legacy-owner-access" } });
  database.prepare(
    `INSERT INTO buildstory_upload_sessions (id, creator_id, owner_user_id, project_label, status, created_at, expires_at, report_id, status_detail, device_code_hash, device_code_attempts, updated_at)
     VALUES (?, ?, NULL, ?, 'report_ready', ?, ?, ?, ?, ?, 0, ?)`,
  ).run(sessionId, "legacy:chapters-owner", "Legacy owner access", now, new Date(Date.now() + 86_400_000).toISOString(), reportId, "Private report ready for review.", `${reportId}-device-hash`, now);
  database.prepare(
    `INSERT INTO buildstory_reports (id, creator_id, owner_user_id, project_id, upload_session_id, status, created_at, ready_at, source_snapshot_json, snapshot_json, selected_public_fields_json, editorial_tagline, editorial_description, editorial_reflection, category, publication_status, publication_slug, updated_at)
     VALUES (?, ?, NULL, ?, ?, 'ready', ?, ?, ?, ?, ?, ?, ?, ?, 'web-apps', 'not_published', ?, ?)`,
  ).run(reportId, "legacy:chapters-owner", projectId, sessionId, now, now, snapshot, snapshot, JSON.stringify(["tagline"]), "Legacy owner access", "A legacy report.", "Testing durable owner fallback.", "legacy-owner-access", now);

  const report = await d1Ingestion.getReport(ownerSession.creatorId, reportId);
  assert.equal(report.id, reportId);
  const sessions = await d1Ingestion.listUploadSessions(ownerSession.creatorId);
  assert.equal(sessions.some((session) => session.id === sessionId), true);
});

test.after(async () => {
  localD1.close();
  __setD1ForTests(null);
  await rm(sqlitePath, { force: true });
});
