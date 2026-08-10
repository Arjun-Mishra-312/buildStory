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
    builderRole: text("builder_role"),
    onboardingCompletedAt: text("onboarding_completed_at"),
    /** Null until the user spends their one allowed handle change; set on that change. */
    handleChangedAt: text("handle_changed_at"),
    role: text("role").notNull().default("member"),
    /**
     * The account's real, durable plan. Separate from whether Pro benefits
     * are CURRENTLY granted - see effectivePlan() in lib/narrative/entitlement.ts,
     * which layers the BUILDSTORY_LAUNCH_PRO_FOR_ALL promotion on top of this
     * column without ever writing to it, so ending the promotion is a var
     * flip, not a data migration.
     */
    plan: text("plan").notNull().default("free"),
    status: text("status").notNull().default("active"),
    followerCount: integer("follower_count").notNull().default(0),
    followingCount: integer("following_count").notNull().default(0),
    projectCount: integer("project_count").notNull().default(0),
    storyCount: integer("story_count").notNull().default(0),
    /** JWT sessions can't be revoked directly; a suspension checks this against the token's issued-at. */
    sessionsValidAfter: text("sessions_valid_after"),
    /** Null until the user has ever started a checkout. One Stripe customer per account, reused across upgrades/downgrades. */
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    /** Mirrors the Stripe subscription status string verbatim (active, trialing, past_due, canceled, ...). Null until a subscription exists. */
    subscriptionStatus: text("subscription_status"),
    billingInterval: text("billing_interval"),
    currentPeriodEnd: text("current_period_end"),
    cancelAtPeriodEnd: integer("cancel_at_period_end").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    uniqueIndex("idx_buildstory_users_auth_subject").on(table.authSubject),
    uniqueIndex("idx_buildstory_users_handle_lower").on(table.handleLower),
    uniqueIndex("idx_buildstory_users_stripe_customer_id").on(table.stripeCustomerId),
  ],
);

/**
 * Complete registry of every (provider, subject) a user can sign in with,
 * including their original one (which is also, redundantly but harmlessly,
 * captured by users.authSubject - that field is never migrated away from,
 * since it's the existing join key for every upload session and report).
 * A second provider is only ever auto-linked into an existing row here when
 * both sides assert a verified email for the same address - see auth.ts's
 * resolveCreatorId. Anything else requires explicit linking from Settings.
 */
export const userIdentities = sqliteTable(
  "buildstory_user_identities",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    subject: text("subject").notNull(),
    /** The verified email asserted by this provider at link time - audit trail only, not re-checked on every sign-in. */
    email: text("email").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_buildstory_user_identities_provider_subject").on(table.provider, table.subject),
    index("idx_buildstory_user_identities_user").on(table.userId),
  ],
);

/** Versioned, account-synced state for the first-visit Studio guides. */
export const userGuidance = sqliteTable(
  "buildstory_user_guidance",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    guideKey: text("guide_key").notNull(),
    guideVersion: integer("guide_version").notNull(),
    state: text("state").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_buildstory_user_guidance_user_key_version").on(
      table.userId,
      table.guideKey,
      table.guideVersion,
    ),
    index("idx_buildstory_user_guidance_user").on(table.userId),
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
    /**
     * Set only after the signed-in owner's linked GitHub account is confirmed
     * (by numeric GitHub user id, via the GitHub API) to own the exact public
     * repository this project's repositoryFingerprint was computed from - see
     * lib/repository-fingerprint.ts. Null means unverified, not "false".
     */
    verifiedRepoAt: text("verified_repo_at"),
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
    /**
     * Set when a creator explicitly starts this scan from an existing project's
     * "Scan for updates" flow, rather than the default "Create a story" flow. Purely
     * a validation hint at ingest time (see acceptSnapshot's fingerprint check in
     * lib/ingestion/*-store.ts) - it never changes which project a snapshot lands in,
     * since that is still resolved by repositoryFingerprint alone (ensureProject).
     */
    targetProjectId: text("target_project_id").references(() => projects.id, { onDelete: "set null" }),
    narrativeModel: text("narrative_model"),
    narrativeMode: text("narrative_mode").notNull().default("cloud"),
    narrativeProvider: text("narrative_provider"),
    analysisTier: text("analysis_tier").notNull().default("standard"),
    status: text("status").notNull(),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    scannerAuthorizedAt: text("scanner_authorized_at"),
    snapshotReceivedAt: text("snapshot_received_at"),
    reportId: text("report_id"),
    statusDetail: text("status_detail").notNull(),
    deviceCodeHash: text("device_code_hash").notNull(),
    deviceCodeAttempts: integer("device_code_attempts").notNull().default(0),
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
    category: text("category"),
    storyBackgroundId: text("story_background_id").notNull().default("repository-topography"),
    publicationStatus: text("publication_status").notNull(),
    publicationSlug: text("publication_slug").notNull(),
    publicationPath: text("publication_path"),
    publishedAt: text("published_at"),
    publicUrl: text("public_url"),
    /** Creator-supplied links to the actual artifact, not scanner-derived. Gated by the artifactLinks PublicFieldKey like every other public field. */
    artifactProjectUrl: text("artifact_project_url"),
    artifactRepoUrl: text("artifact_repo_url"),
    artifactVideoUrl: text("artifact_video_url"),
    /**
     * Null until this report is published for the first time; assigned once, from
     * 1 + the highest chapter_index any report of this project has ever held, and
     * never reused or reassigned after that (even across unpublish/republish). A
     * project can have several simultaneously-published reports now (one per
     * chapter) - see idx_buildstory_reports_published_path below, which is scoped
     * per report, not per project. Exactly one of a project's published reports
     * holds the canonical (extensionless) publication_path at a time: the one
     * with the highest chapter_index; older ones are rewritten to a
     * chapter-suffixed path when superseded. Existing published rows are
     * backfilled to 1 by this column's migration.
     */
    chapterIndex: integer("chapter_index"),
    /**
     * JSON-serialized ChapterDelta (lib/story/chapter-delta.ts), computed once at
     * publish time against the project's previous chapter and frozen from then on -
     * same rationale as buildstory_public_story_index.story_json: deterministic,
     * computed once, never re-derived on the public read path. Null for a project's
     * first chapter (chapterIndex 1), which has nothing to compare against.
     */
    chapterDeltaJson: text("chapter_delta_json"),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_buildstory_reports_creator_created").on(
      table.creatorId,
      table.createdAt,
    ),
    index("idx_buildstory_reports_project").on(table.creatorId, table.projectId),
    uniqueIndex("idx_buildstory_reports_published_path")
      .on(table.publicationPath)
      .where(sql`${table.publicationStatus} = 'published'`),
    index("idx_buildstory_reports_project_chapter").on(table.projectId, table.chapterIndex),
    index("idx_buildstory_reports_legacy_slug").on(table.publicationSlug),
    index("idx_buildstory_reports_published").on(table.publishedAt),
  ],
);

