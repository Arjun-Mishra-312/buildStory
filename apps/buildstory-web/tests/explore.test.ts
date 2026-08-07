import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { publicBuildStoryFromSnapshot, type PublicBuildStoryViewModel } from "../lib/build-story";
import { orbitNotesSnapshot } from "../lib/mock-projects";
import { __setD1ForTests } from "../db";
import { openSqliteD1 } from "../lib/testing/sqlite-d1";

Reflect.set(process.env, "NODE_ENV", "test");
const previousStore = process.env.BUILDSTORY_STORE;
process.env.BUILDSTORY_STORE = "d1";
const sqlitePath = path.join(process.cwd(), ".tmp", `explore-${process.pid}.sqlite`);
execFileSync(process.execPath, [path.join(process.cwd(), "..", "..", "node_modules/tsx/dist/cli.mjs"), "scripts/migrate-d1.ts", "--local-sqlite", "--db-path", sqlitePath], { stdio: "ignore" });
const localD1 = openSqliteD1(sqlitePath);
__setD1ForTests(localD1 as unknown as D1Database);
const ingestion = await import("../lib/ingestion/d1-store");
const social = await import("../lib/social/d1-store");
const storiesRoute = await import("../app/api/stories/route");

const ownerSession = { creatorId: "dev:explore-owner", name: "Explore Owner", email: "explore-owner@buildstory.local", image: null };
const actorSession = { creatorId: "dev:explore-actor", name: "Explore Actor", email: "explore-actor@buildstory.local", image: null };

function publicStory(args: { id: string; slug: string; name: string; category: "web-apps" | "saas"; stack: string[]; modelId: string; modelLabel: string; requests: number; projectUrl?: string | null; videoUrl?: string | null }): PublicBuildStoryViewModel {
  const snapshot = structuredClone(orbitNotesSnapshot);
  snapshot.identity.id = args.id;
  snapshot.identity.slug = args.slug;
  snapshot.identity.name = args.name;
  snapshot.identity.owner = { ...snapshot.identity.owner, name: ownerSession.name };
  const base = publicBuildStoryFromSnapshot(snapshot, ["tagline", "description", "timeWindow", "sessionSummary", "modelMix", "toolUsage", "gitAggregates", "artifactLinks"], { category: args.category }, { projectUrl: args.projectUrl ?? null, repoUrl: null, videoUrl: args.videoUrl ?? null });
  return {
    ...base,
    id: args.id,
    slug: args.slug,
    name: args.name,
    category: args.category,
    stack: args.stack,
    models: [{ ...base.models[0]!, id: args.modelId, label: args.modelLabel, requests: args.requests }],
  };
}

function insertIndexedStory(args: { reportId: string; projectId: string; sessionId: string; publishedAt: string; story: PublicBuildStoryViewModel; privateToken: string }) {
  const db = localD1.database;
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO buildstory_projects (id, owner_user_id, slug, name, repository_fingerprint, fingerprint_basis, first_scan_at, last_scan_at, story_count, latest_session_count, latest_commit_count, latest_active_days, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'local-path', ?, ?, 1, 1, 1, 1, ?, ?)`)
    .run(args.projectId, owner.id, args.story.slug, args.story.name, `sha256:${args.reportId.padEnd(64, "a").slice(0, 64)}`, now, now, now, now);
  db.prepare(`INSERT INTO buildstory_upload_sessions (id, creator_id, owner_user_id, project_label, status, created_at, expires_at, status_detail, device_code_hash, device_code_attempts, updated_at)
    VALUES (?, ?, ?, ?, 'report_ready', ?, ?, 'Ready', ?, 0, ?)`)
    .run(args.sessionId, ownerSession.creatorId, owner.id, args.story.name, now, new Date(Date.now() + 86_400_000).toISOString(), `${args.sessionId}-hash`, now);
  db.prepare(`INSERT INTO buildstory_reports (id, creator_id, owner_user_id, project_id, upload_session_id, status, created_at, ready_at, source_snapshot_json, snapshot_json, selected_public_fields_json, editorial_tagline, editorial_description, editorial_reflection, category, publication_status, publication_slug, publication_path, published_at, public_url, chapter_index, updated_at)
    VALUES (?, ?, ?, ?, ?, 'ready', ?, ?, ?, ?, '[]', ?, ?, '', ?, 'published', ?, ?, ?, ?, 1, ?)`)
    .run(args.reportId, ownerSession.creatorId, owner.id, args.projectId, args.sessionId, now, now, JSON.stringify({ privateToken: args.privateToken }), JSON.stringify({ privateToken: args.privateToken }), args.story.tagline, args.story.description, args.story.category, args.story.slug, `${owner.handle}/${args.story.slug}`, args.publishedAt, `https://buildstory.dev/u/${owner.handle}/${args.story.slug}`, now);
  const searchText = [args.story.name, args.story.tagline, args.story.description, args.story.owner.name, args.story.owner.handle, args.story.category, ...args.story.stack, ...args.story.tools.map((tool) => tool.label), ...args.story.models.flatMap((model) => [model.id, model.label])].join(" ");
  db.prepare(`INSERT INTO buildstory_public_story_index (report_id, story_json, category, search_text, has_live_demo, cover_url, updated_at)
    VALUES (?, ?, ?, ?, ?, NULL, ?)`)
    .run(args.reportId, JSON.stringify(args.story), args.story.category, searchText, args.story.artifactLinks.projectUrl ? 1 : 0, now);
}

