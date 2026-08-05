import { getD1 } from "@/db";
import { publicBuildStoryFromSnapshot } from "@/lib/build-story";
import { baseHandleFrom, baseSlugFrom, candidateHandles, candidateSlugs } from "@/lib/identity/handles";
import { isLoopbackHostname } from "@/lib/ingestion/local-api";
import { generateNarrative, narrativeProviderConfigured, NarrativeProviderError } from "@/lib/narrative/provider";
import { estimateCostMicroUsd } from "@/lib/narrative/pricing";
import { NARRATIVE_FIELD_LIMITS, NARRATIVE_PROMPT_VERSION } from "@/lib/narrative/schema";
import type { ProjectSnapshot } from "@/lib/project-snapshot";
import { sanitizePublicText } from "@/lib/publication/sanitization";
import type {
  DeviceAuthorization,
  GeneratedReport,
  LocalReportSummary,
  NarrativeRecord,
  NarrativeStatus,
  ProjectRecord,
  ProjectScanStats,
  PublicationStatus,
  PublicFieldKey,
  ReportStatus,
  ScannerClaimResponse,
  SnapshotUploadReceipt,
  UploadSessionStatus,
  UploadSessionView,
  UserRecord,
} from "./contracts";
import { reportSnapshotFromScanner } from "./report-adapter";
import type { ScannerProjectSnapshot } from "./scanner-project-snapshot";
import { PROJECT_SNAPSHOT_SCHEMA_VERSION } from "./scanner-project-snapshot";
import { MAX_SNAPSHOT_BYTES, validateProjectSnapshot } from "./validation";

const DEFAULT_MONTHLY_LLM_CAP_MICRO_USD = 1_000_000; // $1.00/month/user, subsidized default

type SessionRow = {
  id: string;
  creator_id: string;
  owner_user_id: string | null;
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
  owner_user_id: string | null;
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

function reportFromRow(row: ReportRow, narrative: NarrativeRecord | null = null): GeneratedReport {
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
    narrative,
  };
}

type NarrativeRow = {
  id: string;
  report_id: string;
  owner_user_id: string;
  mode: string;
  provider: string;
  model: string;
  prompt_version: string;
  status: string;
  sections_json: string | null;
  input_tokens: number;
  output_tokens: number;
  cost_micro_usd: number;
  last_error_code: string | null;
};

