import { getD1 } from "@/db";
import { publicBuildStoryFromSnapshot } from "@/lib/build-story";
import type { ProjectSnapshot } from "@/lib/project-snapshot";
import { sanitizePublicText } from "@/lib/publication/sanitization";
import type {
  DeviceAuthorization,
  GeneratedReport,
  LocalReportSummary,
  PublicationStatus,
  PublicFieldKey,
  ReportStatus,
  ScannerClaimResponse,
  SnapshotUploadReceipt,
  UploadSessionStatus,
  UploadSessionView,
} from "./contracts";
import { reportSnapshotFromScanner } from "./report-adapter";
import type { ScannerProjectSnapshot } from "./scanner-project-snapshot";
import { MAX_SNAPSHOT_BYTES, validateProjectSnapshot } from "./validation";

type SessionRow = {
  id: string;
  creator_id: string;
  project_label: string;
  status: string;
  created_at: string;
  expires_at: string;
  scanner_authorized_at: string | null;
  snapshot_received_at: string | null;
  report_id: string | null;
  status_detail: string;
  device_code_hash: string;
  device_code_claimed_at: string | null;
  connection_id: string | null;
  upload_token_hash: string | null;
  upload_token_expires_at: string | null;
  upload_token_consumed_at: string | null;
  upload_receipt_id: string | null;
  snapshot_digest: string | null;
  snapshot_json: string | null;
  queued_at: string | null;
};

type ReportRow = {
  id: string;
  creator_id: string;
  project_id: string;
  upload_session_id: string;
  status: string;
  created_at: string;
  ready_at: string | null;
  source_snapshot_json: string;
  snapshot_json: string;
  selected_public_fields_json: string;
  editorial_tagline: string;
  editorial_description: string;
  editorial_reflection: string;
  publication_status: string;
  publication_slug: string;
  published_at: string | null;
  public_url: string | null;
};

const PUBLIC_FIELDS: PublicFieldKey[] = [
  "tagline",
  "description",
  "timeWindow",
  "sessionSummary",
  "milestones",
  "modelMix",
  "toolUsage",
  "gitAggregates",
  "redactionSummary",
];

const DEFAULT_PUBLIC_FIELDS: PublicFieldKey[] = [
  "tagline",
  "description",
  "timeWindow",
  "sessionSummary",
  "milestones",
  "modelMix",
  "gitAggregates",
  "redactionSummary",
];

export class D1IngestionError extends Error {
  readonly isBuildstoryIngestionError = true;

  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: string[],
  ) {
    super(message);
  }
}

async function database() {
  try {
    return await getD1();
  } catch {
    throw new D1IngestionError(
      "production_dependency_unavailable",
      "Buildstory's durable database is unavailable. An operator must configure D1 and apply migrations.",
      503,
    );
  }
}

function publicOrigin() {
  const raw = process.env.BUILDSTORY_PUBLIC_ORIGIN;
  if (!raw) {
    throw new D1IngestionError(
      "production_configuration_invalid",
      "BUILDSTORY_PUBLIC_ORIGIN is required for publication.",
      503,
    );
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new D1IngestionError(
      "production_configuration_invalid",
      "BUILDSTORY_PUBLIC_ORIGIN must be an absolute URL.",
      503,
    );
  }
  if (url.protocol !== "https:") {
    throw new D1IngestionError(
      "production_configuration_invalid",
      "BUILDSTORY_PUBLIC_ORIGIN must use HTTPS in production.",
      503,
    );
  }
  return url.origin;
}

function makeId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

function makeDeviceCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const raw = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

function makeUploadToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const encoded = btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  return `bsu_${encoded}`;
}

async function hashToken(token: string) {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function changes(result: D1Result<unknown> | undefined) {
  return Number(result?.meta?.changes ?? 0);
}

function cleanSession(row: SessionRow): UploadSessionView {
  return {
    id: row.id,
    creatorId: row.creator_id,
    projectLabel: row.project_label,
    status: row.status as UploadSessionStatus,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    scannerAuthorizedAt: row.scanner_authorized_at,
    snapshotReceivedAt: row.snapshot_received_at,
    reportId: row.report_id,
    statusDetail: row.status_detail,
  };
}

function parseJson<T>(value: string, kind: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new D1IngestionError(
      "durable_record_invalid",
      `A stored ${kind} record is invalid. An operator must inspect the durable store.`,
      500,
    );
  }
}

