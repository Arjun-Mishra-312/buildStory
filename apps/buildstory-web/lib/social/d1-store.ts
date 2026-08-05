import { getD1 } from "@/db";
import { sanitizePublicText } from "@/lib/publication/sanitization";
import {
  isReactionKind,
  REACTION_KINDS,
  SocialError,
  type CommentAuthor,
  type CommentRecord,
  type CommentStatus,
  type ContentReportRecord,
  type ContentReportReasonCode,
  type ContentReportStatus,
  type ContentReportTargetType,
  type FeedEntry,
  type FollowState,
  type NotificationKind,
  type NotificationRecord,
  type PublicProfile,
  type ReactionKind,
  type ReactionSummary,
} from "./contracts";

const MAX_COMMENT_BODY_LENGTH = 1_000;
const MAX_CONTENT_REPORT_NOTE_LENGTH = 500;

function makeId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

async function database() {
  try {
    return await getD1();
  } catch {
    throw new SocialError(
      "production_dependency_unavailable",
      "Buildstory's durable database is unavailable.",
      503,
    );
  }
}

function changes(result: D1Result<unknown> | undefined) {
  return Number(result?.meta?.changes ?? 0);
}

type UserRow = {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  role: string;
  status: string;
  follower_count: number;
  following_count: number;
  story_count: number;
};

function profileFromRow(row: UserRow): PublicProfile {
  return {
    id: row.id,
    handle: row.handle,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    bio: row.bio,
    followerCount: row.follower_count,
    followingCount: row.following_count,
    storyCount: row.story_count,
  };
}

function authorFromRow(row: { id: string; handle: string; display_name: string; avatar_url: string | null }): CommentAuthor {
  return { id: row.id, handle: row.handle, displayName: row.display_name, avatarUrl: row.avatar_url };
}

async function userById(id: string): Promise<UserRow | null> {
  const row = await (await database())
    .prepare(
      "SELECT id, handle, display_name, avatar_url, bio, role, status, follower_count, following_count, story_count FROM buildstory_users WHERE id = ? AND status = 'active' AND deleted_at IS NULL",
    )
    .bind(id)
    .first<UserRow>();
  return row ?? null;
}

export async function getProfile(userId: string): Promise<PublicProfile | null> {
  const row = await userById(userId);
  return row ? profileFromRow(row) : null;
}

export async function getProfileByHandle(handle: string): Promise<PublicProfile | null> {
  const row = await (await database())
    .prepare(
      "SELECT id, handle, display_name, avatar_url, bio, role, status, follower_count, following_count, story_count FROM buildstory_users WHERE handle_lower = ? AND status = 'active' AND deleted_at IS NULL",
    )
    .bind(handle.toLocaleLowerCase("en-US"))
    .first<UserRow>();
  return row ? profileFromRow(row) : null;
}

// ---------------------------------------------------------------------------
// Follows
// ---------------------------------------------------------------------------

export async function followUser(followerUserId: string, followeeUserId: string): Promise<{ followed: boolean }> {
  if (followerUserId === followeeUserId) {
    throw new SocialError("cannot_follow_self", "You cannot follow yourself.", 422);
  }
  const followee = await userById(followeeUserId);
  if (!followee) throw new SocialError("not_found", "User not found.", 404);

  const db = await database();
  const now = new Date().toISOString();
  const id = makeId("flw");
  const inserted = await db
    .prepare(
      `INSERT INTO buildstory_follows (id, follower_user_id, followee_user_id, created_at)
       SELECT ?, ?, ?, ?
       WHERE NOT EXISTS (
         SELECT 1 FROM buildstory_follows WHERE follower_user_id = ? AND followee_user_id = ?
       )`,
    )
    .bind(id, followerUserId, followeeUserId, now, followerUserId, followeeUserId)
    .run();
  if (changes(inserted) !== 1) return { followed: false };

  await db.batch([
    db
      .prepare("UPDATE buildstory_users SET following_count = following_count + 1, updated_at = ? WHERE id = ?")
      .bind(now, followerUserId),
    db
      .prepare("UPDATE buildstory_users SET follower_count = follower_count + 1, updated_at = ? WHERE id = ?")
      .bind(now, followeeUserId),
  ]);
  await createNotification(db, {
    userId: followeeUserId,
    kind: "follow",
    actorUserId: followerUserId,
    reportId: null,
    commentId: null,
  });
  return { followed: true };
}

