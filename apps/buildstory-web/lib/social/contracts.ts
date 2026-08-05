export const REACTION_KINDS = ["fire", "mindblown", "relatable", "shipped"] as const;
export type ReactionKind = (typeof REACTION_KINDS)[number];

export function isReactionKind(value: unknown): value is ReactionKind {
  return typeof value === "string" && (REACTION_KINDS as readonly string[]).includes(value);
}

export type PublicProfile = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  followerCount: number;
  followingCount: number;
  storyCount: number;
};

export type FollowState = {
  followerCount: number;
  followingCount: number;
  isFollowedByViewer: boolean;
};

export type ReactionSummary = {
  counts: Record<ReactionKind, number>;
  total: number;
  viewerReaction: ReactionKind | null;
};

export type CommentAuthor = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
};

export type CommentStatus = "visible" | "deleted" | "hidden";

export type CommentRecord = {
  id: string;
  reportId: string;
  parentCommentId: string | null;
  author: CommentAuthor;
  body: string;
  status: CommentStatus;
  createdAt: string;
  updatedAt: string;
};

export type NotificationKind = "follow" | "reaction" | "comment" | "comment_reply";

export type NotificationRecord = {
  id: string;
  kind: NotificationKind;
  actor: CommentAuthor;
  reportId: string | null;
  reportSlug: string | null;
  commentId: string | null;
  readAt: string | null;
  createdAt: string;
};

export type FeedEntry = {
  reportId: string;
  slug: string;
  tagline: string;
  publishedAt: string;
  author: CommentAuthor;
  reactionTotal: number;
  commentCount: number;
};

export const CONTENT_REPORT_TARGET_TYPES = ["report", "comment", "user"] as const;
export type ContentReportTargetType = (typeof CONTENT_REPORT_TARGET_TYPES)[number];

export const CONTENT_REPORT_REASON_CODES = [
  "spam",
  "harassment",
  "impersonation",
  "malicious_content",
  "other",
] as const;
export type ContentReportReasonCode = (typeof CONTENT_REPORT_REASON_CODES)[number];

export type ContentReportStatus = "open" | "actioned" | "dismissed";

export type ContentReportRecord = {
  id: string;
  reporterUserId: string;
  targetType: ContentReportTargetType;
  targetId: string;
  reasonCode: ContentReportReasonCode;
  note: string | null;
  status: ContentReportStatus;
  createdAt: string;
  resolvedAt: string | null;
};

export class SocialError extends Error {
  readonly isBuildstorySocialError = true;

  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: string[],
  ) {
    super(message);
  }
}