function reportFromRow(row: ReportRow): GeneratedReport {
  const fields = parseJson<unknown>(row.selected_public_fields_json, "public field");
  if (
    !Array.isArray(fields) ||
    fields.some(
      (field) => typeof field !== "string" || !PUBLIC_FIELDS.includes(field as PublicFieldKey),
    )
  ) {
    throw new D1IngestionError(
      "durable_record_invalid",
      "A stored public-field selection is invalid. An operator must inspect the durable store.",
      500,
    );
  }
  return {
    id: row.id,
    creatorId: row.creator_id,
    projectId: row.project_id,
    uploadSessionId: row.upload_session_id,
    status: row.status as ReportStatus,
    createdAt: row.created_at,
    readyAt: row.ready_at,
    sourceSnapshot: parseJson<ScannerProjectSnapshot>(
      row.source_snapshot_json,
      "source snapshot",
    ),
    snapshot: parseJson<ProjectSnapshot>(row.snapshot_json, "report snapshot"),
    selectedPublicFields: fields as PublicFieldKey[],
    editorial: {
      tagline: row.editorial_tagline,
      description: row.editorial_description,
      reflection: row.editorial_reflection,
    },
    publication: {
      status: row.publication_status as PublicationStatus,
      slug: row.publication_slug,
      publishedAt: row.published_at,
      publicUrl: row.public_url,
    },
  };
}

async function sessionById(sessionId: string) {
  return (await database())
    .prepare("SELECT * FROM buildstory_upload_sessions WHERE id = ?")
    .bind(sessionId)
    .first<SessionRow>();
}

async function reportById(reportId: string) {
  return (await database())
    .prepare("SELECT * FROM buildstory_reports WHERE id = ?")
    .bind(reportId)
    .first<ReportRow>();
}

async function processReportJob(reportId: string) {
  const db = await database();
  const now = new Date();
  const nowIso = now.toISOString();
  const leaseUntil = new Date(now.getTime() + 30_000).toISOString();
  const claimed = await db
    .prepare(
      `UPDATE buildstory_report_jobs
       SET status = 'processing', attempts = attempts + 1, lease_until = ?, updated_at = ?
       WHERE report_id = ?
         AND available_at <= ?
         AND (status = 'pending' OR (status = 'processing' AND lease_until <= ?))`,
    )
    .bind(leaseUntil, nowIso, reportId, nowIso, nowIso)
    .run();
  if (changes(claimed) !== 1) return;

  try {
    await db.batch([
      db
        .prepare(
          "UPDATE buildstory_reports SET status = 'ready', ready_at = ?, updated_at = ? WHERE id = ? AND status != 'failed'",
        )
        .bind(nowIso, nowIso, reportId),
      db
        .prepare(
          `UPDATE buildstory_upload_sessions
           SET status = 'report_ready', status_detail = 'Private report ready for review.', updated_at = ?
           WHERE report_id = ? AND status != 'failed'`,
        )
        .bind(nowIso, reportId),
      db
        .prepare(
          "UPDATE buildstory_report_jobs SET status = 'completed', lease_until = NULL, last_error_code = NULL, updated_at = ? WHERE report_id = ?",
        )
        .bind(nowIso, reportId),
    ]);
  } catch (error) {
    const job = await db
      .prepare("SELECT attempts FROM buildstory_report_jobs WHERE report_id = ?")
      .bind(reportId)
      .first<{ attempts: number }>();
    const terminal = Number(job?.attempts ?? 1) >= 3;
    const retryAt = new Date(Date.now() + 30_000).toISOString();
    if (terminal) {
      await db.batch([
        db
          .prepare(
            "UPDATE buildstory_report_jobs SET status = 'failed', lease_until = NULL, last_error_code = 'report_generation_failed', updated_at = ? WHERE report_id = ?",
          )
          .bind(nowIso, reportId),
        db
          .prepare(
            "UPDATE buildstory_reports SET status = 'failed', updated_at = ? WHERE id = ?",
          )
          .bind(nowIso, reportId),
        db
          .prepare(
            `UPDATE buildstory_upload_sessions
             SET status = 'failed', status_detail = 'Report generation failed after bounded retries.', updated_at = ?
             WHERE report_id = ?`,
          )
          .bind(nowIso, reportId),
      ]);
    } else {
      await db
        .prepare(
          "UPDATE buildstory_report_jobs SET status = 'pending', available_at = ?, lease_until = NULL, last_error_code = 'report_generation_retry', updated_at = ? WHERE report_id = ?",
        )
        .bind(retryAt, nowIso, reportId)
        .run();
    }
    throw error;
  }
}