export async function unfollowUser(followerUserId: string, followeeUserId: string): Promise<void> {
  const db = await database();
  const now = new Date().toISOString();
  const deleted = await db
    .prepare("DELETE FROM buildstory_follows WHERE follower_user_id = ? AND followee_user_id = ?")
    .bind(followerUserId, followeeUserId)
    .run();
  if (changes(deleted) !== 1) return;

  await db.batch([
    db
      .prepare(
        "UPDATE buildstory_users SET following_count = MAX(following_count - 1, 0), updated_at = ? WHERE id = ?",
      )
      .bind(now, followerUserId),
    db
      .prepare(
        "UPDATE buildstory_users SET follower_count = MAX(follower_count - 1, 0), updated_at = ? WHERE id = ?",
      )
      .bind(now, followeeUserId),
  ]);
}

export async function getFollowState(targetUserId: string, viewerUserId: string | null): Promise<FollowState> {
  const target = await userById(targetUserId);
  if (!target) throw new SocialError("not_found", "User not found.", 404);
  let isFollowedByViewer = false;
  if (viewerUserId) {
    const row = await (await database())
      .prepare("SELECT 1 FROM buildstory_follows WHERE follower_user_id = ? AND followee_user_id = ?")
      .bind(viewerUserId, targetUserId)
      .first();
    isFollowedByViewer = Boolean(row);
  }
  return {
    followerCount: target.follower_count,
    followingCount: target.following_count,
    isFollowedByViewer,
  };
}

const PROFILE_COLUMNS_PREFIXED =
  "u.id, u.handle, u.display_name, u.avatar_url, u.bio, u.role, u.status, u.follower_count, u.following_count, u.story_count";

export async function listFollowers(userId: string, limit = 50): Promise<PublicProfile[]> {
  const bounded = Math.min(Math.max(1, Math.trunc(limit)), 100);
  const rows = await (await database())
    .prepare(
      `SELECT ${PROFILE_COLUMNS_PREFIXED}
       FROM buildstory_follows f JOIN buildstory_users u ON u.id = f.follower_user_id
       WHERE f.followee_user_id = ? AND u.status = 'active' AND u.deleted_at IS NULL
       ORDER BY f.created_at DESC LIMIT ?`,
    )
    .bind(userId, bounded)
    .all<UserRow>();
  return rows.results.map(profileFromRow);
}

export async function listFollowing(userId: string, limit = 50): Promise<PublicProfile[]> {
  const bounded = Math.min(Math.max(1, Math.trunc(limit)), 100);
  const rows = await (await database())
    .prepare(
      `SELECT ${PROFILE_COLUMNS_PREFIXED}
       FROM buildstory_follows f JOIN buildstory_users u ON u.id = f.followee_user_id
       WHERE f.follower_user_id = ? AND u.status = 'active' AND u.deleted_at IS NULL
       ORDER BY f.created_at DESC LIMIT ?`,
    )
    .bind(userId, bounded)
    .all<UserRow>();
  return rows.results.map(profileFromRow);
}

// ---------------------------------------------------------------------------
// Reactions
// ---------------------------------------------------------------------------

async function reportOwnerAndSlug(db: D1Database, reportId: string) {
  return db
    .prepare(
      "SELECT owner_user_id, publication_slug, publication_status FROM buildstory_reports WHERE id = ?",
    )
    .bind(reportId)
    .first<{ owner_user_id: string | null; publication_slug: string; publication_status: string }>();
}

function emptyReactionCounts(): Record<ReactionKind, number> {
  return Object.fromEntries(REACTION_KINDS.map((kind) => [kind, 0])) as Record<ReactionKind, number>;
}

