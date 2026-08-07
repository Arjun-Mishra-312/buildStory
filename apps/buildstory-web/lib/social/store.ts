import type { CommentViewerState, ContentReportReasonCode, ContentReportStatus, ContentReportTargetType, ReactionKind } from "./contracts";

function shouldUseDurableStore() {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.BUILDSTORY_STORE === "d1"
  );
}

async function backend() {
  if (shouldUseDurableStore()) return import("./d1-store");
  return import("./mock-store");
}

export async function getProfile(userId: string) {
  return (await backend()).getProfile(userId);
}

export async function getProfileByHandle(handle: string) {
  return (await backend()).getProfileByHandle(handle);
}

export async function searchProfiles(query: string, limit?: number) {
  return (await backend()).searchProfiles(query, limit);
}

export async function followUser(followerUserId: string, followeeUserId: string) {
  return (await backend()).followUser(followerUserId, followeeUserId);
}

export async function unfollowUser(followerUserId: string, followeeUserId: string) {
  return (await backend()).unfollowUser(followerUserId, followeeUserId);
}

export async function getFollowState(targetUserId: string, viewerUserId: string | null) {
  return (await backend()).getFollowState(targetUserId, viewerUserId);
}

export async function listFollowers(userId: string, limit?: number) {
  return (await backend()).listFollowers(userId, limit);
}

export async function listFollowing(userId: string, limit?: number) {
  return (await backend()).listFollowing(userId, limit);
}

export async function getReactionSummary(reportId: string, viewerUserId: string | null) {
  return (await backend()).getReactionSummary(reportId, viewerUserId);
}

export async function setReaction(reportId: string, userId: string, kind: ReactionKind) {
  return (await backend()).setReaction(reportId, userId, kind);
}

export async function listComments(reportId: string, limit?: number, cursor?: string) {
  return (await backend()).listComments(reportId, limit, cursor);
}

export async function createComment(
  reportId: string,
  authorUserId: string,
  body: string,
  parentCommentId: string | null,
) {
  return (await backend()).createComment(reportId, authorUserId, body, parentCommentId);
}

export async function deleteComment(commentId: string, requestingUserId: string, requestingRole: string) {
  return (await backend()).deleteComment(commentId, requestingUserId, requestingRole);
}

export async function getCommentViewerState(reportId: string, viewerUserId: string | null): Promise<CommentViewerState> {
  return (await backend()).getCommentViewerState(reportId, viewerUserId);
}

export async function setCommentUpvote(commentId: string, userId: string, enabled: boolean) {
  return (await backend()).setCommentUpvote(commentId, userId, enabled);
}

export async function listNotifications(userId: string, limit?: number, cursor?: string) {
  return (await backend()).listNotifications(userId, limit, cursor);
}

export async function getUnreadNotificationCount(userId: string) {
  return (await backend()).getUnreadNotificationCount(userId);
}

export async function markNotificationsRead(userId: string, notificationIds?: string[]) {
  return (await backend()).markNotificationsRead(userId, notificationIds);
}

export async function getActivityFeed(viewerUserId: string, limit?: number, cursor?: string) {
  return (await backend()).getActivityFeed(viewerUserId, limit, cursor);
}

export async function fileContentReport(
  reporterUserId: string,
  targetType: ContentReportTargetType,
  targetId: string,
  reasonCode: ContentReportReasonCode,
  note: string | null,
) {
  return (await backend()).fileContentReport(reporterUserId, targetType, targetId, reasonCode, note);
}

export async function listContentReports(status?: ContentReportStatus, limit?: number, cursor?: string) {
  return (await backend()).listContentReports(status, limit, cursor);
}

export async function resolveContentReport(reportId: string, status: ContentReportStatus, actorUserId?: string) {
  return (await backend()).resolveContentReport(reportId, status, actorUserId);
}
