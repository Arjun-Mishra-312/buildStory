import { sanitizePublicText } from "@/lib/publication/sanitization";
import {
  REACTION_KINDS,
  SocialError,
  type CommentAuthor,
  type CommentRecord,
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

type StoredUser = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  role: string;
  followerCount: number;
  followingCount: number;
  storyCount: number;
};

type StoredReport = {
  id: string;
  ownerUserId: string | null;
  projectId: string;
  publicationStatus: string;
  publicationSlug: string;
  editorialTagline: string;
  publishedAt: string | null;
  chapterIndex: number | null;
};

type StoredComment = {
  id: string;
  reportId: string;
  authorUserId: string;
  parentCommentId: string | null;
  body: string;
  status: "visible" | "deleted" | "hidden";
  createdAt: string;
  updatedAt: string;
};

type StoredNotification = {
  id: string;
  userId: string;
  kind: NotificationKind;
  actorUserId: string;
  reportId: string | null;
  commentId: string | null;
  readAt: string | null;
  createdAt: string;
};

type SocialMockStore = {
  users: Map<string, StoredUser>;
  reports: Map<string, StoredReport>;
  follows: Set<string>; // `${followerUserId}:${followeeUserId}`
  reactions: Map<string, { kind: ReactionKind; createdAt: string }>; // `${reportId}:${userId}`
  comments: Map<string, StoredComment>;
  commentUpvotes: Map<string, string>; // `${commentId}:${userId}` -> createdAt
  notifications: Map<string, StoredNotification>;
  contentReports: Map<string, ContentReportRecord>;
};

type StoreGlobal = typeof globalThis & { __buildstoryMockSocial?: SocialMockStore };
const storeGlobal = globalThis as StoreGlobal;
const store: SocialMockStore =
  storeGlobal.__buildstoryMockSocial ??
  (storeGlobal.__buildstoryMockSocial = {
    users: new Map<string, StoredUser>(),
    reports: new Map<string, StoredReport>(),
    follows: new Set<string>(),
    reactions: new Map<string, { kind: ReactionKind; createdAt: string }>(),
    comments: new Map<string, StoredComment>(),
    commentUpvotes: new Map<string, string>(),
    notifications: new Map<string, StoredNotification>(),
    contentReports: new Map<string, ContentReportRecord>(),
  });

function makeId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

function followKey(followerUserId: string, followeeUserId: string) {
  return `${followerUserId}:${followeeUserId}`;
}

function reactionKey(reportId: string, userId: string) {
  return `${reportId}:${userId}`;
}

function commentUpvoteKey(commentId: string, userId: string) {
  return `${commentId}:${userId}`;
}

function authorFor(userId: string): CommentAuthor {
  const user = store.users.get(userId);
  return user
    ? { id: user.id, handle: user.handle, displayName: user.displayName, avatarUrl: user.avatarUrl }
    : { id: userId, handle: "unknown", displayName: "Unknown", avatarUrl: null };
}

function profileFor(user: StoredUser): PublicProfile {
  const storyCount = new Set(
    Array.from(store.reports.values())
      .filter((report) => report.ownerUserId === user.id && report.publicationStatus === "published")
      .map((report) => report.publicationSlug),
  ).size;
  return {
    id: user.id,
    handle: user.handle,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    followerCount: user.followerCount,
    followingCount: user.followingCount,
    storyCount,
  };
}

/** Registers/refreshes profile fields the social mock store needs, independent of the ingestion mock store's own user map. */
export function registerProfile(user: {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  role?: string;
}) {
  const existing = store.users.get(user.id);
  store.users.set(user.id, {
    id: user.id,
    handle: user.handle,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    role: user.role ?? existing?.role ?? "member",
    followerCount: existing?.followerCount ?? 0,
    followingCount: existing?.followingCount ?? 0,
    storyCount: existing?.storyCount ?? 0,
  });
}

