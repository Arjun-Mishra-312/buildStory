import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const uploadSessions = sqliteTable(
  "buildstory_upload_sessions",
  {
    id: text("id").primaryKey(),
    creatorId: text("creator_id").notNull(),
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
    projectId: text("project_id").notNull(),
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
