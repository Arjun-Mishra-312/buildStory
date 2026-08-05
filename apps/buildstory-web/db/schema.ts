import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * Real creator identity. Distinct from the `creator_id` string
 * ("google:<sub>") already used as the ownership key throughout
 * uploadSessions/reports - `ownerUserId` below is added alongside it
 * (dual-write), not a replacement. See docs/production-runbook.md's
 * "Jobs and failure recovery" section for why this repo prefers additive,
 * reversible migrations over in-place cutovers.
 */
export const users = sqliteTable(
  "buildstory_users",
  {
    id: text("id").primaryKey(),
    /** "google:<sub>" today; the same value already stored as creator_id elsewhere. */
    authSubject: text("auth_subject").notNull(),
    email: text("email").notNull(),
    emailVerifiedAt: text("email_verified_at"),
    handle: text("handle").notNull(),
    handleLower: text("handle_lower").notNull(),
    displayName: text("display_name").notNull(),
    avatarUrl: text("avatar_url"),
    bio: text("bio"),
    role: text("role").notNull().default("member"),
    status: text("status").notNull().default("active"),
    followerCount: integer("follower_count").notNull().default(0),
    followingCount: integer("following_count").notNull().default(0),
    projectCount: integer("project_count").notNull().default(0),
    storyCount: integer("story_count").notNull().default(0),
    /** JWT sessions can't be revoked directly; a suspension checks this against the token's issued-at. */
    sessionsValidAfter: text("sessions_valid_after"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    uniqueIndex("idx_buildstory_users_auth_subject").on(table.authSubject),
    uniqueIndex("idx_buildstory_users_handle_lower").on(table.handleLower),
  ],
);

/**
 * A repository, grouped by its content-derived fingerprint. Distinct from
 * a report: a project accretes many reports (one per scan) over time.
 * `latest*` fields reflect the most recent scan's own totals (each
 * ProjectSnapshot already aggregates its whole selected time window) -
 * they are intentionally not summed across scans, which would double-count
 * overlapping --since/--until windows.
 */
export const projects = sqliteTable(
  "buildstory_projects",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    repositoryFingerprint: text("repository_fingerprint").notNull(),
    fingerprintBasis: text("fingerprint_basis").notNull(),
    firstScanAt: text("first_scan_at").notNull(),
    lastScanAt: text("last_scan_at").notNull(),
    storyCount: integer("story_count").notNull().default(0),
    latestSessionCount: integer("latest_session_count").notNull().default(0),
    latestCommitCount: integer("latest_commit_count").notNull().default(0),
    latestActiveDays: integer("latest_active_days").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    uniqueIndex("idx_buildstory_projects_owner_fingerprint").on(
      table.ownerUserId,
      table.repositoryFingerprint,
    ),
    uniqueIndex("idx_buildstory_projects_owner_slug").on(table.ownerUserId, table.slug),
    index("idx_buildstory_projects_owner_updated").on(table.ownerUserId, table.updatedAt),
  ],
);

export const uploadSessions = sqliteTable(
  "buildstory_upload_sessions",
  {
    id: text("id").primaryKey(),
    creatorId: text("creator_id").notNull(),
    ownerUserId: text("owner_user_id").references(() => users.id, { onDelete: "set null" }),
    projectLabel: text("project_label").notNull(),
    status: text("status").notNull(),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    scannerAuthorizedAt: text("scanner_authorized_at"),
    snapshotReceivedAt: text("snapshot_received_at"),
    reportId: text("report_id"),
    statusDetail: text("status_detail").notNull(),
    deviceCodeHash: text("device_code_hash").notNull(),
    deviceCodeClaimedAt: text("device_code_claimed_at"),
    connectionId: text("connection_id"),
    uploadTokenHash: text("upload_token_hash"),
    uploadTokenExpiresAt: text("upload_token_expires_at"),
    uploadTokenConsumedAt: text("upload_token_consumed_at"),
    uploadReceiptId: text("upload_receipt_id"),
    snapshotDigest: text("snapshot_digest"),
    snapshotJson: text("snapshot_json"),
    queuedAt: text("queued_at"),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_buildstory_sessions_creator_created").on(
      table.creatorId,
      table.createdAt,
    ),
    index("idx_buildstory_sessions_status").on(table.status),
  ],
);