/** Registers/refreshes the minimal report fields the social mock store needs, independent of the ingestion mock store's own report map. */
export function registerReport(report: {
  id: string;
  ownerUserId: string | null;
  projectId: string;
  publicationStatus: string;
  publicationSlug: string;
  editorialTagline: string;
  publishedAt: string | null;
  chapterIndex: number | null;
}) {
  store.reports.set(report.id, { ...report });
}

/** Every published (or draft_changes) report id for a project, most recent chapter first - mirrors d1-store.ts's publishedReportIdsForProject. */
export function publishedReportIdsForProject(projectId: string): string[] {
  return Array.from(store.reports.values())
    .filter((report) => report.projectId === projectId && (report.publicationStatus === "published" || report.publicationStatus === "draft_changes"))
    .sort((left, right) => (right.chapterIndex ?? 0) - (left.chapterIndex ?? 0))
    .map((report) => report.id);
}

export function getProfile(userId: string): PublicProfile | null {
  const user = store.users.get(userId);
  return user ? profileFor(user) : null;
}

export function getProfileByHandle(handle: string): PublicProfile | null {
  const lower = handle.toLocaleLowerCase("en-US");
  const user = Array.from(store.users.values()).find((candidate) => candidate.handle.toLocaleLowerCase("en-US") === lower);
  return user ? profileFor(user) : null;
}

/** Public boundary: matches only against public profile fields (handle, display name), never private account data. */
export function searchProfiles(query: string, limit = 20): PublicProfile[] {
  const bounded = Math.min(Math.max(1, Math.trunc(limit)), 50);
  const needle = query.trim().slice(0, 200).toLocaleLowerCase("en-US");
  if (needle.length < 2) return [];
  return Array.from(store.users.values())
    .filter((user) => user.handle.toLocaleLowerCase("en-US").includes(needle) || user.displayName.toLocaleLowerCase("en-US").includes(needle))
    .sort((left, right) => right.followerCount - left.followerCount)
    .slice(0, bounded)
    .map(profileFor);
}

// ---------------------------------------------------------------------------
// Follows
// ---------------------------------------------------------------------------

export function followUser(followerUserId: string, followeeUserId: string): { followed: boolean } {
  if (followerUserId === followeeUserId) {
    throw new SocialError("cannot_follow_self", "You cannot follow yourself.", 422);
  }
  const followee = store.users.get(followeeUserId);
  const follower = store.users.get(followerUserId);
  if (!followee || !follower) throw new SocialError("not_found", "User not found.", 404);
  const key = followKey(followerUserId, followeeUserId);
  if (store.follows.has(key)) return { followed: false };
  store.follows.add(key);
  follower.followingCount += 1;
  followee.followerCount += 1;
  createNotification({ userId: followeeUserId, kind: "follow", actorUserId: followerUserId, reportId: null, commentId: null });
  return { followed: true };
}

export function unfollowUser(followerUserId: string, followeeUserId: string): void {
  const key = followKey(followerUserId, followeeUserId);
  if (!store.follows.has(key)) return;
  store.follows.delete(key);
  const follower = store.users.get(followerUserId);
  const followee = store.users.get(followeeUserId);
  if (follower) follower.followingCount = Math.max(follower.followingCount - 1, 0);
  if (followee) followee.followerCount = Math.max(followee.followerCount - 1, 0);
}

export function getFollowState(targetUserId: string, viewerUserId: string | null): FollowState {
  const target = store.users.get(targetUserId);
  if (!target) throw new SocialError("not_found", "User not found.", 404);
  return {
    followerCount: target.followerCount,
    followingCount: target.followingCount,
    isFollowedByViewer: viewerUserId ? store.follows.has(followKey(viewerUserId, targetUserId)) : false,
  };
}

export function listFollowers(userId: string, limit = 50): PublicProfile[] {
  const bounded = Math.min(Math.max(1, Math.trunc(limit)), 100);
  return Array.from(store.follows)
    .filter((key) => key.endsWith(`:${userId}`))
    .map((key) => key.split(":")[0]!)
    .map((id) => store.users.get(id))
    .filter((user): user is StoredUser => Boolean(user))
    .slice(0, bounded)
    .map(profileFor);
}

