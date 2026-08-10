export const REACTION_KINDS = ["fire", "mindblown", "relatable", "shipped"] as const;
import type { BuilderRole } from "@/lib/identity/builder-roles";
import type { FeedTileStats, FeedTileVisual } from "./feed-projection";
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
  builderRole: BuilderRole | null;
  followerCount: number;
  followingCount: number;
  storyCount: number;
  /** Already resolved through effectivePlan() at read time - reflects the launch-wide promotion, not just the durable column. */
  plan: "free" | "pro";
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
  /** Which chapter of the project this comment was posted on - a project can roll up comments across several published chapters. */
  chapterIndex: number;
  parentCommentId: string | null;
  author: CommentAuthor;
  body: string;
  status: CommentStatus;
  createdAt: string;
  updatedAt: string;
  upvoteCount: number;
};

export type NotificationKind = "follow" | "reaction" | "comment" | "comment_reply" | "comment_upvote" | "story_update";

export type CommentViewerState = {
  upvotedCommentIds: string[];
  removableCommentIds: string[];
};

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
  /** 1-based chapter number this feed entry represents; the link target, not necessarily the project's current latest. */
  chapterIndex: number;
  tagline: string;
  publishedAt: string;
  author: CommentAuthor;
  reactionTotal: number;
  commentCount: number;
  /** Per-kind breakdown backing the feed tile's reaction icon row. */
  reactionCounts: Record<ReactionKind, number>;
  /** Null when the report predates (or fell out of sync with) the public story index - the tile degrades to a bare card rather than guessing. */
  visual: FeedTileVisual | null;
  stats: FeedTileStats | null;
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