export const reports = sqliteTable(
  "buildstory_reports",
  {
    id: text("id").primaryKey(),
    creatorId: text("creator_id").notNull(),
    ownerUserId: text("owner_user_id").references(() => users.id, { onDelete: "set null" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    uploadSessionId: text("upload_session_id")
      .notNull()
      .references(() => uploadSessions.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    createdAt: text("created_at").notNull(),
    readyAt: text("ready_at"),
    sourceSnapshotJson: text("source_snapshot_json").notNull(),
    snapshotJson: text("snapshot_json").notNull(),
    selectedPublicFieldsJson: text("selected_public_fields_json").notNull(),
    editorialTagline: text("editorial_tagline").notNull(),
    editorialDescription: text("editorial_description").notNull(),
    editorialReflection: text("editorial_reflection").notNull(),
    publicationStatus: text("publication_status").notNull(),
    publicationSlug: text("publication_slug").notNull(),
    publishedAt: text("published_at"),
    publicUrl: text("public_url"),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_buildstory_reports_creator_created").on(
      table.creatorId,
      table.createdAt,
    ),
    index("idx_buildstory_reports_project").on(table.creatorId, table.projectId),
    uniqueIndex("idx_buildstory_reports_published_slug")
      .on(table.publicationSlug)
      .where(sql`${table.publicationStatus} = 'published'`),
  ],
);

export const reportJobs = sqliteTable(
  "buildstory_report_jobs",
  {
    id: text("id").primaryKey(),
    reportId: text("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    attempts: integer("attempts").notNull().default(0),
    availableAt: text("available_at").notNull(),
    leaseUntil: text("lease_until"),
    lastErrorCode: text("last_error_code"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_buildstory_jobs_report").on(table.reportId),
    index("idx_buildstory_jobs_dispatch").on(table.status, table.availableAt),
  ],
);

/**
 * One AI-generated narrative per report. Only ever created for a report
 * whose source snapshot carried an opt-in narrativeEvidence bundle; a
 * report with no narrative row simply has no AI-written story, which the
 * UI must treat as a normal, expected state, not an error.
 */
export const narratives = sqliteTable(
  "buildstory_narratives",
  {
    id: text("id").primaryKey(),
    reportId: text("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mode: text("mode").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    status: text("status").notNull(),
    sectionsJson: text("sections_json"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costMicroUsd: integer("cost_micro_usd").notNull().default(0),
    lastErrorCode: text("last_error_code"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_buildstory_narratives_report").on(table.reportId),
    index("idx_buildstory_narratives_owner_created").on(table.ownerUserId, table.createdAt),
  ],
);

/** Same lease-based dispatch shape as buildstory_report_jobs; no Queue dependency. */
export const narrativeJobs = sqliteTable(
  "buildstory_narrative_jobs",
  {
    id: text("id").primaryKey(),
    narrativeId: text("narrative_id")
      .notNull()
      .references(() => narratives.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    attempts: integer("attempts").notNull().default(0),
    availableAt: text("available_at").notNull(),
    leaseUntil: text("lease_until"),
    lastErrorCode: text("last_error_code"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_buildstory_narrative_jobs_narrative").on(table.narrativeId),
    index("idx_buildstory_narrative_jobs_dispatch").on(table.status, table.availableAt),
  ],
);

/**
 * Rolling per-user, per-period cloud-LLM spend cap. period_key is a plain
 * "YYYY-MM" string (UTC) so a cap naturally resets month to month without a
 * separate cron job to zero it out.
 */
export const llmBudgets = sqliteTable(
  "buildstory_llm_budgets",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    periodKey: text("period_key").notNull(),
    spentMicroUsd: integer("spent_micro_usd").notNull().default(0),
    capMicroUsd: integer("cap_micro_usd").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_buildstory_llm_budgets_user_period").on(table.userId, table.periodKey),
  ],
);

/** No self-follow, no duplicate follow - both enforced in the store layer, not here. */
export const follows = sqliteTable(
  "buildstory_follows",
  {
    id: text("id").primaryKey(),
    followerUserId: text("follower_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    followeeUserId: text("followee_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_buildstory_follows_pair").on(table.followerUserId, table.followeeUserId),
    index("idx_buildstory_follows_followee_created").on(table.followeeUserId, table.createdAt),
    index("idx_buildstory_follows_follower_created").on(table.followerUserId, table.createdAt),
  ],
);

/** One reaction per (report, user) - unique-constrained so double-reacting is impossible at the DB level. */
export const reactions = sqliteTable(
  "buildstory_reactions",
  {
    id: text("id").primaryKey(),
    reportId: text("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_buildstory_reactions_report_user").on(table.reportId, table.userId),
    index("idx_buildstory_reactions_report_kind").on(table.reportId, table.kind),
  ],
);

/**
 * One reply level: a comment's parentCommentId (if any) must point at a
 * top-level comment on the same report - enforced in the store layer, not
 * a DB constraint. Deletion is a status flip (soft delete), not a row
 * delete, so a reply thread's structure survives a parent's removal.
 */
export const comments = sqliteTable(
  "buildstory_comments",
  {
    id: text("id").primaryKey(),
    reportId: text("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    authorUserId: text("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    parentCommentId: text("parent_comment_id"),
    body: text("body").notNull(),
    status: text("status").notNull().default("visible"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_buildstory_comments_report_created").on(table.reportId, table.createdAt),
    index("idx_buildstory_comments_parent").on(table.parentCommentId),
  ],
);

/**
 * Denormalized and deduplicated: repeated activity of the same kind by the
 * same actor on the same report bumps one row (upsert) instead of piling
 * up duplicates. reportId is null only for pure-follow notifications.
 */
export const notifications = sqliteTable(
  "buildstory_notifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reportId: text("report_id").references(() => reports.id, { onDelete: "cascade" }),
    commentId: text("comment_id"),
    readAt: text("read_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_buildstory_notifications_user_created").on(table.userId, table.createdAt),
    uniqueIndex("idx_buildstory_notifications_dedup").on(
      table.userId,
      table.kind,
      table.actorUserId,
      table.reportId,
    ),
  ],
);

/**
 * Fixed-window counter, one row per (scope, identity, window). A single
 * upsert-and-return-count statement keeps the check race-safe without a
 * separate read-then-write step. Stale windows are opportunistically
 * deleted by every check rather than needing a separate cron sweep.
 */
export const rateLimits = sqliteTable(
  "buildstory_rate_limits",
  {
    id: text("id").primaryKey(),
    windowStart: text("window_start").notNull(),
    count: integer("count").notNull().default(0),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("idx_buildstory_rate_limits_window").on(table.windowStart)],
);

/**
 * User-filed reports about a comment, a story (report), or a user profile.
 * Distinct from buildstory_reports (build reports) despite the name overlap
 * in normal English usage - hence "content_reports".
 */
export const contentReports = sqliteTable(
  "buildstory_content_reports",
  {
    id: text("id").primaryKey(),
    reporterUserId: text("reporter_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    reasonCode: text("reason_code").notNull(),
    note: text("note"),
    status: text("status").notNull().default("open"),
    createdAt: text("created_at").notNull(),
    resolvedAt: text("resolved_at"),
  },
  (table) => [
    index("idx_buildstory_content_reports_status_created").on(table.status, table.createdAt),
    index("idx_buildstory_content_reports_target").on(table.targetType, table.targetId),
  ],
);

/**
 * Cron/manually computed, never live-aggregated on a page read (beyond a
 * bounded staleness fallback when nothing has ever run). One row per
 * (period, user). "score" is verified-provenance commits, capped per
 * project at activeDays * ANTI_GAMING_MAX_COMMITS_PER_DAY so a single
 * overnight run can't dominate a ranking meant to reward sustained
 * building - see lib/leaderboard/compute.ts.
 */
export const leaderboardEntries = sqliteTable(
  "buildstory_leaderboard_entries",
  {
    id: text("id").primaryKey(),
    period: text("period").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    rank: integer("rank").notNull(),
    score: integer("score").notNull(),
    activeDays: integer("active_days").notNull(),
    storyCount: integer("story_count").notNull(),
    computedAt: text("computed_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_buildstory_leaderboard_period_user").on(table.period, table.userId),
    index("idx_buildstory_leaderboard_period_rank").on(table.period, table.rank),
  ],
);

/** Tracks the last successful recompute per period so reads know whether a bounded lazy refresh is due. */
export const leaderboardRuns = sqliteTable("buildstory_leaderboard_runs", {
  period: text("period").primaryKey(),
  computedAt: text("computed_at").notNull(),
});