export function listFollowing(userId: string, limit = 50): PublicProfile[] {
  const bounded = Math.min(Math.max(1, Math.trunc(limit)), 100);
  return Array.from(store.follows)
    .filter((key) => key.startsWith(`${userId}:`))
    .map((key) => key.split(":")[1]!)
    .map((id) => store.users.get(id))
    .filter((user): user is StoredUser => Boolean(user))
    .slice(0, bounded)
    .map(profileFor);
}

// ---------------------------------------------------------------------------
// Reactions
// ---------------------------------------------------------------------------

function emptyReactionCounts(): Record<ReactionKind, number> {
  return Object.fromEntries(REACTION_KINDS.map((kind) => [kind, 0])) as Record<ReactionKind, number>;
}

function reactionSummaryForReports(reportIds: string[], viewerUserId: string | null, preferredReportId?: string): ReactionSummary {
  const counts = emptyReactionCounts();
  let total = 0;
  const reportIdSet = new Set(reportIds);
  for (const [key, reaction] of store.reactions.entries()) {
    const [reportId] = key.split(":");
    if (!reportId || !reportIdSet.has(reportId)) continue;
    counts[reaction.kind] += 1;
    total += 1;
  }
  let viewerReaction: ReactionKind | null = null;
  if (viewerUserId) {
    const preferred = preferredReportId ? store.reactions.get(reactionKey(preferredReportId, viewerUserId)) : null;
    const fallback = preferred ? null : reportIds.map((id) => store.reactions.get(reactionKey(id, viewerUserId))).find((reaction) => reaction);
    viewerReaction = (preferred ?? fallback)?.kind ?? null;
  }
  return { counts, total, viewerReaction };
}

/** Single-report reaction summary - kept for callers that intentionally show only one chapter's own count. */
export function getReactionSummary(reportId: string, viewerUserId: string | null): ReactionSummary {
  return reactionSummaryForReports([reportId], viewerUserId, reportId);
}

/** Project-wide rollup: counts and total sum across every published chapter; viewerReaction prefers the given current-chapter id. */
export function getReactionSummaryForReports(reportIds: string[], viewerUserId: string | null): ReactionSummary {
  return reactionSummaryForReports(reportIds, viewerUserId, reportIds[0]);
}

