import assert from "node:assert/strict";
import test from "node:test";
import { SocialError } from "../lib/social/contracts";
import {
  createComment,
  deleteComment,
  followUser,
  getActivityFeed,
  getFollowState,
  getReactionSummary,
  getUnreadNotificationCount,
  listComments,
  listNotifications,
  markNotificationsRead,
  registerProfile,
  registerReport,
  setReaction,
  unfollowUser,
} from "../lib/social/mock-store";

let counter = 0;
function seedUser(handle: string) {
  counter += 1;
  const id = `usr_test_${counter}`;
  registerProfile({ id, handle, displayName: handle, avatarUrl: null, bio: null });
  return id;
}

function seedReport(id: string, ownerUserId: string, publicationStatus = "published") {
  registerReport({
    id,
    ownerUserId,
    publicationStatus,
    publicationSlug: id,
    editorialTagline: `${id} tagline`,
    publishedAt: publicationStatus === "published" ? new Date().toISOString() : null,
  });
}

test("follows: rejects self-follow, updates counts, and is idempotent", () => {
  const alice = seedUser("alice1");
  const bob = seedUser("bob1");

  assert.throws(() => followUser(alice, alice), (error) => error instanceof SocialError && error.code === "cannot_follow_self");

  const first = followUser(alice, bob);
  assert.equal(first.followed, true);
  const second = followUser(alice, bob);
  assert.equal(second.followed, false);

  const state = getFollowState(bob, alice);
  assert.equal(state.followerCount, 1);
  assert.equal(state.isFollowedByViewer, true);

  unfollowUser(alice, bob);
  unfollowUser(alice, bob); // idempotent no-op
  const afterUnfollow = getFollowState(bob, alice);
  assert.equal(afterUnfollow.followerCount, 0);
  assert.equal(afterUnfollow.isFollowedByViewer, false);
});

test("reactions: single reaction per user, toggling the same kind removes it, notifies the owner once", () => {
  const owner = seedUser("owner1");
  const fan = seedUser("fan1");
  seedReport("rpt_reactions_1", owner);

  const first = setReaction("rpt_reactions_1", fan, "fire");
  assert.equal(first.total, 1);
  assert.equal(first.counts.fire, 1);
  assert.equal(first.viewerReaction, "fire");

  const switched = setReaction("rpt_reactions_1", fan, "mindblown");
  assert.equal(switched.total, 1);
  assert.equal(switched.counts.fire, 0);
  assert.equal(switched.counts.mindblown, 1);

  const toggledOff = setReaction("rpt_reactions_1", fan, "mindblown");
  assert.equal(toggledOff.total, 0);
  assert.equal(toggledOff.viewerReaction, null);

  const summary = getReactionSummary("rpt_reactions_1", null);
  assert.equal(summary.total, 0);

  assert.equal(getUnreadNotificationCount(owner), 1);
  const notifications = listNotifications(owner);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0]?.kind, "reaction");
  assert.equal(notifications[0]?.actor.id, fan);
});

test("reactions: reacting to your own story never notifies yourself", () => {
  const owner = seedUser("owner2");
  seedReport("rpt_reactions_2", owner);
  setReaction("rpt_reactions_2", owner, "fire");
  assert.equal(getUnreadNotificationCount(owner), 0);
});

test("comments: enforces one reply level, sanitizes content, and notifies the right people", () => {
  const owner = seedUser("owner3");
  const commenter = seedUser("commenter3");
  const replier = seedUser("replier3");
  seedReport("rpt_comments_1", owner);

  const top = createComment("rpt_comments_1", commenter, "Love the job-queue write-up.", null);
  assert.equal(top.parentCommentId, null);
  assert.equal(top.status, "visible");

  const reply = createComment("rpt_comments_1", replier, "Agreed, the lease pattern is clean.", top.id);
  assert.equal(reply.parentCommentId, top.id);

  assert.throws(
    () => createComment("rpt_comments_1", commenter, "Reply to a reply.", reply.id),
    (error) => error instanceof SocialError && error.code === "invalid_comment_parent",
  );

  assert.throws(
    () => createComment("rpt_comments_1", commenter, "", null),
    (error) => error instanceof SocialError && error.code === "invalid_comment",
  );

  assert.throws(
    () => createComment("rpt_comments_1", commenter, "token=sk-proj-abcdefghijklmnopqrstuvwxyz123456", null),
    (error) => error instanceof SocialError && error.code === "unsafe_comment_content",
  );

  const ordered = listComments("rpt_comments_1");
  assert.deepEqual(
    ordered.map((comment) => comment.id),
    [top.id, reply.id],
  );

  assert.equal(getUnreadNotificationCount(owner), 1); // top-level comment
  assert.equal(getUnreadNotificationCount(commenter), 1); // reply to their top-level comment
});

test("comments: soft delete by author or moderator, refused for anyone else", () => {
  const owner = seedUser("owner4");
  const commenter = seedUser("commenter4");
  const stranger = seedUser("stranger4");
  seedReport("rpt_comments_2", owner);
  const comment = createComment("rpt_comments_2", commenter, "This is a genuinely useful comment body.", null);

  assert.throws(
    () => deleteComment(comment.id, stranger, "member"),
    (error) => error instanceof SocialError && error.code === "forbidden",
  );

  deleteComment(comment.id, owner, "moderator");
  const [deleted] = listComments("rpt_comments_2");
  assert.equal(deleted?.status, "deleted");
  assert.equal(deleted?.body, "");
});

test("notifications: repeated reactions on the same story collapse into one unread row", () => {
  const owner = seedUser("owner5");
  const fanA = seedUser("fanA5");
  const fanB = seedUser("fanB5");
  seedReport("rpt_notif_1", owner);

  setReaction("rpt_notif_1", fanA, "fire");
  setReaction("rpt_notif_1", fanB, "shipped");
  assert.equal(getUnreadNotificationCount(owner), 2);

  markNotificationsRead(owner);
  assert.equal(getUnreadNotificationCount(owner), 0);
});

test("activity feed: only shows published stories from people the viewer follows, newest first", () => {
  const viewer = seedUser("viewer6");
  const followed = seedUser("followed6");
  const stranger = seedUser("stranger6");
  followUser(viewer, followed);

  registerReport({
    id: "rpt_feed_old",
    ownerUserId: followed,
    publicationStatus: "published",
    publicationSlug: "feed-old",
    editorialTagline: "Old story",
    publishedAt: "2026-01-01T00:00:00.000Z",
  });
  registerReport({
    id: "rpt_feed_new",
    ownerUserId: followed,
    publicationStatus: "published",
    publicationSlug: "feed-new",
    editorialTagline: "New story",
    publishedAt: "2026-06-01T00:00:00.000Z",
  });
  registerReport({
    id: "rpt_feed_unpublished",
    ownerUserId: followed,
    publicationStatus: "not_published",
    publicationSlug: "feed-draft",
    editorialTagline: "Draft story",
    publishedAt: null,
  });
  seedReport("rpt_feed_stranger", stranger);

  const feed = getActivityFeed(viewer);
  assert.deepEqual(
    feed.map((entry) => entry.slug),
    ["feed-new", "feed-old"],
  );
});