/**
 * Creator-uploaded cover/screenshot images for a report's public artifact
 * section. r2Key is an unguessable, server-generated object key
 * (media/<reportId>/<uuid>.<ext>) - never derived from user input. Deleting
 * the row does not delete the R2 object; callers must do both (see
 * lib/account/*-store.ts deleteAccount and the media DELETE route).
 */
export const reportMedia = sqliteTable(
  "buildstory_report_media",
  {
    id: text("id").primaryKey(),
    reportId: text("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    r2Key: text("r2_key").notNull(),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    kind: text("kind").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_buildstory_report_media_report").on(table.reportId, table.sortOrder),
    index("idx_buildstory_report_media_owner").on(table.ownerUserId),
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
    fallbacksUsedJson: text("fallbacks_used_json"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    reasoningTokens: integer("reasoning_tokens").notNull().default(0),
    cachedTokens: integer("cached_tokens").notNull().default(0),
    costMicroUsd: integer("cost_micro_usd").notNull().default(0),
    analysisTierRequested: text("analysis_tier_requested").notNull().default("standard"),
    analysisTierDelivered: text("analysis_tier_delivered"),
    requestedProvider: text("requested_provider"),
    requestedModel: text("requested_model"),
    providerRequestIdsJson: text("provider_request_ids_json"),
    evidenceExpiresAt: text("evidence_expires_at"),
    evidenceScrubbedAt: text("evidence_scrubbed_at"),
    evidenceReceiptJson: text("evidence_receipt_json"),
    reservationMicroUsd: integer("reservation_micro_usd").notNull().default(0),
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
    reservedMicroUsd: integer("reserved_micro_usd").notNull().default(0),
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

export const commentUpvotes = sqliteTable(
  "buildstory_comment_upvotes",
  {
    id: text("id").primaryKey(),
    commentId: text("comment_id")
      .notNull()
      .references(() => comments.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_buildstory_comment_upvotes_comment_user").on(table.commentId, table.userId),
    index("idx_buildstory_comment_upvotes_comment_created").on(table.commentId, table.createdAt),
  ],
);

/** Public-only discovery index. Private snapshot values never enter this table. */
export const publicStoryIndex = sqliteTable(
  "buildstory_public_story_index",
  {
    reportId: text("report_id")
      .primaryKey()
      .references(() => reports.id, { onDelete: "cascade" }),
    storyJson: text("story_json").notNull().default("{}"),
    category: text("category").notNull(),
    searchText: text("search_text").notNull(),
    hasLiveDemo: integer("has_live_demo").notNull().default(0),
    coverUrl: text("cover_url"),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_buildstory_public_story_index_category").on(table.category),
    index("idx_buildstory_public_story_index_demo").on(table.hasLiveDemo),
  ],
);

export const publicStoryFacets = sqliteTable(
  "buildstory_public_story_facets",
  {
    id: text("id").primaryKey(),
    reportId: text("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    facetKey: text("facet_key").notNull(),
    label: text("label").notNull(),
    weight: integer("weight").notNull().default(1),
  },
  (table) => [
    uniqueIndex("idx_buildstory_public_story_facets_report_kind_key").on(table.reportId, table.kind, table.facetKey),
    index("idx_buildstory_public_story_facets_kind_key").on(table.kind, table.facetKey),
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

export const contentReportAudit = sqliteTable(
  "buildstory_content_report_audit",
  {
    id: text("id").primaryKey(),
    reportId: text("report_id").notNull().references(() => contentReports.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_buildstory_content_report_audit_report").on(table.reportId, table.createdAt)],
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