async function reactionSummary(db: D1Database, reportId: string, viewerUserId: string | null): Promise<ReactionSummary> {
  const rows = await db
    .prepare("SELECT kind, COUNT(*) AS count FROM buildstory_reactions WHERE report_id = ? GROUP BY kind")
    .bind(reportId)
    .all<{ kind: string; count: number }>();
  const counts = emptyReactionCounts();
  let total = 0;
  for (const row of rows.results) {
    if (isReactionKind(row.kind)) counts[row.kind] = row.count;
    total += row.count;
  }
  let viewerReaction: ReactionKind | null = null;
  if (viewerUserId) {
    const viewerRow = await db
      .prepare("SELECT kind FROM buildstory_reactions WHERE report_id = ? AND user_id = ?")
      .bind(reportId, viewerUserId)
      .first<{ kind: string }>();
    if (viewerRow && isReactionKind(viewerRow.kind)) viewerReaction = viewerRow.kind;
  }
  return { counts, total, viewerReaction };
}

export async function getReactionSummary(reportId: string, viewerUserId: string | null): Promise<ReactionSummary> {
  return reactionSummary(await database(), reportId, viewerUserId);
}

/** Toggle semantics: reacting again with the same kind removes it; a different kind switches to it. */
export async function setReaction(reportId: string, userId: string, kind: ReactionKind): Promise<ReactionSummary> {
  const db = await database();
  const report = await reportOwnerAndSlug(db, reportId);
  if (!report || report.publication_status !== "published") {
    throw new SocialError("not_found", "Story not found.", 404);
  }
  const now = new Date().toISOString();
  const existing = await db
    .prepare("SELECT kind FROM buildstory_reactions WHERE report_id = ? AND user_id = ?")
    .bind(reportId, userId)
    .first<{ kind: string }>();

  if (existing?.kind === kind) {
    await db
      .prepare("DELETE FROM buildstory_reactions WHERE report_id = ? AND user_id = ?")
      .bind(reportId, userId)
      .run();
    return reactionSummary(db, reportId, userId);
  }
  if (existing) {
    await db
      .prepare("UPDATE buildstory_reactions SET kind = ? WHERE report_id = ? AND user_id = ?")
      .bind(kind, reportId, userId)
      .run();
  } else {
    await db
      .prepare(
        "INSERT INTO buildstory_reactions (id, report_id, user_id, kind, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .bind(makeId("rxn"), reportId, userId, kind, now)
      .run();
    if (report.owner_user_id) {
      await createNotification(db, {
        userId: report.owner_user_id,
        kind: "reaction",
        actorUserId: userId,
        reportId,
        commentId: null,
      });
    }
  }
  return reactionSummary(db, reportId, userId);
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

type CommentRow = {
  id: string;
  report_id: string;
  parent_comment_id: string | null;
  body: string;
  status: string;
  created_at: string;
  updated_at: string;
  author_id: string;
  author_handle: string;
  author_display_name: string;
  author_avatar_url: string | null;
};

function commentFromRow(row: CommentRow): CommentRecord {
  return {
    id: row.id,
    reportId: row.report_id,
    parentCommentId: row.parent_comment_id,
    author: authorFromRow({
      id: row.author_id,
      handle: row.author_handle,
      display_name: row.author_display_name,
      avatar_url: row.author_avatar_url,
    }),
    body: row.body,
    status: row.status as CommentStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listComments(reportId: string): Promise<CommentRecord[]> {
  const rows = await (await database())
    .prepare(
      `SELECT c.id, c.report_id, c.parent_comment_id, c.body, c.status, c.created_at, c.updated_at,
              u.id AS author_id, u.handle AS author_handle, u.display_name AS author_display_name, u.avatar_url AS author_avatar_url
       FROM buildstory_comments c JOIN buildstory_users u ON u.id = c.author_user_id
       WHERE c.report_id = ?
       ORDER BY c.created_at ASC`,
    )
    .bind(reportId)
    .all<CommentRow>();
  const all = rows.results.map(commentFromRow);
  const topLevel = all.filter((comment) => comment.parentCommentId === null);
  const repliesByParent = new Map<string, CommentRecord[]>();
  for (const comment of all) {
    if (comment.parentCommentId === null) continue;
    const list = repliesByParent.get(comment.parentCommentId) ?? [];
    list.push(comment);
    repliesByParent.set(comment.parentCommentId, list);
  }
  const ordered: CommentRecord[] = [];
  for (const comment of topLevel) {
    ordered.push(comment);
    ordered.push(...(repliesByParent.get(comment.id) ?? []));
  }
  return ordered;
}

export async function createComment(
  reportId: string,
  authorUserId: string,
  rawBody: string,
  parentCommentId: string | null,
): Promise<CommentRecord> {
  const db = await database();
  const report = await reportOwnerAndSlug(db, reportId);
  if (!report || report.publication_status !== "published") {
    throw new SocialError("not_found", "Story not found.", 404);
  }
  const sanitized = sanitizePublicText(rawBody, MAX_COMMENT_BODY_LENGTH);
  if (!sanitized.value.trim()) {
    throw new SocialError("invalid_comment", "A non-empty comment body is required.", 422);
  }
  if (sanitized.findings.length > 0) {
    throw new SocialError(
      "unsafe_comment_content",
      "Comments cannot contain secrets, raw remote URLs, or absolute paths.",
      422,
    );
  }

  let parent: { id: string; parent_comment_id: string | null; report_id: string } | null = null;
  if (parentCommentId) {
    parent = await db
      .prepare("SELECT id, parent_comment_id, report_id FROM buildstory_comments WHERE id = ?")
      .bind(parentCommentId)
      .first<{ id: string; parent_comment_id: string | null; report_id: string }>();
    if (!parent || parent.report_id !== reportId || parent.parent_comment_id !== null) {
      throw new SocialError(
        "invalid_comment_parent",
        "Replies are only one level deep and must target a top-level comment on this story.",
        422,
      );
    }
  }

  const id = makeId("cmt");
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO buildstory_comments (id, report_id, author_user_id, parent_comment_id, body, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'visible', ?, ?)`,
    )
    .bind(id, reportId, authorUserId, parentCommentId, sanitized.value, now, now)
    .run();

  if (parent) {
    const parentAuthor = await db
      .prepare("SELECT author_user_id FROM buildstory_comments WHERE id = ?")
      .bind(parent.id)
      .first<{ author_user_id: string }>();
    if (parentAuthor) {
      await createNotification(db, {
        userId: parentAuthor.author_user_id,
        kind: "comment_reply",
        actorUserId: authorUserId,
        reportId,
        commentId: id,
      });
    }
  } else if (report.owner_user_id) {
    await createNotification(db, {
      userId: report.owner_user_id,
      kind: "comment",
      actorUserId: authorUserId,
      reportId,
      commentId: id,
    });
  }

  const author = await userById(authorUserId);
  if (!author) throw new SocialError("not_found", "Commenting user not found.", 404);
  return {
    id,
    reportId,
    parentCommentId,
    author: authorFromRow({ id: author.id, handle: author.handle, display_name: author.display_name, avatar_url: author.avatar_url }),
    body: sanitized.value,
    status: "visible",
    createdAt: now,
    updatedAt: now,
  };
}

export async function deleteComment(
  commentId: string,
  requestingUserId: string,
  requestingRole: string,
): Promise<void> {
  const db = await database();
  const comment = await db
    .prepare("SELECT author_user_id, status FROM buildstory_comments WHERE id = ?")
    .bind(commentId)
    .first<{ author_user_id: string; status: string }>();
  if (!comment) throw new SocialError("not_found", "Comment not found.", 404);
  const isOwner = comment.author_user_id === requestingUserId;
  const isModerator = requestingRole === "moderator" || requestingRole === "admin";
  if (!isOwner && !isModerator) {
    throw new SocialError("forbidden", "Only the comment's author or a moderator can remove it.", 403);
  }
  if (comment.status === "deleted") return;
  const now = new Date().toISOString();
  await db
    .prepare("UPDATE buildstory_comments SET status = 'deleted', body = '', updated_at = ? WHERE id = ?")
    .bind(now, commentId)
    .run();
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

async function createNotification(
  db: D1Database,
  input: {
    userId: string;
    kind: NotificationKind;
    actorUserId: string;
    reportId: string | null;
    commentId: string | null;
  },
): Promise<void> {
  if (input.userId === input.actorUserId) return;
  const id = makeId("ntf");
  const now = new Date().toISOString();
  if (input.reportId === null) {
    await db
      .prepare(
        `INSERT INTO buildstory_notifications (id, user_id, kind, actor_user_id, report_id, comment_id, read_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, NULL, ?, NULL, ?, ?)`,
      )
      .bind(id, input.userId, input.kind, input.actorUserId, input.commentId, now, now)
      .run();
    return;
  }
  await db
    .prepare(
      `INSERT INTO buildstory_notifications (id, user_id, kind, actor_user_id, report_id, comment_id, read_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)
       ON CONFLICT(user_id, kind, actor_user_id, report_id) DO UPDATE SET
         comment_id = excluded.comment_id, read_at = NULL, created_at = excluded.created_at, updated_at = excluded.updated_at`,
    )
    .bind(id, input.userId, input.kind, input.actorUserId, input.reportId, input.commentId, now, now)
    .run();
}

type NotificationRow = {
  id: string;
  kind: string;
  report_id: string | null;
  report_slug: string | null;
  comment_id: string | null;
  read_at: string | null;
  created_at: string;
  actor_id: string;
  actor_handle: string;
  actor_display_name: string;
  actor_avatar_url: string | null;
};

export async function listNotifications(userId: string, limit = 30): Promise<NotificationRecord[]> {
  const bounded = Math.min(Math.max(1, Math.trunc(limit)), 100);
  const rows = await (await database())
    .prepare(
      `SELECT n.id, n.kind, n.report_id, r.publication_slug AS report_slug, n.comment_id, n.read_at, n.created_at,
              u.id AS actor_id, u.handle AS actor_handle, u.display_name AS actor_display_name, u.avatar_url AS actor_avatar_url
       FROM buildstory_notifications n
       JOIN buildstory_users u ON u.id = n.actor_user_id
       LEFT JOIN buildstory_reports r ON r.id = n.report_id
       WHERE n.user_id = ?
       ORDER BY n.created_at DESC LIMIT ?`,
    )
    .bind(userId, bounded)
    .all<NotificationRow>();
  return rows.results.map((row) => ({
    id: row.id,
    kind: row.kind as NotificationKind,
    actor: authorFromRow({
      id: row.actor_id,
      handle: row.actor_handle,
      display_name: row.actor_display_name,
      avatar_url: row.actor_avatar_url,
    }),
    reportId: row.report_id,
    reportSlug: row.report_slug,
    commentId: row.comment_id,
    readAt: row.read_at,
    createdAt: row.created_at,
  }));
}

export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const row = await (await database())
    .prepare("SELECT COUNT(*) AS count FROM buildstory_notifications WHERE user_id = ? AND read_at IS NULL")
    .bind(userId)
    .first<{ count: number }>();
  return Number(row?.count ?? 0);
}

export async function markNotificationsRead(userId: string, notificationIds?: string[]): Promise<void> {
  const db = await database();
  const now = new Date().toISOString();
  if (!notificationIds || notificationIds.length === 0) {
    await db
      .prepare("UPDATE buildstory_notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL")
      .bind(now, userId)
      .run();
    return;
  }
  const bounded = notificationIds.slice(0, 100);
  const placeholders = bounded.map(() => "?").join(",");
  await db
    .prepare(
      `UPDATE buildstory_notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL AND id IN (${placeholders})`,
    )
    .bind(now, userId, ...bounded)
    .run();
}

// ---------------------------------------------------------------------------
// Activity feed - fan-out-on-read over followees' published stories.
// ---------------------------------------------------------------------------

type FeedRow = {
  id: string;
  publication_slug: string;
  editorial_tagline: string;
  published_at: string;
  owner_id: string;
  owner_handle: string;
  owner_display_name: string;
  owner_avatar_url: string | null;
  reaction_total: number;
  comment_count: number;
};

export async function getActivityFeed(viewerUserId: string, limit = 30): Promise<FeedEntry[]> {
  const bounded = Math.min(Math.max(1, Math.trunc(limit)), 100);
  const rows = await (await database())
    .prepare(
      `SELECT r.id, r.publication_slug, r.editorial_tagline, r.published_at,
              u.id AS owner_id, u.handle AS owner_handle, u.display_name AS owner_display_name, u.avatar_url AS owner_avatar_url,
              (SELECT COUNT(*) FROM buildstory_reactions WHERE report_id = r.id) AS reaction_total,
              (SELECT COUNT(*) FROM buildstory_comments WHERE report_id = r.id AND status = 'visible') AS comment_count
       FROM buildstory_reports r
       JOIN buildstory_follows f ON f.followee_user_id = r.owner_user_id
       JOIN buildstory_users u ON u.id = r.owner_user_id
       WHERE f.follower_user_id = ? AND r.publication_status = 'published'
       ORDER BY r.published_at DESC
       LIMIT ?`,
    )
    .bind(viewerUserId, bounded)
    .all<FeedRow>();
  return rows.results.map((row) => ({
    reportId: row.id,
    slug: row.publication_slug,
    tagline: row.editorial_tagline,
    publishedAt: row.published_at,
    author: authorFromRow({ id: row.owner_id, handle: row.owner_handle, display_name: row.owner_display_name, avatar_url: row.owner_avatar_url }),
    reactionTotal: row.reaction_total,
    commentCount: row.comment_count,
  }));
}

// ---------------------------------------------------------------------------
// Content reports (abuse reporting)
// ---------------------------------------------------------------------------

function contentReportFromRow(row: {
  id: string;
  reporter_user_id: string;
  target_type: string;
  target_id: string;
  reason_code: string;
  note: string | null;
  status: string;
  created_at: string;
  resolved_at: string | null;
}): ContentReportRecord {
  return {
    id: row.id,
    reporterUserId: row.reporter_user_id,
    targetType: row.target_type as ContentReportTargetType,
    targetId: row.target_id,
    reasonCode: row.reason_code as ContentReportReasonCode,
    note: row.note,
    status: row.status as ContentReportStatus,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}

export async function fileContentReport(
  reporterUserId: string,
  targetType: ContentReportTargetType,
  targetId: string,
  reasonCode: ContentReportReasonCode,
  rawNote: string | null,
): Promise<ContentReportRecord> {
  const note = rawNote?.trim() ? sanitizePublicText(rawNote, MAX_CONTENT_REPORT_NOTE_LENGTH).value : null;
  const db = await database();
  const id = makeId("crp");
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO buildstory_content_reports (id, reporter_user_id, target_type, target_id, reason_code, note, status, created_at, resolved_at)
       VALUES (?, ?, ?, ?, ?, ?, 'open', ?, NULL)`,
    )
    .bind(id, reporterUserId, targetType, targetId, reasonCode, note, now)
    .run();
  return {
    id,
    reporterUserId,
    targetType,
    targetId,
    reasonCode,
    note,
    status: "open",
    createdAt: now,
    resolvedAt: null,
  };
}

export async function listContentReports(status?: ContentReportStatus, limit = 50): Promise<ContentReportRecord[]> {
  const bounded = Math.min(Math.max(1, Math.trunc(limit)), 200);
  const db = await database();
  const rows = status
    ? await db
        .prepare(
          "SELECT * FROM buildstory_content_reports WHERE status = ? ORDER BY created_at DESC LIMIT ?",
        )
        .bind(status, bounded)
        .all()
    : await db
        .prepare("SELECT * FROM buildstory_content_reports ORDER BY created_at DESC LIMIT ?")
        .bind(bounded)
        .all();
  return (rows.results as Array<Parameters<typeof contentReportFromRow>[0]>).map(contentReportFromRow);
}

export async function resolveContentReport(reportId: string, status: ContentReportStatus): Promise<void> {
  if (status === "open") {
    throw new SocialError("invalid_status", "A report cannot be resolved back to open.", 422);
  }
  const db = await database();
  const now = new Date().toISOString();
  const updated = await db
    .prepare("UPDATE buildstory_content_reports SET status = ?, resolved_at = ? WHERE id = ?")
    .bind(status, now, reportId)
    .run();
  if (changes(updated) !== 1) throw new SocialError("not_found", "Content report not found.", 404);
}
