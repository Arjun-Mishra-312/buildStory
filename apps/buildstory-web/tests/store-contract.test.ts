import { execFileSync } from "node:child_process";
import { rm } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { orbitNotesSnapshot } from "../lib/mock-projects";
import { publicBuildStoryFromSnapshot } from "../lib/build-story";
import { __setD1ForTests } from "../db";
import { __setR2ForTests } from "../db/r2";
import { MemoryR2Bucket } from "../lib/testing/memory-r2";
import { openSqliteD1 } from "../lib/testing/sqlite-d1";
import { runStoreContract } from "./contract/store-contract";

Reflect.set(process.env, "NODE_ENV", "test");
process.env.BUILDSTORY_PUBLIC_ORIGIN = "https://buildstory.dev";

// Shared across both backend runs below - safe because they register sequentially
// (Node's default test concurrency) and their fixtures use distinct reportId prefixes,
// so their object keys never collide.
const sharedR2Bucket = new MemoryR2Bucket();
__setR2ForTests(sharedR2Bucket as unknown as R2Bucket);

const ownerSession = { creatorId: "dev:mina-park", name: "Mina Park", email: "dev@buildstory.local", image: null };
const followerSession = { creatorId: "contract:follower", name: "Contract Follower", email: "follower@buildstory.local", image: null };

runStoreContract("mock-store", {
  ingestion: await import("../lib/ingestion/mock-store"),
  social: await import("../lib/social/mock-store"),
  account: await import("../lib/account/mock-store"),
  r2Bucket: sharedR2Bucket,
  seed: async () => {
    const ingestion = await import("../lib/ingestion/mock-store");
    const owner = ingestion.ensureUser(ownerSession);
    const follower = ingestion.ensureUser(followerSession);
    return {
      ownerSession,
      ownerUserId: owner.id,
      ownerHandle: owner.handle,
      followerSession,
      followerUserId: follower.id,
      reportId: "rpt_orbit_notes_ready",
      reportSlug: orbitNotesSnapshot.identity.slug,
      projectId: orbitNotesSnapshot.identity.id,
    };
  },
});

const sqlitePath = path.join(process.cwd(), ".tmp", `store-contract-${process.pid}.sqlite`);
execFileSync(process.execPath, [path.join(process.cwd(), "..", "..", "node_modules/tsx/dist/cli.mjs"), "scripts/migrate-d1.ts", "--local-sqlite", "--db-path", sqlitePath], { stdio: "ignore" });
const localD1 = openSqliteD1(sqlitePath);
__setD1ForTests(localD1 as unknown as D1Database);

const d1Ingestion = await import("../lib/ingestion/d1-store");
const d1Social = await import("../lib/social/d1-store");
const d1Account = await import("../lib/account/d1-store");

runStoreContract("d1-store", {
  ingestion: d1Ingestion,
  social: d1Social,
  account: d1Account,
  r2Bucket: sharedR2Bucket,
  seed: async () => {
    const owner = await d1Ingestion.ensureUser(ownerSession);
    const follower = await d1Ingestion.ensureUser(followerSession);
    const database = localD1.database;
    const now = new Date().toISOString();
    const projectId = "prj_contract_orbit";
    const sessionId = "upl_contract_orbit";
    const reportId = "rpt_contract_orbit";
    const slug = "contract-orbit";
    database.prepare(`INSERT INTO buildstory_projects (id, owner_user_id, slug, name, repository_fingerprint, fingerprint_basis, first_scan_at, last_scan_at, story_count, latest_session_count, latest_commit_count, latest_active_days, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?, ?)`).run(projectId, owner.id, slug, "Contract Orbit", "sha256:" + "a".repeat(64), "local-path", now, now, orbitNotesSnapshot.git.commits, orbitNotesSnapshot.timeWindow.activeDays, now, now);
    database.prepare(`INSERT INTO buildstory_upload_sessions (id, creator_id, owner_user_id, project_label, status, created_at, expires_at, status_detail, device_code_hash, device_code_attempts, updated_at) VALUES (?, ?, ?, ?, 'report_ready', ?, ?, ?, ?, 0, ?)`).run(sessionId, ownerSession.creatorId, owner.id, "Contract Orbit", now, new Date(Date.now() + 86_400_000).toISOString(), "Private report ready for review.", "contract-device-hash", now);
    const snapshotObject = { ...structuredClone(orbitNotesSnapshot), identity: { ...orbitNotesSnapshot.identity, slug, name: "Contract Orbit" } };
    const snapshot = JSON.stringify(snapshotObject);
    const selectedPublicFields = ["tagline", "description", "timeWindow", "sessionSummary", "milestones", "modelMix", "gitAggregates", "redactionSummary"] as const;
    database.prepare(`INSERT INTO buildstory_reports (id, creator_id, owner_user_id, project_id, upload_session_id, status, created_at, ready_at, source_snapshot_json, snapshot_json, selected_public_fields_json, editorial_tagline, editorial_description, editorial_reflection, category, publication_status, publication_slug, publication_path, published_at, public_url, chapter_index, updated_at) VALUES (?, ?, ?, ?, ?, 'ready', ?, ?, ?, ?, ?, ?, ?, ?, 'web-apps', 'published', ?, ?, ?, ?, 1, ?)`).run(reportId, ownerSession.creatorId, owner.id, projectId, sessionId, now, now, snapshot, snapshot, JSON.stringify(selectedPublicFields), "A contract-tested build.", "A public story used by the store contract.", "The durable path is exercised directly.", slug, `${owner.handle}/${slug}`, now, `https://buildstory.dev/u/${owner.handle}/${slug}`, now);
    snapshotObject.identity.tagline = "A contract-tested build.";
    snapshotObject.identity.description = "A public story used by the store contract.";
    const publicStory = publicBuildStoryFromSnapshot(snapshotObject, [...selectedPublicFields], { reflection: "The durable path is exercised directly.", category: "web-apps" }, { projectUrl: null, repoUrl: null, videoUrl: null });
    const searchText = [publicStory.name, publicStory.tagline, publicStory.description, publicStory.owner.name, publicStory.owner.handle, ...publicStory.stack, ...publicStory.models.flatMap((model) => [model.id, model.label])].join(" ");
    database.prepare("INSERT INTO buildstory_public_story_index (report_id, story_json, category, search_text, has_live_demo, cover_url, updated_at) VALUES (?, ?, 'web-apps', ?, 0, NULL, ?)").run(reportId, JSON.stringify(publicStory), searchText, now);
    return { ownerSession, ownerUserId: owner.id, ownerHandle: owner.handle, followerSession, followerUserId: follower.id, reportId, reportSlug: slug, projectId };
  },
});

test.after(async () => {
  localD1.close();
  __setD1ForTests(null);
  __setR2ForTests(null);
  await rm(sqlitePath, { force: true });
});
