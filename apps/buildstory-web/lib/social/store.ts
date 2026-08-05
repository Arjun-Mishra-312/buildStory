import type { ContentReportReasonCode, ContentReportStatus, ContentReportTargetType, ReactionKind } from "./contracts";

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

export async function listComments(reportId: string) {
  return (await backend()).listComments(reportId);
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

export async function listNotifications(userId: string, limit?: number) {
  return (await backend()).listNotifications(userId, limit);
}

export async function getUnreadNotificationCount(userId: string) {
  return (await backend()).getUnreadNotificationCount(userId);
}

export async function markNotificationsRead(userId: string, notificationIds?: string[]) {
  return (await backend()).markNotificationsRead(userId, notificationIds);
}

export async function getActivityFeed(viewerUserId: string, limit?: number) {
  return (await backend()).getActivityFeed(viewerUserId, limit);
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

export async function listContentReports(status?: ContentReportStatus, limit?: number) {
  return (await backend()).listContentReports(status, limit);
}

export async function resolveContentReport(reportId: string, status: ContentReportStatus) {
  return (await backend()).resolveContentReport(reportId, status);
}
