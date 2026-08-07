import assert from "node:assert/strict";
import test from "node:test";
import { ensureUser } from "../lib/ingestion/mock-store";
import { createComment, deleteComment } from "../lib/social/mock-store";

Reflect.set(process.env, "NODE_ENV", "test");
const previousBypass = process.env.BUILDSTORY_DEV_AUTH_BYPASS;
const { PUT, DELETE } = await import("../app/api/stories/[storyId]/comments/[commentId]/upvote/route");
const { GET: getViewerState } = await import("../app/api/stories/[storyId]/comments/viewer-state/route");

const storyId = "rpt_orbit_notes_ready";
const author = ensureUser({ creatorId: "dev:upvote-api-author", name: "Upvote API Author", email: "upvote-api-author@buildstory.local", image: null });
const comment = createComment(storyId, author.id, "A comment exercised through the public API.", null);
const context = { params: Promise.resolve({ storyId, commentId: comment.id }) };
const sameOriginRequest = (method: "PUT" | "DELETE") => new Request(`http://localhost/api/stories/${storyId}/comments/${comment.id}/upvote`, { method, headers: { origin: "http://localhost", "sec-fetch-site": "same-origin" } });

test("comment-upvote endpoints enforce auth and origin, remain idempotent, and expose no-store viewer state", async () => {
  process.env.BUILDSTORY_DEV_AUTH_BYPASS = "false";
  assert.equal((await PUT(sameOriginRequest("PUT"), context)).status, 401);

  process.env.BUILDSTORY_DEV_AUTH_BYPASS = "true";
  const crossOrigin = new Request(`http://localhost/api/stories/${storyId}/comments/${comment.id}/upvote`, { method: "PUT", headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" } });
  assert.equal((await PUT(crossOrigin, context)).status, 403);

  const first = await PUT(sameOriginRequest("PUT"), context);
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { upvoteCount: 1, viewerHasUpvoted: true });
  const second = await PUT(sameOriginRequest("PUT"), context);
  assert.deepEqual(await second.json(), { upvoteCount: 1, viewerHasUpvoted: true });

  const state = await getViewerState(new Request(`http://localhost/api/stories/${storyId}/comments/viewer-state`), { params: Promise.resolve({ storyId }) });
  assert.equal(state.headers.get("cache-control"), "private, no-store");
  assert.equal(((await state.json()) as { upvotedCommentIds: string[] }).upvotedCommentIds.includes(comment.id), true);

  const removed = await DELETE(sameOriginRequest("DELETE"), context);
  assert.deepEqual(await removed.json(), { upvoteCount: 0, viewerHasUpvoted: false });
});

test("comment-upvote endpoint rejects deleted comments and applies its fixed-window rate limit", async () => {
  process.env.BUILDSTORY_DEV_AUTH_BYPASS = "true";
  deleteComment(comment.id, author.id, "member");
  assert.equal((await PUT(sameOriginRequest("PUT"), context)).status, 404);

  const rateComment = createComment(storyId, author.id, "A second comment used for rate-limit coverage.", null);
  const rateContext = { params: Promise.resolve({ storyId, commentId: rateComment.id }) };
  let limited: Response | null = null;
  for (let attempt = 0; attempt < 125; attempt += 1) {
    const response = await PUT(new Request(`http://localhost/api/stories/${storyId}/comments/${rateComment.id}/upvote`, { method: "PUT", headers: { origin: "http://localhost", "sec-fetch-site": "same-origin" } }), rateContext);
    if (response.status === 429) { limited = response; break; }
  }
  assert.equal(limited?.status, 429);
  assert.equal(((await limited!.json()) as { error: { code: string } }).error.code, "rate_limited");
});

test.after(() => {
  if (previousBypass === undefined) delete process.env.BUILDSTORY_DEV_AUTH_BYPASS;
  else process.env.BUILDSTORY_DEV_AUTH_BYPASS = previousBypass;
});