export function setReaction(reportId: string, userId: string, kind: ReactionKind): ReactionSummary {
  const report = store.reports.get(reportId);
  if (!report || (report.publicationStatus !== "published" && report.publicationStatus !== "draft_changes")) {
    throw new SocialError("not_found", "Story not found.", 404);
  }
  const rollupReportIds = publishedReportIdsForProject(report.projectId);
  const key = reactionKey(reportId, userId);
  const existing = store.reactions.get(key);
  if (existing?.kind === kind) {
    store.reactions.delete(key);
    return reactionSummaryForReports(rollupReportIds, userId, reportId);
  }
  const isNew = existing === undefined;
  store.reactions.set(key, { kind, createdAt: existing?.createdAt ?? new Date().toISOString() });
  if (isNew && report.ownerUserId) {
    createNotification({ userId: report.ownerUserId, kind: "reaction", actorUserId: userId, reportId, commentId: null });
  }
  return reactionSummaryForReports(rollupReportIds, userId, reportId);
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

function commentRecordFor(comment: StoredComment): CommentRecord {
  return {
    id: comment.id,
    reportId: comment.reportId,
    chapterIndex: store.reports.get(comment.reportId)?.chapterIndex ?? 1,
    parentCommentId: comment.parentCommentId,
    author: authorFor(comment.authorUserId),
    body: comment.status === "visible" ? comment.body : "",
    status: comment.status,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    upvoteCount: Array.from(store.commentUpvotes.keys()).filter((key) => key.startsWith(`${comment.id}:`)).length,
  };
}

/** Threads replies under their top-level parent - a reply always targets a top-level comment on the same report (enforced in createComment), so this works whether reportIds is one chapter or a whole project's rollup. */
function listCommentsForReportIds(reportIds: string[], limit: number, cursor?: string): CommentRecord[] {
  const reportIdSet = new Set(reportIds);
  const all = Array.from(store.comments.values())
    .filter((comment) => reportIdSet.has(comment.reportId))
    .filter((comment) => !cursor || comment.createdAt > cursor)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const topLevel = all.filter((comment) => comment.parentCommentId === null);
  const repliesByParent = new Map<string, StoredComment[]>();
  for (const comment of all) {
    if (comment.parentCommentId === null) continue;
    const list = repliesByParent.get(comment.parentCommentId) ?? [];
    list.push(comment);
    repliesByParent.set(comment.parentCommentId, list);
  }
  const ordered: CommentRecord[] = [];
  for (const comment of topLevel) {
    ordered.push(commentRecordFor(comment));
    for (const reply of repliesByParent.get(comment.id) ?? []) ordered.push(commentRecordFor(reply));
  }
  return ordered.slice(0, Math.min(Math.max(1, Math.trunc(limit)), 200));
}

/** Single-report thread - kept for callers that intentionally show only one chapter's own comments. */
export function listComments(reportId: string, limit = 100, cursor?: string): CommentRecord[] {
  return listCommentsForReportIds([reportId], limit, cursor);
}

/** Project-wide rollup: merges every published chapter's comment thread, oldest first, each comment tagged with its own chapterIndex. */
export function listCommentsForReports(reportIds: string[], limit = 100, cursor?: string): CommentRecord[] {
  return listCommentsForReportIds(reportIds, limit, cursor);
}

export function createComment(
  reportId: string,
  authorUserId: string,
  rawBody: string,
  parentCommentId: string | null,
): CommentRecord {
  const report = store.reports.get(reportId);
  if (!report || (report.publicationStatus !== "published" && report.publicationStatus !== "draft_changes")) {
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
  let parent: StoredComment | null = null;
  if (parentCommentId) {
    parent = store.comments.get(parentCommentId) ?? null;
    if (!parent || parent.reportId !== reportId || parent.parentCommentId !== null) {
      throw new SocialError(
        "invalid_comment_parent",
        "Replies are only one level deep and must target a top-level comment on this story.",
        422,
      );
    }
  }
  const now = new Date().toISOString();
  const comment: StoredComment = {
    id: makeId("cmt"),
    reportId,
    authorUserId,
    parentCommentId,
    body: sanitized.value,
    status: "visible",
    createdAt: now,
    updatedAt: now,
  };
  store.comments.set(comment.id, comment);

  if (parent) {
    createNotification({ userId: parent.authorUserId, kind: "comment_reply", actorUserId: authorUserId, reportId, commentId: comment.id });
  } else if (report.ownerUserId) {
    createNotification({ userId: report.ownerUserId, kind: "comment", actorUserId: authorUserId, reportId, commentId: comment.id });
  }
  return commentRecordFor(comment);
}

export function deleteComment(commentId: string, requestingUserId: string, requestingRole: string): void {
  const comment = store.comments.get(commentId);
  if (!comment) throw new SocialError("not_found", "Comment not found.", 404);
  const isOwner = comment.authorUserId === requestingUserId;
  const isModerator = requestingRole === "moderator" || requestingRole === "admin";
  if (!isOwner && !isModerator) {
    throw new SocialError("forbidden", "Only the comment's author or a moderator can remove it.", 403);
  }
  if (comment.status === "deleted") return;
  comment.status = "deleted";
  comment.body = "";
  comment.updatedAt = new Date().toISOString();
}

/** Project-wide rollup variant - matches against every comment across the given chapters. */
export function getCommentViewerStateForReports(reportIds: string[], viewerUserId: string | null) {
  if (!viewerUserId) return { upvotedCommentIds: [], removableCommentIds: [] };
  const reportIdSet = new Set(reportIds);
  const comments = Array.from(store.comments.values()).filter((comment) => reportIdSet.has(comment.reportId));
  return {
    upvotedCommentIds: comments.filter((comment) => store.commentUpvotes.has(commentUpvoteKey(comment.id, viewerUserId))).map((comment) => comment.id),
    removableCommentIds: comments.filter((comment) => comment.authorUserId === viewerUserId || ["moderator", "admin"].includes(store.users.get(viewerUserId)?.role ?? "")).map((comment) => comment.id),
  };
}

/** Single-report viewer state - kept for callers that intentionally scope to one chapter. */
export function getCommentViewerState(reportId: string, viewerUserId: string | null) {
  return getCommentViewerStateForReports([reportId], viewerUserId);
}

export function setCommentUpvote(commentId: string, userId: string, enabled: boolean) {
  const comment = store.comments.get(commentId);
  if (!comment || comment.status !== "visible") throw new SocialError("not_found", "Comment not found.", 404);
  const report = store.reports.get(comment.reportId);
  if (!report || (report.publicationStatus !== "published" && report.publicationStatus !== "draft_changes")) throw new SocialError("not_found", "Story not found.", 404);
  const key = commentUpvoteKey(commentId, userId);
  if (enabled) {
    const isNew = !store.commentUpvotes.has(key);
    if (isNew) store.commentUpvotes.set(key, new Date().toISOString());
    if (isNew) {
      const owner = store.comments.get(commentId)?.authorUserId;
      if (owner) createNotification({ userId: owner, kind: "comment_upvote", actorUserId: userId, reportId: comment.reportId, commentId });
    }
  } else {
    store.commentUpvotes.delete(key);
  }
  return {
    upvoteCount: Array.from(store.commentUpvotes.keys()).filter((item) => item.startsWith(`${commentId}:`)).length,
    viewerHasUpvoted: store.commentUpvotes.has(key),
  };
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

function createNotification(input: {
  userId: string;
  kind: NotificationKind;
  actorUserId: string;
  reportId: string | null;
  commentId: string | null;
}): void {
  if (input.userId === input.actorUserId) return;
  const now = new Date().toISOString();
  if (input.reportId !== null) {
    const existing = Array.from(store.notifications.values()).find(
      (candidate) =>
        candidate.userId === input.userId &&
        candidate.kind === input.kind &&
        candidate.actorUserId === input.actorUserId &&
        candidate.reportId === input.reportId,
    );
    if (existing) {
      existing.commentId = input.commentId;
      existing.readAt = null;
      existing.createdAt = now;
      return;
    }
  }
  const notification: StoredNotification = {
    id: makeId("ntf"),
    userId: input.userId,
    kind: input.kind,
    actorUserId: input.actorUserId,
    reportId: input.reportId,
    commentId: input.commentId,
    readAt: null,
    createdAt: now,
  };
  store.notifications.set(notification.id, notification);
}

/** Called by lib/ingestion/mock-store.ts's publishReport when a chapter after the first publishes - the one place ingestion reaches into the social domain, since "who follows this owner" is social-domain data. */
export function notifyFollowersOfStoryUpdate(reportId: string, ownerUserId: string): void {
  for (const key of store.follows) {
    const [followerUserId, followeeUserId] = key.split(":");
    if (followeeUserId === ownerUserId && followerUserId) {
      createNotification({ userId: followerUserId, kind: "story_update", actorUserId: ownerUserId, reportId, commentId: null });
    }
  }
}

export function listNotifications(userId: string, limit = 30, cursor?: string): NotificationRecord[] {
  const bounded = Math.min(Math.max(1, Math.trunc(limit)), 100);
  return Array.from(store.notifications.values())
    .filter((notification) => notification.userId === userId)
    .filter((notification) => !cursor || notification.createdAt < cursor)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, bounded)
    .map((notification) => ({
      id: notification.id,
      kind: notification.kind,
      actor: authorFor(notification.actorUserId),
      reportId: notification.reportId,
      reportSlug: notification.reportId ? (store.reports.get(notification.reportId)?.publicationSlug ?? null) : null,
      commentId: notification.commentId,
      readAt: notification.readAt,
      createdAt: notification.createdAt,
    }));
}

export function getUnreadNotificationCount(userId: string): number {
  let count = 0;
  for (const notification of store.notifications.values()) {
    if (notification.userId === userId && notification.readAt === null) count += 1;
  }
  return count;
}

export function markNotificationsRead(userId: string, notificationIds?: string[]): void {
  const now = new Date().toISOString();
  const idSet = notificationIds ? new Set(notificationIds) : null;
  for (const notification of store.notifications.values()) {
    if (notification.userId !== userId || notification.readAt !== null) continue;
    if (idSet && !idSet.has(notification.id)) continue;
    notification.readAt = now;
  }
}

// ---------------------------------------------------------------------------
// Activity feed
// ---------------------------------------------------------------------------

export function getActivityFeed(viewerUserId: string, limit = 30, cursor?: string): FeedEntry[] {
  const bounded = Math.min(Math.max(1, Math.trunc(limit)), 100);
  const followeeIds = new Set(
    Array.from(store.follows)
      .filter((key) => key.startsWith(`${viewerUserId}:`))
      .map((key) => key.split(":")[1]!),
  );
  return Array.from(store.reports.values())
    .filter((report) => report.publicationStatus === "published" && report.ownerUserId && followeeIds.has(report.ownerUserId))
    .filter((report) => !cursor || (report.publishedAt ?? "") < cursor)
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
    .slice(0, bounded)
    .map((report) => {
      const owner = store.users.get(report.ownerUserId!);
      const reactionTotal = Array.from(store.reactions.keys()).filter((key) => key.startsWith(`${report.id}:`)).length;
      const commentCount = Array.from(store.comments.values()).filter(
        (comment) => comment.reportId === report.id && comment.status === "visible",
      ).length;
      return {
        reportId: report.id,
        slug: report.publicationSlug,
        chapterIndex: report.chapterIndex ?? 1,
        tagline: report.editorialTagline,
        publishedAt: report.publishedAt ?? "",
        author: owner ? authorFor(owner.id) : { id: report.ownerUserId!, handle: "unknown", displayName: "Unknown", avatarUrl: null },
        reactionTotal,
        commentCount,
      };
    });
}

// ---------------------------------------------------------------------------
// Content reports (abuse reporting)
// ---------------------------------------------------------------------------

export function fileContentReport(
  reporterUserId: string,
  targetType: ContentReportTargetType,
  targetId: string,
  reasonCode: ContentReportReasonCode,
  rawNote: string | null,
): ContentReportRecord {
  const note = rawNote?.trim() ? sanitizePublicText(rawNote, MAX_CONTENT_REPORT_NOTE_LENGTH).value : null;
  const record: ContentReportRecord = {
    id: makeId("crp"),
    reporterUserId,
    targetType,
    targetId,
    reasonCode,
    note,
    status: "open",
    createdAt: new Date().toISOString(),
    resolvedAt: null,
  };
  store.contentReports.set(record.id, record);
  return record;
}

export function listContentReports(status?: ContentReportStatus, limit = 50, cursor?: string): ContentReportRecord[] {
  const bounded = Math.min(Math.max(1, Math.trunc(limit)), 200);
  return Array.from(store.contentReports.values())
    .filter((report) => !status || report.status === status)
    .filter((report) => !cursor || report.createdAt < cursor)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, bounded);
}

export function resolveContentReport(reportId: string, status: ContentReportStatus, actorUserId?: string): void {
  void actorUserId;
  if (status === "open") {
    throw new SocialError("invalid_status", "A report cannot be resolved back to open.", 422);
  }
  const report = store.contentReports.get(reportId);
  if (!report) throw new SocialError("not_found", "Content report not found.", 404);
  report.status = status;
  report.resolvedAt = new Date().toISOString();
}

/** Account export needs: everything this user authored/gave/follows, across every table this module owns. */
export function getAccountSocialData(userId: string): {
  commentsAuthored: Array<{ id: string; reportId: string; parentCommentId: string | null; body: string; createdAt: string }>;
  reactionsGiven: Array<{ reportId: string; kind: ReactionKind; createdAt: string }>;
  commentUpvotesGiven: Array<{ commentId: string; reportId: string; createdAt: string }>;
  following: string[];
  followers: string[];
} {
  const commentsAuthored = Array.from(store.comments.values())
    .filter((comment) => comment.authorUserId === userId && comment.status === "visible")
    .map((comment) => ({
      id: comment.id,
      reportId: comment.reportId,
      parentCommentId: comment.parentCommentId,
      body: comment.body,
      createdAt: comment.createdAt,
    }));
  // Reactions don't carry their own creation timestamp separate from the map value in this store, so a placeholder is used for the export's shape.
  const reactionsGiven = Array.from(store.reactions.entries())
    .filter(([key]) => key.endsWith(`:${userId}`))
    .map(([key, reaction]) => ({ reportId: key.split(":")[0]!, kind: reaction.kind, createdAt: reaction.createdAt }));
  const commentUpvotesGiven = Array.from(store.commentUpvotes.entries())
    .filter(([key]) => key.endsWith(`:${userId}`))
    .map(([key, createdAt]) => { const commentId = key.split(":")[0]!; const comment = store.comments.get(commentId); return { commentId, reportId: comment?.reportId ?? "", createdAt }; })
    .filter((item) => Boolean(item.reportId));
  const following = Array.from(store.follows)
    .filter((key) => key.startsWith(`${userId}:`))
    .map((key) => store.users.get(key.split(":")[1]!)?.handle)
    .filter((handle): handle is string => Boolean(handle));
  const followers = Array.from(store.follows)
    .filter((key) => key.endsWith(`:${userId}`))
    .map((key) => store.users.get(key.split(":")[0]!)?.handle)
    .filter((handle): handle is string => Boolean(handle));
  return { commentsAuthored, reactionsGiven, commentUpvotesGiven, following, followers };
}

// ---------------------------------------------------------------------------
// Account deletion
// ---------------------------------------------------------------------------

/** Mirrors d1-store's cascade behavior for the tables this module owns; the ingestion mock store handles its own reports/projects/sessions separately. */
export function deleteAccountSocialData(userId: string): void {
  for (const [reportId, report] of store.reports) {
    if (report.ownerUserId === userId) store.reports.delete(reportId);
  }
  for (const key of store.follows) {
    if (key.startsWith(`${userId}:`) || key.endsWith(`:${userId}`)) store.follows.delete(key);
  }
  for (const key of store.reactions.keys()) {
    if (key.endsWith(`:${userId}`)) store.reactions.delete(key);
  }
  for (const [commentId, comment] of store.comments) {
    if (comment.authorUserId === userId) store.comments.delete(commentId);
  }
  for (const key of store.commentUpvotes.keys()) {
    const [commentId, voterId] = key.split(":");
    if (voterId === userId || !store.comments.has(commentId!)) store.commentUpvotes.delete(key);
  }
  for (const [notificationId, notification] of store.notifications) {
    if (notification.userId === userId || notification.actorUserId === userId) {
      store.notifications.delete(notificationId);
    }
  }
  for (const [reportId, report] of store.contentReports) {
    if (report.reporterUserId === userId) store.contentReports.delete(reportId);
  }
  store.users.delete(userId);
}

/** Current public activity used by Explore's deterministic 30-day trending order. */
export function getTrendingScoreForReport(reportId: string, now = Date.now()) {
  const cutoff = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
  const reactions = Array.from(store.reactions.entries()).filter(([key, reaction]) => key.startsWith(`${reportId}:`) && reaction.createdAt >= cutoff).length;
  const comments = Array.from(store.comments.values()).filter((comment) => comment.reportId === reportId && comment.status === "visible" && comment.createdAt >= cutoff).length;
  const upvotes = Array.from(store.commentUpvotes.entries()).filter(([key, createdAt]) => {
    const comment = store.comments.get(key.split(":")[0]!);
    return Boolean(comment && comment.reportId === reportId && comment.status === "visible" && createdAt >= cutoff);
  }).length;
  return reactions + comments + upvotes;
}