async function processCreatorJobs(creatorId: string) {
  const rows = await (await database())
    .prepare(
      `SELECT j.report_id
       FROM buildstory_report_jobs j
       JOIN buildstory_reports r ON r.id = j.report_id
       WHERE r.creator_id = ? AND j.status IN ('pending', 'processing')
       ORDER BY j.created_at ASC LIMIT 25`,
    )
    .bind(creatorId)
    .all<{ report_id: string }>();
  for (const row of rows.results) await processReportJob(row.report_id);
}

export async function listUploadSessions(
  creatorId: string,
): Promise<UploadSessionView[]> {
  await processCreatorJobs(creatorId);
  const rows = await (await database())
    .prepare(
      "SELECT * FROM buildstory_upload_sessions WHERE creator_id = ? ORDER BY created_at DESC LIMIT 100",
    )
    .bind(creatorId)
    .all<SessionRow>();
  return rows.results.map(cleanSession);
}

export async function createUploadSession(
  creatorId: string,
  projectLabel = "New local project",
  apiBaseUrl = "http://localhost:3000/",
): Promise<{
  session: UploadSessionView;
  deviceAuthorization: DeviceAuthorization;
}> {
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 15 * 60_000);
  const id = makeId("upl");
  const deviceCode = makeDeviceCode();
  const label = projectLabel.trim().slice(0, 120) || "New local project";
  const createdAtIso = createdAt.toISOString();
  const expiresAtIso = expiresAt.toISOString();
  const statusDetail = "Waiting for a scanner to claim the one-time connection code.";
  await (await database())
    .prepare(
      `INSERT INTO buildstory_upload_sessions (
        id, creator_id, project_label, status, created_at, expires_at,
        status_detail, device_code_hash, updated_at
      ) VALUES (?, ?, ?, 'awaiting_scanner', ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      creatorId,
      label,
      createdAtIso,
      expiresAtIso,
      statusDetail,
      await hashToken(deviceCode),
      createdAtIso,
    )
    .run();

  const session: UploadSessionView = {
    id,
    creatorId,
    projectLabel: label,
    status: "awaiting_scanner",
    createdAt: createdAtIso,
    expiresAt: expiresAtIso,
    scannerAuthorizedAt: null,
    snapshotReceivedAt: null,
    reportId: null,
    statusDetail,
  };
  const normalizedApiBaseUrl = `${apiBaseUrl.replace(/\/$/, "")}/`;
  return {
    session,
    deviceAuthorization: {
      sessionId: id,
      userCode: deviceCode,
      apiBaseUrl: normalizedApiBaseUrl,
      connectEndpoint: `${normalizedApiBaseUrl}api/v1/cli/connect`,
      claimEndpoint: `/api/scanner/upload-sessions/${id}/claim`,
      expiresAt: expiresAtIso,
      commandHint: `buildstory connect "${id}" --code "${deviceCode}" --api-base-url "${normalizedApiBaseUrl}"`,
      scanUploadCommandHint:
        "buildstory scan-upload --repo . --consent local-scan --upload-consent local-dashboard",
    },
  };
}

export async function getUploadSession(
  creatorId: string,
  sessionId: string,
): Promise<UploadSessionView> {
  let row = await sessionById(sessionId);
  if (!row || row.creator_id !== creatorId) {
    throw new D1IngestionError("not_found", "Upload session not found.", 404);
  }
  if (row.report_id) {
    await processReportJob(row.report_id);
    row = await sessionById(sessionId);
  }
  if (!row || row.creator_id !== creatorId) {
    throw new D1IngestionError("not_found", "Upload session not found.", 404);
  }
  return cleanSession(row);
}

export async function claimUploadSession(
  sessionId: string,
  userCode: string,
): Promise<ScannerClaimResponse> {
  const row = await sessionById(sessionId);
  const codeHash = await hashToken(userCode.trim().toUpperCase());
  if (!row || row.device_code_hash !== codeHash) {
    throw new D1IngestionError("invalid_device_code", "Connection code is invalid.", 401);
  }
  if (Date.parse(row.expires_at) <= Date.now()) {
    await (await database())
      .prepare(
        "UPDATE buildstory_upload_sessions SET status = 'expired', status_detail = 'Connection code expired before the scanner claimed it.', updated_at = ? WHERE id = ?",
      )
      .bind(new Date().toISOString(), sessionId)
      .run();
    throw new D1IngestionError("session_expired", "Upload session expired.", 410);
  }
  if (row.device_code_claimed_at) {
    throw new D1IngestionError("device_code_used", "Connection code has already been used.", 409);
  }

  const token = makeUploadToken();
  const claimedAt = new Date().toISOString();
  const tokenExpiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  const connectionId = makeId("conn");
  const result = await (await database())
    .prepare(
      `UPDATE buildstory_upload_sessions
       SET device_code_claimed_at = ?, scanner_authorized_at = ?, connection_id = ?,
           upload_token_hash = ?, upload_token_expires_at = ?, status = 'scanner_authorized',
           status_detail = 'Scanner authorized. Waiting for one validated snapshot upload.', updated_at = ?
       WHERE id = ? AND device_code_hash = ? AND device_code_claimed_at IS NULL AND expires_at > ?`,
    )
    .bind(
      claimedAt,
      claimedAt,
      connectionId,
      await hashToken(token),
      tokenExpiresAt,
      claimedAt,
      sessionId,
      codeHash,
      claimedAt,
    )
    .run();
  if (changes(result) !== 1) {
    throw new D1IngestionError("device_code_used", "Connection code has already been used.", 409);
  }
  return {
    sessionId,
    connectionId,
    uploadGrant: {
      bearerToken: token,
      snapshotEndpoint: `/api/v1/cli/upload-sessions/${sessionId}/snapshot`,
      expiresAt: tokenExpiresAt,
      schemaVersion: "1.0.0",
      maxBytes: MAX_SNAPSHOT_BYTES,
    },
  };
}

export async function acceptSnapshot(
  sessionId: string,
  bearerToken: string,
  snapshotDigest: string,
  value: unknown,
): Promise<SnapshotUploadReceipt> {
  const row = await sessionById(sessionId);
  if (!row) throw new D1IngestionError("not_found", "Upload session not found.", 404);
  if (
    !row.upload_token_hash ||
    !row.upload_token_expires_at ||
    Date.parse(row.upload_token_expires_at) <= Date.now()
  ) {
    throw new D1IngestionError(
      "upload_token_expired",
      "Upload token is missing or expired.",
      401,
    );
  }
  const bearerHash = await hashToken(bearerToken);
  if (bearerHash !== row.upload_token_hash) {
    throw new D1IngestionError("invalid_upload_token", "Upload token is invalid.", 401);
  }
  if (row.upload_token_consumed_at) {
    throw new D1IngestionError(
      "upload_token_used",
      "Upload token has already been consumed. Use the status endpoint instead.",
      409,
    );
  }
  if (!/^sha256:[a-f0-9]{64}$/.test(snapshotDigest)) {
    throw new D1IngestionError(
      "invalid_snapshot_digest",
      "X-BuildStory-Snapshot-Digest must be a lowercase sha256 digest.",
      400,
    );
  }

  const validated = validateProjectSnapshot(value);
  if (!validated.ok) {
    throw new D1IngestionError(
      "invalid_project_snapshot",
      "ProjectSnapshot validation failed.",
      422,
      validated.errors,
    );
  }

  const acceptedAt = new Date().toISOString();
  const reportId = makeId("rpt");
  const receiptId = makeId("rcpt");
  const jobId = makeId("job");
  const reportSnapshot = reportSnapshotFromScanner(validated.snapshot, row.creator_id);
  const db = await database();
  const results = await db.batch([
    db
      .prepare(
        `INSERT INTO buildstory_reports (
          id, creator_id, project_id, upload_session_id, status, created_at,
          source_snapshot_json, snapshot_json, selected_public_fields_json,
          editorial_tagline, editorial_description, editorial_reflection,
          publication_status, publication_slug, updated_at
        )
        SELECT ?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?, ?, '', 'not_published', ?, ?
        WHERE EXISTS (
          SELECT 1 FROM buildstory_upload_sessions
          WHERE id = ? AND upload_token_hash = ? AND upload_token_consumed_at IS NULL
            AND upload_token_expires_at > ?
        )`,
      )
      .bind(
        reportId,
        row.creator_id,
        reportSnapshot.identity.id,
        sessionId,
        acceptedAt,
        JSON.stringify(validated.snapshot),
        JSON.stringify(reportSnapshot),
        JSON.stringify(DEFAULT_PUBLIC_FIELDS),
        reportSnapshot.identity.tagline,
        reportSnapshot.identity.description,
        reportSnapshot.identity.slug,
        acceptedAt,
        sessionId,
        bearerHash,
        acceptedAt,
      ),
    db
      .prepare(
        `INSERT INTO buildstory_report_jobs (
          id, report_id, status, attempts, available_at, created_at, updated_at
        ) SELECT ?, ?, 'pending', 0, ?, ?, ?
          WHERE EXISTS (SELECT 1 FROM buildstory_reports WHERE id = ?)`,
      )
      .bind(jobId, reportId, acceptedAt, acceptedAt, acceptedAt, reportId),
    db
      .prepare(
        `UPDATE buildstory_upload_sessions
         SET upload_token_consumed_at = ?, upload_receipt_id = ?, snapshot_digest = ?,
             snapshot_json = ?, snapshot_received_at = ?, queued_at = ?, report_id = ?,
             status = 'queued', status_detail = 'Snapshot validated and queued for report generation.',
             updated_at = ?
         WHERE id = ? AND upload_token_hash = ? AND upload_token_consumed_at IS NULL
           AND upload_token_expires_at > ?`,
      )
      .bind(
        acceptedAt,
        receiptId,
        snapshotDigest,
        JSON.stringify(validated.snapshot),
        acceptedAt,
        acceptedAt,
        reportId,
        acceptedAt,
        sessionId,
        bearerHash,
        acceptedAt,
      ),
  ]);
  if (changes(results[0]) !== 1 || changes(results[2]) !== 1) {
    throw new D1IngestionError(
      "upload_token_used",
      "Upload token has already been consumed. Use the status endpoint instead.",
      409,
    );
  }
  return {
    sessionId,
    receiptId,
    scanId: validated.snapshot.scanId,
    snapshotDigest,
    acceptedAt,
    status: "queued",
    statusEndpoint: `/api/v1/cli/upload-sessions/${sessionId}/status`,
    reportEndpoint: `/api/v1/cli/reports/${reportId}`,
  };
}

async function scannerSessionForToken(sessionId: string, bearerToken: string) {
  const row = await sessionById(sessionId);
  if (!row) throw new D1IngestionError("not_found", "Upload session not found.", 404);
  if (
    !row.upload_token_hash ||
    !row.upload_token_expires_at ||
    Date.parse(row.upload_token_expires_at) <= Date.now()
  ) {
    throw new D1IngestionError(
      "upload_token_expired",
      "The local upload grant is missing or expired. Create a fresh dashboard connection.",
      401,
    );
  }
  if ((await hashToken(bearerToken)) !== row.upload_token_hash) {
    throw new D1IngestionError(
      "invalid_upload_token",
      "The local upload grant is invalid for this session.",
      401,
    );
  }
  return row;
}

export async function getLocalUploadStatus(
  sessionId: string,
  bearerToken: string,
) {
  let row = await scannerSessionForToken(sessionId, bearerToken);
  if (!row.upload_token_consumed_at) {
    throw new D1IngestionError(
      "snapshot_not_uploaded",
      "No ProjectSnapshot has been accepted for this connection yet.",
      409,
    );
  }
  if (row.report_id) {
    await processReportJob(row.report_id);
    row = await scannerSessionForToken(sessionId, bearerToken);
  }
  const status =
    row.status === "report_ready"
      ? "ready"
      : row.status === "failed"
        ? "failed"
        : row.status === "snapshot_received"
          ? "accepted"
          : "processing";
  return {
    protocolVersion: "1.0" as const,
    status: status as "accepted" | "processing" | "ready" | "failed",
    reportReady: status === "ready",
  };
}

export async function getLocalReport(
  reportId: string,
  bearerToken: string,
): Promise<LocalReportSummary> {
  let row = await reportById(reportId);
  if (!row) throw new D1IngestionError("not_found", "Report not found.", 404);
  await scannerSessionForToken(row.upload_session_id, bearerToken);
  await processReportJob(reportId);
  row = await reportById(reportId);
  if (!row) throw new D1IngestionError("not_found", "Report not found.", 404);
  const report = reportFromRow(row);
  if (report.status !== "ready") {
    throw new D1IngestionError(
      "report_not_ready",
      "The private report is still being generated. Poll statusUrl before retrieving it.",
      409,
    );
  }
  return {
    summary: `Private report ready for ${report.snapshot.identity.name}. Review it in the Buildstory dashboard before publishing.`,
    sessionCount: report.snapshot.sessions.length,
    commitCount: report.snapshot.git.commits,
    milestoneCount: report.snapshot.milestones.length,
    warningCount: report.sourceSnapshot?.quality.warningCount ?? 0,
  };
}

export async function getReport(
  creatorId: string,
  reportId: string,
): Promise<GeneratedReport> {
  let row = await reportById(reportId);
  if (!row || row.creator_id !== creatorId) {
    throw new D1IngestionError("not_found", "Report not found.", 404);
  }
  await processReportJob(reportId);
  row = await reportById(reportId);
  if (!row || row.creator_id !== creatorId) {
    throw new D1IngestionError("not_found", "Report not found.", 404);
  }
  return reportFromRow(row);
}

export async function updateReport(
  creatorId: string,
  reportId: string,
  update: {
    selectedPublicFields?: PublicFieldKey[];
    editorial?: Partial<GeneratedReport["editorial"]>;
  },
): Promise<GeneratedReport> {
  const report = await getReport(creatorId, reportId);
  if (report.status !== "ready") {
    throw new D1IngestionError("report_not_ready", "Report is not ready to edit.", 409);
  }
  const fields = update.selectedPublicFields
    ? [...new Set(update.selectedPublicFields)]
    : report.selectedPublicFields;
  if (fields.some((field) => !PUBLIC_FIELDS.includes(field))) {
    throw new D1IngestionError(
      "invalid_public_fields",
      "One or more public fields are invalid.",
      422,
    );
  }
  const editorial = { ...report.editorial };
  for (const key of ["tagline", "description", "reflection"] as const) {
    const value = update.editorial?.[key];
    if (value !== undefined) {
      const sanitized = sanitizePublicText(
        value,
        key === "tagline" ? 300 : 4_000,
      );
      if (sanitized.findings.length > 0) {
        throw new D1IngestionError(
          "unsafe_editorial_content",
          "Editorial text cannot contain secrets, raw remote URLs, or absolute paths.",
          422,
        );
      }
      editorial[key] = sanitized.value;
    }
  }
  const now = new Date().toISOString();
  await (await database())
    .prepare(
      `UPDATE buildstory_reports
       SET selected_public_fields_json = ?, editorial_tagline = ?, editorial_description = ?,
           editorial_reflection = ?,
           publication_status = CASE WHEN publication_status = 'published' THEN 'draft_changes' ELSE publication_status END,
           updated_at = ?
       WHERE id = ? AND creator_id = ?`,
    )
    .bind(
      JSON.stringify(fields),
      editorial.tagline,
      editorial.description,
      editorial.reflection,
      now,
      reportId,
      creatorId,
    )
    .run();
  return getReport(creatorId, reportId);
}

export async function publishReport(
  creatorId: string,
  reportId: string,
): Promise<GeneratedReport> {
  const report = await getReport(creatorId, reportId);
  if (report.status !== "ready") {
    throw new D1IngestionError("report_not_ready", "Report is not ready to publish.", 409);
  }
  if (!report.selectedPublicFields.includes("tagline")) {
    throw new D1IngestionError(
      "missing_public_field",
      "A public tagline is required.",
      422,
    );
  }
  if (
    Object.entries(report.editorial).some(
      ([key, value]) =>
        sanitizePublicText(value, key === "tagline" ? 300 : 4_000).findings
          .length > 0,
    )
  ) {
    throw new D1IngestionError(
      "unsafe_editorial_content",
      "Editorial text must pass the public privacy boundary before publication.",
      422,
    );
  }
  const conflict = await (await database())
    .prepare(
      "SELECT id FROM buildstory_reports WHERE publication_slug = ? AND publication_status = 'published' AND id != ?",
    )
    .bind(report.publication.slug, reportId)
    .first<{ id: string }>();
  if (conflict) {
    throw new D1IngestionError(
      "publication_slug_conflict",
      "That public project slug is already in use.",
      409,
    );
  }
  const publishedAt = new Date().toISOString();
  await (await database())
    .prepare(
      `UPDATE buildstory_reports
       SET publication_status = 'published', published_at = ?, public_url = ?, updated_at = ?
       WHERE id = ? AND creator_id = ?`,
    )
    .bind(
      publishedAt,
      `${publicOrigin()}/p/${report.publication.slug}`,
      publishedAt,
      reportId,
      creatorId,
    )
    .run();
  return getReport(creatorId, reportId);
}

export async function publicationStatusForProject(
  creatorId: string,
  projectId: string,
) {
  const row = await (await database())
    .prepare(
      `SELECT publication_status, publication_slug, published_at, public_url
       FROM buildstory_reports WHERE creator_id = ? AND project_id = ?
       ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(creatorId, projectId)
    .first<{
      publication_status: string;
      publication_slug: string;
      published_at: string | null;
      public_url: string | null;
    }>();
  if (!row) return null;
  return {
    status: row.publication_status as PublicationStatus,
    slug: row.publication_slug,
    publishedAt: row.published_at,
    publicUrl: row.public_url,
  };
}

/** Public boundary: this query does not select the private source snapshot. */
export async function getPublishedStoryBySlug(slug: string) {
  const row = await (await database())
    .prepare(
      `SELECT snapshot_json, selected_public_fields_json, editorial_tagline, editorial_description
       FROM buildstory_reports
       WHERE publication_slug = ? AND publication_status = 'published' LIMIT 1`,
    )
    .bind(slug)
    .first<{
      snapshot_json: string;
      selected_public_fields_json: string;
      editorial_tagline: string;
      editorial_description: string;
    }>();
  if (!row) return null;
  const snapshot = parseJson<ProjectSnapshot>(row.snapshot_json, "public report");
  const selected = parseJson<PublicFieldKey[]>(
    row.selected_public_fields_json,
    "public field",
  );
  if (
    !Array.isArray(selected) ||
    selected.some((field) => !PUBLIC_FIELDS.includes(field))
  ) {
    throw new D1IngestionError(
      "durable_record_invalid",
      "A stored public projection is invalid.",
      500,
    );
  }
  snapshot.identity.tagline = row.editorial_tagline;
  snapshot.identity.description = row.editorial_description;
  snapshot.identity.visibility = "public";
  return publicBuildStoryFromSnapshot(snapshot, selected);
}