function narrativeFromRow(row: NarrativeRow): NarrativeRecord {
  return {
    id: row.id,
    reportId: row.report_id,
    mode: row.mode as "cloud" | "local",
    provider: row.provider,
    model: row.model,
    status: row.status as NarrativeStatus,
    sections: row.sections_json
      ? parseJson<NarrativeRecord["sections"]>(row.sections_json, "narrative sections")
      : null,
    costMicroUsd: row.cost_micro_usd,
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

async function userByAuthSubject(authSubject: string) {
  return (await database())
    .prepare(
      "SELECT id, handle, display_name, avatar_url, bio, role FROM buildstory_users WHERE auth_subject = ?",
    )
    .bind(authSubject)
    .first<{
      id: string;
      handle: string;
      display_name: string;
      avatar_url: string | null;
      bio: string | null;
      role: string;
    }>();
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

/**
 * Get-or-create the real user row for a signed-in identity. Safe to call on
 * every creator-authenticated request: a no-op UPDATE of display
 * name/avatar when the row already exists, or a race-safe insert with a
 * handle allocated from the reserved-word list and per-attempt uniqueness
 * check when it doesn't. The handle, once set, is sticky - re-running this
 * never changes it.
 */
export async function ensureUser(session: {
  creatorId: string;
  name: string;
  email: string;
  image: string | null;
}): Promise<UserRecord> {
  const db = await database();
  const now = new Date().toISOString();
  const existing = await db
    .prepare(
      "SELECT id, handle, role FROM buildstory_users WHERE auth_subject = ?",
    )
    .bind(session.creatorId)
    .first<{ id: string; handle: string; role: string }>();
  if (existing) {
    await db
      .prepare(
        "UPDATE buildstory_users SET display_name = ?, avatar_url = ?, updated_at = ? WHERE id = ?",
      )
      .bind(session.name, session.image, now, existing.id)
      .run();
    return {
      id: existing.id,
      authSubject: session.creatorId,
      handle: existing.handle,
      displayName: session.name,
      avatarUrl: session.image,
      role: existing.role as UserRecord["role"],
    };
  }

  const base = baseHandleFrom(session.name, session.email);
  for (const candidate of candidateHandles(base)) {
    const id = makeId("usr");
    const result = await db
      .prepare(
        `INSERT INTO buildstory_users (
          id, auth_subject, email, handle, handle_lower, display_name, avatar_url,
          role, status, created_at, updated_at
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, 'member', 'active', ?, ?
        WHERE NOT EXISTS (SELECT 1 FROM buildstory_users WHERE auth_subject = ?)
          AND NOT EXISTS (SELECT 1 FROM buildstory_users WHERE handle_lower = ?)`,
      )
      .bind(
        id,
        session.creatorId,
        session.email,
        candidate,
        candidate.toLocaleLowerCase("en-US"),
        session.name,
        session.image,
        now,
        now,
        session.creatorId,
        candidate.toLocaleLowerCase("en-US"),
      )
      .run();
    if (changes(result) === 1) {
      return {
        id,
        authSubject: session.creatorId,
        handle: candidate,
        displayName: session.name,
        avatarUrl: session.image,
        role: "member",
      };
    }
    const raced = await db
      .prepare("SELECT id, handle, display_name, avatar_url, role FROM buildstory_users WHERE auth_subject = ?")
      .bind(session.creatorId)
      .first<{ id: string; handle: string; display_name: string; avatar_url: string | null; role: string }>();
    if (raced) {
      return {
        id: raced.id,
        authSubject: session.creatorId,
        handle: raced.handle,
        displayName: raced.display_name,
        avatarUrl: raced.avatar_url,
        role: raced.role as UserRecord["role"],
      };
    }
    // Otherwise the candidate handle itself collided; loop to the next one.
  }
  throw new D1IngestionError(
    "handle_generation_failed",
    "Could not allocate a handle for this account.",
    500,
  );
}

/**
 * Get-or-create the project a scan belongs to, grouped by the scanner's
 * content-derived repository fingerprint (stable across scans of the same
 * repository; NOT the scan-specific scanId). Refreshes the rollup fields
 * to this scan's own totals on every call rather than summing across
 * scans, since each ProjectSnapshot already aggregates its full selected
 * time window and scan windows can overlap.
 */
export async function ensureProject(
  ownerUserId: string,
  fingerprint: string,
  fingerprintBasis: string,
  stats: ProjectScanStats,
): Promise<ProjectRecord> {
  const db = await database();
  const now = new Date().toISOString();
  const existing = await db
    .prepare(
      "SELECT id, slug, name FROM buildstory_projects WHERE owner_user_id = ? AND repository_fingerprint = ?",
    )
    .bind(ownerUserId, fingerprint)
    .first<{ id: string; slug: string; name: string }>();
  if (existing) {
    await db
      .prepare(
        `UPDATE buildstory_projects
         SET last_scan_at = ?, story_count = story_count + 1,
             latest_session_count = ?, latest_commit_count = ?, latest_active_days = ?,
             updated_at = ?
         WHERE id = ?`,
      )
      .bind(stats.scannedAt, stats.sessionCount, stats.commitCount, stats.activeDays, now, existing.id)
      .run();
    return {
      id: existing.id,
      ownerUserId,
      slug: existing.slug,
      name: existing.name,
      repositoryFingerprint: fingerprint,
    };
  }

  const base = baseSlugFrom(stats.displayName);
  for (const candidate of candidateSlugs(base)) {
    const id = makeId("prj");
    const result = await db
      .prepare(
        `INSERT INTO buildstory_projects (
          id, owner_user_id, slug, name, repository_fingerprint, fingerprint_basis,
          first_scan_at, last_scan_at, story_count, latest_session_count,
          latest_commit_count, latest_active_days, created_at, updated_at
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?
        WHERE NOT EXISTS (
          SELECT 1 FROM buildstory_projects WHERE owner_user_id = ? AND repository_fingerprint = ?
        )
        AND NOT EXISTS (
          SELECT 1 FROM buildstory_projects WHERE owner_user_id = ? AND slug = ?
        )`,
      )
      .bind(
        id,
        ownerUserId,
        candidate,
        stats.displayName,
        fingerprint,
        fingerprintBasis,
        stats.scannedAt,
        stats.scannedAt,
        stats.sessionCount,
        stats.commitCount,
        stats.activeDays,
        now,
        now,
        ownerUserId,
        fingerprint,
        ownerUserId,
        candidate,
      )
      .run();
    if (changes(result) === 1) {
      return { id, ownerUserId, slug: candidate, name: stats.displayName, repositoryFingerprint: fingerprint };
    }
    const raced = await db
      .prepare("SELECT id, slug, name FROM buildstory_projects WHERE owner_user_id = ? AND repository_fingerprint = ?")
      .bind(ownerUserId, fingerprint)
      .first<{ id: string; slug: string; name: string }>();
    if (raced) {
      return { id: raced.id, ownerUserId, slug: raced.slug, name: raced.name, repositoryFingerprint: fingerprint };
    }
    // Otherwise the candidate slug collided within this owner; loop to the next one.
  }
  throw new D1IngestionError(
    "project_slug_generation_failed",
    "Could not allocate a project slug for this repository.",
    500,
  );
}

function currentBudgetPeriodKey(): string {
  return new Date().toISOString().slice(0, 7); // "YYYY-MM", UTC - resets naturally month to month.
}

/**
 * Soft pre-check only: true unless this user has already met or exceeded
 * their cap for the current period. The real spend gets recorded after a
 * call completes and its actual token cost is known (recordNarrativeSpend),
 * so a single in-flight call can carry a user slightly over cap - that's an
 * accepted tradeoff for not having to reserve/refund around a variable-cost
 * external call.
 */
async function hasNarrativeBudget(db: D1Database, ownerUserId: string): Promise<boolean> {
  const row = await db
    .prepare(
      "SELECT spent_micro_usd, cap_micro_usd FROM buildstory_llm_budgets WHERE user_id = ? AND period_key = ?",
    )
    .bind(ownerUserId, currentBudgetPeriodKey())
    .first<{ spent_micro_usd: number; cap_micro_usd: number }>();
  if (!row) return true;
  return row.spent_micro_usd < row.cap_micro_usd;
}

/** Race-safe get-or-create-then-add, mirroring the ensureProject slug-allocation pattern. */
async function recordNarrativeSpend(db: D1Database, ownerUserId: string, costMicroUsd: number) {
  const periodKey = currentBudgetPeriodKey();
  const now = new Date().toISOString();
  const bumped = await db
    .prepare(
      "UPDATE buildstory_llm_budgets SET spent_micro_usd = spent_micro_usd + ?, updated_at = ? WHERE user_id = ? AND period_key = ?",
    )
    .bind(costMicroUsd, now, ownerUserId, periodKey)
    .run();
  if (changes(bumped) === 1) return;
  const inserted = await db
    .prepare(
      `INSERT INTO buildstory_llm_budgets (user_id, period_key, spent_micro_usd, cap_micro_usd, updated_at)
       SELECT ?, ?, ?, ?, ?
       WHERE NOT EXISTS (SELECT 1 FROM buildstory_llm_budgets WHERE user_id = ? AND period_key = ?)`,
    )
    .bind(ownerUserId, periodKey, costMicroUsd, DEFAULT_MONTHLY_LLM_CAP_MICRO_USD, now, ownerUserId, periodKey)
    .run();
  if (changes(inserted) === 1) return;
  // Someone else's insert won the race between our UPDATE and INSERT attempts; the row exists now.
  await db
    .prepare(
      "UPDATE buildstory_llm_budgets SET spent_micro_usd = spent_micro_usd + ?, updated_at = ? WHERE user_id = ? AND period_key = ?",
    )
    .bind(costMicroUsd, now, ownerUserId, periodKey)
    .run();
}

async function narrativeByReportId(reportId: string) {
  return (await database())
    .prepare("SELECT * FROM buildstory_narratives WHERE report_id = ?")
    .bind(reportId)
    .first<NarrativeRow>();
}

/**
 * Creates a queued narrative + narrative_job row for a report, but only when
 * the source snapshot actually carries an opt-in evidence bundle. A report
 * with no narrative row is a normal state (no AI story), not an error -
 * callers must not treat a missing row as a failure.
 */
async function createNarrativeJob(reportId: string, ownerUserId: string): Promise<void> {
  const db = await database();
  const now = new Date().toISOString();
  const narrativeId = makeId("nar");
  const narrativeJobId = makeId("njob");
  await db.batch([
    db
      .prepare(
        `INSERT INTO buildstory_narratives (
          id, report_id, owner_user_id, mode, provider, model, prompt_version, status,
          input_tokens, output_tokens, cost_micro_usd, created_at, updated_at
        )
        SELECT ?, ?, ?, 'cloud', '', '', ?, 'queued', 0, 0, 0, ?, ?
        WHERE EXISTS (SELECT 1 FROM buildstory_reports WHERE id = ?)`,
      )
      .bind(narrativeId, reportId, ownerUserId, NARRATIVE_PROMPT_VERSION, now, now, reportId),
    db
      .prepare(
        `INSERT INTO buildstory_narrative_jobs (
          id, narrative_id, status, attempts, available_at, created_at, updated_at
        ) SELECT ?, ?, 'pending', 0, ?, ?, ?
          WHERE EXISTS (SELECT 1 FROM buildstory_narratives WHERE id = ?)`,
      )
      .bind(narrativeJobId, narrativeId, now, now, now, narrativeId),
  ]);
}

/**
 * Lease-claim and process one narrative job, mirroring processReportJob's
 * lease/retry shape exactly. Unlike report generation this call is billed
 * and can be slow, so it must never be fanned out across every pending job
 * for a creator on every dashboard read (see processCreatorJobs) - it is
 * only ever invoked for one specific narrative the caller is actively
 * viewing (getReport), where the same conditional-claim UPDATE already
 * prevents a concurrent or already-completed job from making a second call.
 */
async function processNarrativeJob(narrativeId: string) {
  const db = await database();
  const now = new Date();
  const nowIso = now.toISOString();
  const leaseUntil = new Date(now.getTime() + 30_000).toISOString();
  const claimed = await db
    .prepare(
      `UPDATE buildstory_narrative_jobs
       SET status = 'processing', attempts = attempts + 1, lease_until = ?, updated_at = ?
       WHERE narrative_id = ?
         AND available_at <= ?
         AND (status = 'pending' OR (status = 'processing' AND lease_until <= ?))`,
    )
    .bind(leaseUntil, nowIso, narrativeId, nowIso, nowIso)
    .run();
  if (changes(claimed) !== 1) return;

  try {
    const narrative = await db
      .prepare("SELECT * FROM buildstory_narratives WHERE id = ?")
      .bind(narrativeId)
      .first<NarrativeRow>();
    if (!narrative) throw new Error(`Narrative ${narrativeId} not found for a claimed job.`);

    if (!narrativeProviderConfigured()) {
      throw new NarrativeProviderError("llm_not_configured", "No narrative provider is configured.");
    }
    if (!(await hasNarrativeBudget(db, narrative.owner_user_id))) {
      throw new NarrativeProviderError("llm_budget_exceeded", "Monthly narrative budget has been reached.");
    }

    const report = await reportById(narrative.report_id);
    if (!report) throw new Error(`Report ${narrative.report_id} not found for narrative ${narrativeId}.`);
    const sourceSnapshot = parseJson<ScannerProjectSnapshot>(report.source_snapshot_json, "source snapshot");

    const result = await generateNarrative(sourceSnapshot);
    const sanitizedSections = {
      headline: sanitizePublicText(result.sections.headline, NARRATIVE_FIELD_LIMITS.headline).value,
      narrative: sanitizePublicText(result.sections.narrative, NARRATIVE_FIELD_LIMITS.narrative).value,
      turningPoint: sanitizePublicText(result.sections.turningPoint, NARRATIVE_FIELD_LIMITS.turningPoint).value,
      learnings: result.sections.learnings.map(
        (line) => sanitizePublicText(line, NARRATIVE_FIELD_LIMITS.learningItem).value,
      ),
    };
    const costMicroUsd = estimateCostMicroUsd(result.model, result.inputTokens, result.outputTokens);

    await db.batch([
      db
        .prepare(
          `UPDATE buildstory_narratives
           SET status = 'ready', provider = ?, model = ?, sections_json = ?,
               input_tokens = ?, output_tokens = ?, cost_micro_usd = ?, last_error_code = NULL, updated_at = ?
           WHERE id = ? AND status != 'failed'`,
        )
        .bind(
          result.provider,
          result.model,
          JSON.stringify(sanitizedSections),
          result.inputTokens,
          result.outputTokens,
          costMicroUsd,
          nowIso,
          narrativeId,
        ),
      db
        .prepare(
          "UPDATE buildstory_narrative_jobs SET status = 'completed', lease_until = NULL, last_error_code = NULL, updated_at = ? WHERE narrative_id = ?",
        )
        .bind(nowIso, narrativeId),
    ]);
    await recordNarrativeSpend(db, narrative.owner_user_id, costMicroUsd);
  } catch (error) {
    const errorCode = error instanceof NarrativeProviderError ? error.code : "narrative_generation_failed";
    const job = await db
      .prepare("SELECT attempts FROM buildstory_narrative_jobs WHERE narrative_id = ?")
      .bind(narrativeId)
      .first<{ attempts: number }>();
    const terminal = Number(job?.attempts ?? 1) >= 3;
    const retryAt = new Date(Date.now() + 30_000).toISOString();
    if (terminal) {
      await db.batch([
        db
          .prepare(
            "UPDATE buildstory_narrative_jobs SET status = 'failed', lease_until = NULL, last_error_code = ?, updated_at = ? WHERE narrative_id = ?",
          )
          .bind(errorCode, nowIso, narrativeId),
        db
          .prepare(
            "UPDATE buildstory_narratives SET status = 'failed', last_error_code = ?, updated_at = ? WHERE id = ?",
          )
          .bind(errorCode, nowIso, narrativeId),
      ]);
    } else {
      await db
        .prepare(
          "UPDATE buildstory_narrative_jobs SET status = 'pending', available_at = ?, lease_until = NULL, last_error_code = ?, updated_at = ? WHERE narrative_id = ?",
        )
        .bind(retryAt, errorCode, nowIso, narrativeId)
        .run();
    }
    throw error;
  }
}

export async function createUploadSession(
  creatorId: string,
  projectLabel = "New local project",
  apiBaseUrl = "http://localhost:3000/",
  ownerUserId: string | null = null,
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
        id, creator_id, owner_user_id, project_label, status, created_at, expires_at,
        status_detail, device_code_hash, updated_at
      ) VALUES (?, ?, ?, ?, 'awaiting_scanner', ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      creatorId,
      ownerUserId,
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
  const apiBaseHostname = new URL(normalizedApiBaseUrl).hostname;
  const allowHostFlag = isLoopbackHostname(apiBaseHostname) ? "" : ` --allow-host "${apiBaseHostname}"`;
  return {
    session,
    deviceAuthorization: {
      sessionId: id,
      userCode: deviceCode,
      apiBaseUrl: normalizedApiBaseUrl,
      connectEndpoint: `${normalizedApiBaseUrl}api/v1/cli/connect`,
      claimEndpoint: `/api/scanner/upload-sessions/${id}/claim`,
      expiresAt: expiresAtIso,
      commandHint: `buildstory connect "${id}" --code "${deviceCode}" --api-base-url "${normalizedApiBaseUrl}"${allowHostFlag}`,
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
      schemaVersion: PROJECT_SNAPSHOT_SCHEMA_VERSION,
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

  const user = await userByAuthSubject(row.creator_id);
  if (!user) {
    throw new D1IngestionError(
      "creator_not_provisioned",
      "This creator has no account record yet. Sign in through the dashboard once before scanning.",
      409,
    );
  }
  const snapshotSessions = validated.snapshot.sessions;
  const activeDayCount = new Set(snapshotSessions.map((session) => session.startedAt.slice(0, 10))).size;
  const project = await ensureProject(
    user.id,
    validated.snapshot.repository.fingerprint,
    validated.snapshot.repository.fingerprintBasis,
    {
      displayName: validated.snapshot.repository.displayName,
      fingerprintBasis: validated.snapshot.repository.fingerprintBasis,
      scannedAt: validated.snapshot.generatedAt,
      sessionCount: snapshotSessions.length,
      commitCount: validated.snapshot.git.commits,
      activeDays: activeDayCount,
    },
  );

  const acceptedAt = new Date().toISOString();
  const reportId = makeId("rpt");
  const receiptId = makeId("rcpt");
  const jobId = makeId("job");
  const reportSnapshot = reportSnapshotFromScanner(validated.snapshot, project, {
    id: user.id,
    name: user.display_name,
    handle: user.handle,
    role: user.bio ?? "AI-assisted software builder",
  });
  const db = await database();
  const results = await db.batch([
    db
      .prepare(
        `INSERT INTO buildstory_reports (
          id, creator_id, owner_user_id, project_id, upload_session_id, status, created_at,
          source_snapshot_json, snapshot_json, selected_public_fields_json,
          editorial_tagline, editorial_description, editorial_reflection,
          publication_status, publication_slug, updated_at
        )
        SELECT ?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?, ?, '', 'not_published', ?, ?
        WHERE EXISTS (
          SELECT 1 FROM buildstory_upload_sessions
          WHERE id = ? AND upload_token_hash = ? AND upload_token_consumed_at IS NULL
            AND upload_token_expires_at > ?
        )`,
      )
      .bind(
        reportId,
        row.creator_id,
        user.id,
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
  if (validated.snapshot.narrativeEvidence && validated.snapshot.narrativeEvidence.excerpts.length > 0) {
    await createNarrativeJob(reportId, user.id);
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
  let narrativeRow = await narrativeByReportId(reportId);
  if (narrativeRow && (narrativeRow.status === "queued" || narrativeRow.status === "generating")) {
    // Best-effort: a failed LLM call must not block the rest of the report from loading.
    await processNarrativeJob(narrativeRow.id).catch(() => {});
    narrativeRow = await narrativeByReportId(reportId);
  }
  return reportFromRow(row, narrativeRow ? narrativeFromRow(narrativeRow) : null);
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

/** IDs only, for social features (reactions/comments) to key off of - never content. */
export async function getPublicStoryIdentity(
  slug: string,
): Promise<{ reportId: string; ownerUserId: string | null } | null> {
  const row = await (await database())
    .prepare(
      "SELECT id, owner_user_id FROM buildstory_reports WHERE publication_slug = ? AND publication_status = 'published' LIMIT 1",
    )
    .bind(slug)
    .first<{ id: string; owner_user_id: string | null }>();
  return row ? { reportId: row.id, ownerUserId: row.owner_user_id } : null;
}

/**
 * Public boundary: this query does not select the private source snapshot.
 * Newest published stories first, capped for a single feed page.
 */
export async function listPublishedStories(limit = 30) {
  const boundedLimit = Math.min(Math.max(1, Math.trunc(limit)), 100);
  const rows = await (await database())
    .prepare(
      `SELECT snapshot_json, selected_public_fields_json, editorial_tagline, editorial_description, published_at
       FROM buildstory_reports
       WHERE publication_status = 'published'
       ORDER BY published_at DESC LIMIT ?`,
    )
    .bind(boundedLimit)
    .all<{
      snapshot_json: string;
      selected_public_fields_json: string;
      editorial_tagline: string;
      editorial_description: string;
      published_at: string | null;
    }>();

  const stories = [];
  for (const row of rows.results) {
    const snapshot = parseJson<ProjectSnapshot>(row.snapshot_json, "public report");
    const selected = parseJson<PublicFieldKey[]>(
      row.selected_public_fields_json,
      "public field",
    );
    if (!Array.isArray(selected) || selected.some((field) => !PUBLIC_FIELDS.includes(field))) {
      continue; // skip rather than fail the whole feed on one invalid stored row
    }
    snapshot.identity.tagline = row.editorial_tagline;
    snapshot.identity.description = row.editorial_description;
    snapshot.identity.visibility = "public";
    stories.push({
      ...publicBuildStoryFromSnapshot(snapshot, selected),
      publishedAt: row.published_at,
    });
  }
  return stories;
}

function escapeLikePattern(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

/** Public boundary: matches only against already-public editorial text and the owner's handle/display name, never source snapshot content. */
export async function searchPublishedStories(query: string, limit = 20) {
  const boundedLimit = Math.min(Math.max(1, Math.trunc(limit)), 50);
  const trimmed = query.trim().slice(0, 200);
  if (!trimmed) return [];
  const pattern = `%${escapeLikePattern(trimmed)}%`;
  const rows = await (await database())
    .prepare(
      `SELECT r.snapshot_json, r.selected_public_fields_json, r.editorial_tagline, r.editorial_description, r.published_at
       FROM buildstory_reports r
       LEFT JOIN buildstory_users u ON u.id = r.owner_user_id
       WHERE r.publication_status = 'published'
         AND (
           r.editorial_tagline LIKE ? ESCAPE '\\'
           OR r.editorial_description LIKE ? ESCAPE '\\'
           OR u.handle LIKE ? ESCAPE '\\'
           OR u.display_name LIKE ? ESCAPE '\\'
         )
       ORDER BY r.published_at DESC LIMIT ?`,
    )
    .bind(pattern, pattern, pattern, pattern, boundedLimit)
    .all<{
      snapshot_json: string;
      selected_public_fields_json: string;
      editorial_tagline: string;
      editorial_description: string;
      published_at: string | null;
    }>();

  const stories = [];
  for (const row of rows.results) {
    const snapshot = parseJson<ProjectSnapshot>(row.snapshot_json, "public report");
    const selected = parseJson<PublicFieldKey[]>(row.selected_public_fields_json, "public field");
    if (!Array.isArray(selected) || selected.some((field) => !PUBLIC_FIELDS.includes(field))) {
      continue;
    }
    snapshot.identity.tagline = row.editorial_tagline;
    snapshot.identity.description = row.editorial_description;
    snapshot.identity.visibility = "public";
    stories.push({
      ...publicBuildStoryFromSnapshot(snapshot, selected),
      publishedAt: row.published_at,
    });
  }
  return stories;
}