const owner = await ingestion.ensureUser(ownerSession);
const actor = await ingestion.ensureUser(actorSession);
const storyA = publicStory({ id: "story_a", slug: "alpha-app", name: "Alpha App", category: "web-apps", stack: ["Next.js", "TypeScript"], modelId: "gpt-5", modelLabel: "GPT-5", requests: 3, projectUrl: "https://alpha.example.com" });
const storyB = publicStory({ id: "story_b", slug: "beta-saas", name: "Beta SaaS", category: "saas", stack: ["Next.js", "Tailwind CSS"], modelId: "claude-4", modelLabel: "Claude 4", requests: 1, videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
const storyC = publicStory({ id: "story_c", slug: "gamma-data", name: "Gamma Data", category: "web-apps", stack: ["Python"], modelId: "gpt-5", modelLabel: "GPT-5", requests: 1 });
insertIndexedStory({ reportId: "rpt_explore_a", projectId: "prj_explore_a", sessionId: "upl_explore_a", publishedAt: "2026-08-01T10:00:00.000Z", story: storyA, privateToken: "PRIVATE_ALPHA_TOKEN" });
insertIndexedStory({ reportId: "rpt_explore_b", projectId: "prj_explore_b", sessionId: "upl_explore_b", publishedAt: "2026-08-03T10:00:00.000Z", story: storyB, privateToken: "PRIVATE_BETA_TOKEN" });
insertIndexedStory({ reportId: "rpt_explore_c", projectId: "prj_explore_c", sessionId: "upl_explore_c", publishedAt: "2026-08-03T10:00:00.000Z", story: storyC, privateToken: "PRIVATE_GAMMA_TOKEN" });

const recent = new Date().toISOString();
const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
localD1.database.prepare("INSERT INTO buildstory_reactions (id, report_id, user_id, kind, created_at) VALUES ('rxn_recent', 'rpt_explore_a', ?, 'fire', ?)").run(actor.id, recent);
localD1.database.prepare("INSERT INTO buildstory_reactions (id, report_id, user_id, kind, created_at) VALUES ('rxn_old', 'rpt_explore_b', ?, 'fire', ?)").run(actor.id, old);
localD1.database.prepare("INSERT INTO buildstory_comments (id, report_id, author_user_id, parent_comment_id, body, status, created_at, updated_at) VALUES ('cmt_recent', 'rpt_explore_a', ?, NULL, 'Visible', 'visible', ?, ?)").run(actor.id, recent, recent);
localD1.database.prepare("INSERT INTO buildstory_comments (id, report_id, author_user_id, parent_comment_id, body, status, created_at, updated_at) VALUES ('cmt_hidden', 'rpt_explore_a', ?, NULL, '', 'hidden', ?, ?)").run(actor.id, recent, recent);
localD1.database.prepare("INSERT INTO buildstory_comment_upvotes (id, comment_id, user_id, created_at) VALUES ('up_recent', 'cmt_recent', ?, ?)").run(owner.id, recent);
localD1.database.prepare("INSERT INTO buildstory_comment_upvotes (id, comment_id, user_id, created_at) VALUES ('up_hidden', 'cmt_hidden', ?, ?)").run(owner.id, recent);

test("Explore uses only the public index, composes facets correctly, and keeps model shares at 100%", async () => {
  const all = await ingestion.explorePublishedStories({});
  assert.equal(all.resultCount, 3);
  assert.equal(all.facets.models.reduce((sum, item) => sum + item.requestShare, 0), 100);
  assert.deepEqual(all.facets.models.map((item) => [item.value, item.requestShare]), [["gpt-5", 80], ["claude-4", 20]]);
  assert.equal((await ingestion.explorePublishedStories({ query: "PRIVATE_ALPHA_TOKEN" })).resultCount, 0, "private report JSON is not searchable");
  assert.equal((await ingestion.explorePublishedStories({ models: ["gpt-5"] })).resultCount, 2, "model ids are valid filter values");

  const filtered = await ingestion.explorePublishedStories({ category: "web-apps", tools: ["next.js"] });
  assert.deepEqual(filtered.stories.map((story) => story.slug), ["alpha-app"]);
  assert.deepEqual(filtered.facets.categories.map((item) => [item.value, item.count]).sort(), [["saas", 1], ["web-apps", 1]], "category counts exclude the category facet but retain the tool filter");
  const toolCounts = new Map(filtered.facets.tools.map((item) => [item.value, item.count]));
  assert.equal(toolCounts.get("next.js"), 1);
  assert.equal(toolCounts.get("python"), 1);
  assert.equal(toolCounts.get("typescript"), 1, "tool counts exclude the tool facet but retain the category filter");
});

test("Has Live Demo excludes video-only stories and trending uses current 30-day visible activity", async () => {
  const demo = await ingestion.explorePublishedStories({ hasDemo: true });
  assert.deepEqual(demo.stories.map((story) => story.slug), ["alpha-app"]);
  assert.equal(demo.facets.liveDemoCount, 1);
  const trending = await ingestion.explorePublishedStories({ sort: "trending" });
  assert.equal(trending.stories[0]?.slug, "alpha-app", "one reaction, one visible comment, and one visible-comment upvote outrank newer stories");
  assert.equal(trending.stories[1]?.slug, "beta-saas", "publication time and report id deterministically break zero-score ties");
  await assert.rejects(() => social.setCommentUpvote("cmt_hidden", owner.id, true), (error: { code?: string }) => error.code === "not_found");
});

test("Explore cursors are stable for equal publication timestamps and never duplicate rows", async () => {
  const first = await ingestion.explorePublishedStories({ limit: 1 });
  assert.equal(first.stories[0]?.slug, "beta-saas");
  assert.ok(first.nextCursor);
  const second = await ingestion.explorePublishedStories({ limit: 1, cursor: first.nextCursor! });
  assert.equal(second.stories[0]?.slug, "gamma-data");
  assert.notEqual(second.stories[0]?.slug, first.stories[0]?.slug);
  const repeated = await ingestion.explorePublishedStories({ limit: 1, cursor: first.nextCursor! });
  assert.equal(repeated.stories[0]?.slug, second.stories[0]?.slug, "the same cursor produces the same deterministic next row");
});

test("GET /api/stories preserves repeated URL facets with OR-within and AND-across semantics", async () => {
  const response = await storiesRoute.GET(new Request("http://localhost/api/stories?category=web-apps&tool=python&tool=next.js&model=gpt-5&hasDemo=false&sort=newest&limit=30"));
  assert.equal(response.status, 200);
  const body = (await response.json()) as { stories: Array<{ slug: string }>; resultCount: number; nextCursor: string | null };
  assert.deepEqual(body.stories.map((story) => story.slug), ["gamma-data", "alpha-app"]);
  assert.equal(body.resultCount, 2);
  assert.equal(body.nextCursor, null);
  assert.match(response.headers.get("cache-control") ?? "", /stale-while-revalidate/);
});

test.after(async () => {
  localD1.close();
  __setD1ForTests(null);
  if (previousStore === undefined) delete process.env.BUILDSTORY_STORE;
  else process.env.BUILDSTORY_STORE = previousStore;
  await rm(sqlitePath, { force: true });
});
