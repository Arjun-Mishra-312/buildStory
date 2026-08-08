import { getD1 } from "@/db";
import { publicBuildStoryFromSnapshot, type PublicBuildStoryViewModel } from "@/lib/build-story";
import { baseHandleFrom, baseSlugFrom, candidateHandles, candidateSlugs, isReservedHandle } from "@/lib/identity/handles";
import { normalizeArtifactUrl, type ArtifactLinksUpdate } from "@/lib/ingestion/artifact-links";
import { mediaPublicUrl } from "@/lib/media/url";
import { isLoopbackHostname } from "@/lib/ingestion/local-api";
import { generateNarrative, narrativeProviderConfigured, NarrativeProviderError } from "@/lib/narrative/provider";
import { canUseCloudNarrative } from "@/lib/narrative/entitlement";
import { estimateCostMicroUsd } from "@/lib/narrative/pricing";
import { NARRATIVE_FIELD_LIMITS, NARRATIVE_PROMPT_VERSION } from "@/lib/narrative/schema";
import type { ProjectSnapshot } from "@/lib/project-snapshot";
import { sanitizePublicText } from "@/lib/publication/sanitization";
import { MAX_MEDIA_PER_REPORT } from "./contracts";
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
  ReportMediaKind,
  ReportMediaRecord,
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
import { compareExploreRows, decodeExploreCursor, encodeExploreCursor, isAfterExploreCursor } from "./explore-cursor";
import { DEFAULT_STORY_BACKGROUND_ID, isStoryBackgroundId } from "@/lib/background-options";

const DEFAULT_MONTHLY_LLM_CAP_MICRO_USD = 1_000_000; // $1.00/month/user, subsidized default

type SessionRow = {
  id: string;
  creator_id: string;
  owner_user_id: string | null;
  project_label: string;
  narrative_model: string | null;
  narrative_mode: string | null;
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
  device_code_attempts: number;
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
  category: string | null;
  story_background_id: string;
  publication_status: string;
  publication_slug: string;
  publication_path: string | null;
  published_at: string | null;
  public_url: string | null;
  artifact_project_url: string | null;
  artifact_repo_url: string | null;
  artifact_video_url: string | null;
  chapter_index: number | null;
};

const PUBLIC_FIELDS: PublicFieldKey[] = [
  "tagline",
  "description",
  "timeWindow",
  "sessionSummary",
  "milestones",
  "modelMix",
  "costEstimate",
  "toolUsage",
  "gitAggregates",
  "redactionSummary",
  "archetype",
  "profileScores",
  "workPatterns",
  "narrative",
  "storyBuildArc",
  "storyMoments",
  "storyTurningPoint",
  "storyDecisions",
  "storyLearnings",
  "storyTraits",
  "storyGrowthEdge",
  "decisionPatterns",
  "standoutTraits",
  "growthEdge",
  "artifactLinks",
  "artifactMedia",
];

const DEFAULT_PUBLIC_FIELDS: PublicFieldKey[] = [
  "tagline",
  "description",
  "timeWindow",
  "sessionSummary",
  "milestones",
  "modelMix",
  "costEstimate",
  "gitAggregates",
  "redactionSummary",
  "archetype",
  "profileScores",
  "workPatterns",
  "narrative",
  "storyBuildArc",
  "storyMoments",
  "storyTurningPoint",
  "storyDecisions",
  "storyLearnings",
  "storyTraits",
  "standoutTraits",
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
    narrativeModel: row.narrative_model,
    narrativeMode: row.narrative_mode === "local" || row.narrative_mode === "off" ? row.narrative_mode : "cloud",
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
    category: row.category as GeneratedReport["category"],
    storyBackgroundId: isStoryBackgroundId(row.story_background_id) ? row.story_background_id : DEFAULT_STORY_BACKGROUND_ID,
    artifact: {
      projectUrl: row.artifact_project_url,
      repoUrl: row.artifact_repo_url,
      videoUrl: row.artifact_video_url,
    },
    publication: {
      status: row.publication_status as PublicationStatus,
      slug: row.publication_slug,
      publishedAt: row.published_at,
      publicUrl: row.public_url,
      chapterIndex: row.chapter_index,
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
  fallbacks_used_json: string | null;
  input_tokens: number;
  output_tokens: number;
  cost_micro_usd: number;
  last_error_code: string | null;
};

function narrativeFromRow(row: NarrativeRow): NarrativeRecord {
  const stored = row.sections_json ? parseJson<unknown>(row.sections_json, "narrative sections") : null;
  const storedRecord = stored && typeof stored === "object" && !Array.isArray(stored) ? stored as { sections?: NarrativeRecord["sections"]; storyPack?: NarrativeRecord["storyPack"]; observability?: NarrativeRecord["observability"] } : null;
  return {
    id: row.id,
    reportId: row.report_id,
    mode: row.mode as "cloud" | "local",
    provider: row.provider,
    model: row.model,
    status: row.status as NarrativeStatus,
    sections: storedRecord && "sections" in storedRecord ? storedRecord.sections ?? null : stored as NarrativeRecord["sections"],
    storyPack: storedRecord?.storyPack ?? null,
    observability: storedRecord?.observability ?? null,
    fallbacksUsed: row.fallbacks_used_json ? parseJson<string[]>(row.fallbacks_used_json, "narrative fallbacks") : [],
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
  const user = await (await database())
    .prepare(
      "SELECT id, handle, display_name, avatar_url, bio, role, status FROM buildstory_users WHERE auth_subject = ? AND deleted_at IS NULL",
    )
    .bind(authSubject)
    .first<{
      id: string;
      handle: string;
      display_name: string;
      avatar_url: string | null;
      bio: string | null;
      role: string;
      status: string;
    }>();
  if (user?.status && user.status !== "active") {
    throw new D1IngestionError("account_suspended", "This creator account is suspended.", 403);
  }
  return user;
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
       ORDER BY j.created_at ASC LIMIT 1`,
    )
    .bind(creatorId)
    .all<{ report_id: string }>();
  if (rows.results[0]) await processReportJob(rows.results[0].report_id);
}

export async function listUploadSessions(
  creatorId: string,
  limit = 100,
  cursor?: string,
): Promise<UploadSessionView[]> {
  await processCreatorJobs(creatorId);
  const bounded = Math.min(Math.max(1, Math.trunc(limit)), 100);
  const rows = await (await database())
    .prepare(
      "SELECT * FROM buildstory_upload_sessions WHERE creator_id = ? AND (? IS NULL OR created_at < ?) ORDER BY created_at DESC LIMIT ?",
    )
    .bind(creatorId, cursor ?? null, cursor ?? null, bounded)
    .all<SessionRow>();
  return rows.results.map(cleanSession);
}

/**
 * Get-or-create the real user row for a signed-in identity. Safe to call on
 * every creator-authenticated request: a pure read when the row already
 * exists, or a race-safe insert with a handle allocated from the
 * reserved-word list and per-attempt uniqueness check when it doesn't. The
 * handle, once set, is sticky - re-running this never changes it. Display
 * name and avatar are seeded from the provider only at creation; once a row
 * exists, this never overwrites them, so a user's own edits in Settings
 * are never clobbered by their next Google sign-in.
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
      "SELECT id, handle, display_name, avatar_url, role, status, handle_changed_at FROM buildstory_users WHERE auth_subject = ?",
    )
    .bind(session.creatorId)
    .first<{ id: string; handle: string; display_name: string; avatar_url: string | null; role: string; status: string; handle_changed_at: string | null }>();
  if (existing) {
    if (existing.status !== "active") throw new D1IngestionError("account_suspended", "This creator account is suspended.", 403);
    return {
      id: existing.id,
      authSubject: session.creatorId,
      handle: existing.handle,
      displayName: existing.display_name,
      avatarUrl: existing.avatar_url,
      role: existing.role as UserRecord["role"],
      handleChangedAt: existing.handle_changed_at,
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
        handleChangedAt: null,
      };
    }
    const raced = await db
      .prepare("SELECT id, handle, display_name, avatar_url, role, status, handle_changed_at FROM buildstory_users WHERE auth_subject = ?")
      .bind(session.creatorId)
      .first<{ id: string; handle: string; display_name: string; avatar_url: string | null; role: string; status: string; handle_changed_at: string | null }>();
    if (raced) {
      if (raced.status !== "active") throw new D1IngestionError("account_suspended", "This creator account is suspended.", 403);
      return {
        id: raced.id,
        authSubject: session.creatorId,
        handle: raced.handle,
        displayName: raced.display_name,
        avatarUrl: raced.avatar_url,
        role: raced.role as UserRecord["role"],
        handleChangedAt: raced.handle_changed_at,
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

export type LinkedIdentity = { userId: string; authSubject: string };

/**
 * Resolves a (provider, subject) pair to the user it's linked to, if any.
 * Used by auth.ts to route a non-original sign-in (e.g. GitHub for a user who
 * signed up with Google) back to that user's original, unchanging authSubject.
 */
export async function findUserByIdentity(provider: string, subject: string): Promise<LinkedIdentity | null> {
  const db = await database();
  const row = await db
    .prepare(
      `SELECT u.id AS user_id, u.auth_subject AS auth_subject
       FROM buildstory_user_identities i
       JOIN buildstory_users u ON u.id = i.user_id
       WHERE i.provider = ? AND i.subject = ? AND u.status = 'active'`,
    )
    .bind(provider, subject)
    .first<{ user_id: string; auth_subject: string }>();
  return row ? { userId: row.user_id, authSubject: row.auth_subject } : null;
}

/**
 * Finds an existing active account by verified email, for auto-linking a new
 * provider sign-in. Callers must only invoke this once they've independently
 * confirmed the incoming email is verified on the new provider's side too -
 * this function itself does not gate on buildstory_users.email_verified_at,
 * since that column predates GitHub support and is unpopulated for existing
 * accounts (which were nonetheless created only via a verified-email flow).
 */
export async function findUserByVerifiedEmail(email: string): Promise<LinkedIdentity | null> {
  const db = await database();
  const row = await db
    .prepare(
      `SELECT id AS user_id, auth_subject AS auth_subject FROM buildstory_users
       WHERE lower(email) = lower(?) AND status = 'active'
       LIMIT 1`,
    )
    .bind(email)
    .first<{ user_id: string; auth_subject: string }>();
  return row ? { userId: row.user_id, authSubject: row.auth_subject } : null;
}

/** Given a user, finds the subject they've linked for a specific provider (e.g. their GitHub numeric user id), if any. */
export async function getIdentityForUser(userId: string, provider: string): Promise<{ subject: string } | null> {
  const db = await database();
  const row = await db
    .prepare("SELECT subject FROM buildstory_user_identities WHERE user_id = ? AND provider = ? LIMIT 1")
    .bind(userId, provider)
    .first<{ subject: string }>();
  return row ? { subject: row.subject } : null;
}

/** Records a (provider, subject) as belonging to userId. Idempotent. */
export async function linkIdentity(userId: string, provider: string, subject: string, email: string): Promise<void> {
  const db = await database();
  await db
    .prepare(
      `INSERT INTO buildstory_user_identities (id, user_id, provider, subject, email, created_at)
       SELECT ?, ?, ?, ?, ?, ?
       WHERE NOT EXISTS (SELECT 1 FROM buildstory_user_identities WHERE provider = ? AND subject = ?)`,
    )
    .bind(makeId("idn"), userId, provider, subject, email, new Date().toISOString(), provider, subject)
    .run();
}

/** Hygiene: records that this account's email has been asserted verified by an OAuth provider, if not already. */
export async function markEmailVerified(userId: string): Promise<void> {
  const db = await database();
  await db
    .prepare(`UPDATE buildstory_users SET email_verified_at = ? WHERE id = ? AND email_verified_at IS NULL`)
    .bind(new Date().toISOString(), userId)
    .run();
}

const HANDLE_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_BIO_LENGTH = 280;
const MAX_DISPLAY_NAME_LENGTH = 80;

export type ProfileUpdateResult = {
  id: string;
  handle: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  handleChangedAt: string | null;
};

type ProfileRow = {
  id: string;
  handle: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  handle_changed_at: string | null;
};

function profileUpdateResultFromRow(row: ProfileRow): ProfileUpdateResult {
  return {
    id: row.id,
    handle: row.handle,
    displayName: row.display_name,
    bio: row.bio,
    avatarUrl: row.avatar_url,
    handleChangedAt: row.handle_changed_at,
  };
}

/**
 * Self-service profile edits: bio and display name are always editable;
 * the handle may be changed exactly once (handle_changed_at is null until
 * spent). Google sign-in never touches these fields once the row exists -
 * see ensureUser.
 */
export async function updateProfile(
  userId: string,
  update: { bio?: string; displayName?: string; handle?: string },
): Promise<ProfileUpdateResult> {
  const db = await database();
  const existing = await db
    .prepare("SELECT id, handle, display_name, bio, avatar_url, handle_changed_at FROM buildstory_users WHERE id = ?")
    .bind(userId)
    .first<ProfileRow>();
  if (!existing) throw new D1IngestionError("not_found", "Account not found.", 404);

  const sets: string[] = [];
  const values: unknown[] = [];

  if (update.bio !== undefined) {
    sets.push("bio = ?");
    values.push(update.bio.trim().slice(0, MAX_BIO_LENGTH) || null);
  }

  if (update.displayName !== undefined) {
    const displayName = update.displayName.trim().slice(0, MAX_DISPLAY_NAME_LENGTH);
    if (!displayName) throw new D1IngestionError("invalid_display_name", "Display name cannot be empty.", 422);
    sets.push("display_name = ?");
    values.push(displayName);
  }

  if (update.handle !== undefined && update.handle.trim().toLocaleLowerCase("en-US") !== existing.handle.toLocaleLowerCase("en-US")) {
    if (existing.handle_changed_at) {
      throw new D1IngestionError("handle_already_changed", "You've already used your one handle change.", 422);
    }
    const handle = update.handle.trim().toLocaleLowerCase("en-US");
    if (handle.length < 3 || handle.length > 32 || !HANDLE_PATTERN.test(handle)) {
      throw new D1IngestionError(
        "invalid_handle",
        "Handles must be 3-32 characters: lowercase letters, numbers, and single hyphens between them.",
        422,
      );
    }
    if (isReservedHandle(handle)) {
      throw new D1IngestionError("handle_reserved", "That handle is reserved.", 422);
    }
    const taken = await db
      .prepare("SELECT id FROM buildstory_users WHERE handle_lower = ? AND id != ?")
      .bind(handle, userId)
      .first();
    if (taken) throw new D1IngestionError("handle_taken", "That handle is already taken.", 422);
    sets.push("handle = ?", "handle_lower = ?", "handle_changed_at = ?");
    values.push(handle, handle, new Date().toISOString());
  }

  if (sets.length === 0) return profileUpdateResultFromRow(existing);

  sets.push("updated_at = ?");
  values.push(new Date().toISOString(), userId);
  await db.prepare(`UPDATE buildstory_users SET ${sets.join(", ")} WHERE id = ?`).bind(...values).run();

  const updated = await db
    .prepare("SELECT id, handle, display_name, bio, avatar_url, handle_changed_at FROM buildstory_users WHERE id = ?")
    .bind(userId)
    .first<ProfileRow>();
  return profileUpdateResultFromRow(updated!);
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
          sections_json, fallbacks_used_json, input_tokens, output_tokens, cost_micro_usd, created_at, updated_at
        )
        SELECT ?, ?, ?, 'cloud', '', '', ?, 'queued', NULL, '[]', 0, 0, 0, ?, ?
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

async function storeLocalNarrative(
  reportId: string,
  ownerUserId: string,
  generated: ScannerProjectSnapshot["generatedNarrative"] | undefined,
  model: string | null,
): Promise<void> {
  const db = await database();
  const now = new Date().toISOString();
  await db.prepare(
    `INSERT INTO buildstory_narratives (
      id, report_id, owner_user_id, mode, provider, model, prompt_version, status,
      sections_json, fallbacks_used_json, input_tokens, output_tokens, cost_micro_usd, created_at, updated_at
    ) VALUES (?, ?, ?, 'local', ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?)`
  ).bind(
    makeId("nar"),
    reportId,
    ownerUserId,
    generated?.provider ?? "ollama",
    generated?.model ?? model ?? "auto",
    NARRATIVE_PROMPT_VERSION,
    generated ? "ready" : "failed",
    generated ? JSON.stringify({ sections: generated.sections, storyPack: generated.storyPack, observability: { providerCounts: {}, promptVersion: NARRATIVE_PROMPT_VERSION, schemaVersion: PROJECT_SNAPSHOT_SCHEMA_VERSION, generationLatencyMs: 0, inputTokens: 0, outputTokens: 0, costMicroUsd: 0, invalidReferenceCount: 0, fallbackCount: generated.fallbacksUsed.length } }) : null,
    JSON.stringify(generated?.fallbacksUsed ?? []),
    now,
    now,
  ).run();
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
    await db
      .prepare("UPDATE buildstory_narratives SET status = 'generating', updated_at = ? WHERE id = ? AND status = 'queued'")
      .bind(nowIso, narrativeId)
      .run();
    const narrative = await db
      .prepare("SELECT * FROM buildstory_narratives WHERE id = ?")
      .bind(narrativeId)
      .first<NarrativeRow>();
    if (!narrative) throw new Error(`Narrative ${narrativeId} not found for a claimed job.`);

    if (!canUseCloudNarrative(narrative.owner_user_id)) {
      throw new NarrativeProviderError("llm_not_entitled", "Cloud narrative generation is not enabled for this account.");
    }
    const report = await reportById(narrative.report_id);
    if (!report) throw new Error(`Report ${narrative.report_id} not found for narrative ${narrativeId}.`);
    if (!narrativeProviderConfigured("cloud")) {
      throw new NarrativeProviderError("llm_not_configured", "No narrative provider is configured.");
    }
    if (!(await hasNarrativeBudget(db, narrative.owner_user_id))) {
      throw new NarrativeProviderError("llm_budget_exceeded", "Monthly narrative budget has been reached.");
    }

    const sourceSnapshot = parseJson<ScannerProjectSnapshot>(report.source_snapshot_json, "source snapshot");

    const session = await sessionById(report.upload_session_id);
    const result = await generateNarrative(sourceSnapshot, session?.narrative_model);
    const sanitizedSections = {
      headline: sanitizePublicText(result.sections.headline, NARRATIVE_FIELD_LIMITS.headline).value,
      narrative: sanitizePublicText(result.sections.narrative, NARRATIVE_FIELD_LIMITS.narrative).value,
      turningPoint: sanitizePublicText(result.sections.turningPoint, NARRATIVE_FIELD_LIMITS.turningPoint).value,
      learnings: result.sections.learnings.map(
        (line) => sanitizePublicText(line, NARRATIVE_FIELD_LIMITS.learningItem).value,
      ),
      decisionPatterns: result.sections.decisionPatterns.map(
        (line) => sanitizePublicText(line, NARRATIVE_FIELD_LIMITS.decisionPatternItem).value,
      ),
      standoutTraits: result.sections.standoutTraits.map(
        (line) => sanitizePublicText(line, NARRATIVE_FIELD_LIMITS.standoutTraitItem).value,
      ),
      growthEdge: sanitizePublicText(result.sections.growthEdge, NARRATIVE_FIELD_LIMITS.growthEdge).value,
    };
    const costMicroUsd = estimateCostMicroUsd(result.model, result.inputTokens, result.outputTokens);
    const observability = {
      providerCounts: Object.fromEntries(sourceSnapshot.sourceSelection.providers.map((item) => [item.provider, item.sessionsIncluded])),
      promptVersion: NARRATIVE_PROMPT_VERSION,
      schemaVersion: sourceSnapshot.schemaVersion,
      generationLatencyMs: result.generationLatencyMs,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costMicroUsd,
      invalidReferenceCount: result.invalidReferenceCount,
      fallbackCount: result.fallbacksUsed.length,
    };
    const reportSnapshot = parseJson<ProjectSnapshot>(report.snapshot_json, "report snapshot");
    reportSnapshot.narrative = { ...sanitizedSections, storyPack: result.storyPack };

    await db.batch([
      db
        .prepare(
          `UPDATE buildstory_narratives
           SET status = 'ready', provider = ?, model = ?, sections_json = ?,
               input_tokens = ?, output_tokens = ?, cost_micro_usd = ?, fallbacks_used_json = ?, last_error_code = NULL, updated_at = ?
           WHERE id = ? AND status != 'failed'`,
        )
        .bind(
          result.provider,
          result.model,
           JSON.stringify({ sections: sanitizedSections, storyPack: result.storyPack, observability }),
          result.inputTokens,
          result.outputTokens,
          costMicroUsd,
          JSON.stringify(result.fallbacksUsed),
          nowIso,
          narrativeId,
        ),
      db
        .prepare(
          "UPDATE buildstory_narrative_jobs SET status = 'completed', lease_until = NULL, last_error_code = NULL, updated_at = ? WHERE narrative_id = ?",
        )
        .bind(nowIso, narrativeId),
      db
        .prepare("UPDATE buildstory_reports SET snapshot_json = ?, updated_at = ? WHERE id = ?")
        .bind(JSON.stringify(reportSnapshot), nowIso, narrative.report_id),
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
  narrativeModel: string | null = null,
  narrativeMode: "local" | "cloud" | "off" = "cloud",
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
        id, creator_id, owner_user_id, project_label, narrative_model, narrative_mode, status, created_at, expires_at,
        status_detail, device_code_hash, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'awaiting_scanner', ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      creatorId,
      ownerUserId,
      label,
      narrativeModel,
      narrativeMode,
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
    narrativeModel,
    narrativeMode,
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
      commandHint: `buildstory-scan connect "${id}" --code "${deviceCode}" --api-base-url "${normalizedApiBaseUrl}"${allowHostFlag}`,
      scanUploadCommandHint:
        "buildstory-scan scan-upload --repo . --consent local-scan --upload-consent local-dashboard",
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
  narrativeModes?: Array<"local" | "cloud" | "off">,
): Promise<ScannerClaimResponse> {
  const row = await sessionById(sessionId);
  const codeHash = await hashToken(userCode.trim().toUpperCase());
  const rejectConnection = (): never => {
    throw new D1IngestionError("connect_rejected", "Connection could not be authorized.", 401);
  };
  if (!row) throw new D1IngestionError("connect_rejected", "Connection could not be authorized.", 401);
  if (row.device_code_attempts >= 5 || row.device_code_hash !== codeHash) {
    if (!row.device_code_claimed_at && row.device_code_attempts < 5 && row.device_code_hash !== codeHash) {
      await (await database())
        .prepare("UPDATE buildstory_upload_sessions SET device_code_attempts = MIN(device_code_attempts + 1, 5), updated_at = ? WHERE id = ? AND device_code_claimed_at IS NULL")
        .bind(new Date().toISOString(), sessionId)
        .run();
    }
    rejectConnection();
  }
  if (Date.parse(row.expires_at) <= Date.now()) {
    await (await database())
      .prepare(
        "UPDATE buildstory_upload_sessions SET status = 'expired', status_detail = 'Connection code expired before the scanner claimed it.', updated_at = ? WHERE id = ?",
      )
      .bind(new Date().toISOString(), sessionId)
      .run();
    rejectConnection();
  }
  if (row.device_code_claimed_at) {
    rejectConnection();
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
    rejectConnection();
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
    ...(narrativeModes ? { narrative: { mode: row.narrative_mode === "local" || row.narrative_mode === "off" ? row.narrative_mode : "cloud", model: row.narrative_model } } : {}),
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
          editorial_tagline, editorial_description, editorial_reflection, category,
          publication_status, publication_slug, updated_at
        )
        SELECT ?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?, ?, '', NULL, 'not_published', ?, ?
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
  if (validated.snapshot.generatedNarrative) {
    await storeLocalNarrative(reportId, user.id, validated.snapshot.generatedNarrative, row.narrative_model);
  } else if (row.narrative_mode === "local") {
    await storeLocalNarrative(reportId, user.id, undefined, row.narrative_model);
  } else if (validated.snapshot.narrativeEvidence && validated.snapshot.narrativeEvidence.excerpts.length > 0) {
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
    artifact?: ArtifactLinksUpdate;
    category?: GeneratedReport["category"];
    storyBackgroundId?: GeneratedReport["storyBackgroundId"];
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
  const artifact = { ...report.artifact };
  for (const key of ["projectUrl", "repoUrl", "videoUrl"] as const) {
    const value = update.artifact?.[key];
    if (value !== undefined) {
      const normalized = normalizeArtifactUrl(value);
      if (!normalized.ok) {
        throw new D1IngestionError(
          "invalid_artifact_url",
          "Artifact links must be well-formed https URLs with no embedded credentials.",
          422,
        );
      }
      artifact[key] = normalized.value;
    }
  }
  const category = update.category === undefined ? report.category : update.category;
  const validCategories = ["web-apps", "developer-tools", "saas", "ai-ml", "design-tools", "automation", "data-analytics", "productivity", "games", "other"];
  if (category !== null && !validCategories.includes(category)) {
    throw new D1IngestionError("invalid_category", "Choose a valid project category.", 422);
  }
  const storyBackgroundId = update.storyBackgroundId === undefined ? report.storyBackgroundId : update.storyBackgroundId;
  if (!isStoryBackgroundId(storyBackgroundId)) {
    throw new D1IngestionError("invalid_story_background", "Choose a valid story background.", 422);
  }
  const now = new Date().toISOString();
  await (await database())
    .prepare(
      `UPDATE buildstory_reports
       SET selected_public_fields_json = ?, editorial_tagline = ?, editorial_description = ?,
           editorial_reflection = ?, category = ?, story_background_id = ?,
           artifact_project_url = ?, artifact_repo_url = ?, artifact_video_url = ?,
           publication_status = CASE WHEN publication_status = 'published' THEN 'draft_changes' ELSE publication_status END,
           updated_at = ?
       WHERE id = ? AND creator_id = ?`,
    )
    .bind(
      JSON.stringify(fields),
      editorial.tagline,
      editorial.description,
      editorial.reflection,
      category,
      storyBackgroundId,
      artifact.projectUrl,
      artifact.repoUrl,
      artifact.videoUrl,
      now,
      reportId,
      creatorId,
    )
    .run();
  return getReport(creatorId, reportId);
}

type ReportMediaRow = {
  id: string;
  report_id: string;
  owner_user_id: string;
  r2_key: string;
  content_type: string;
  byte_size: number;
  kind: string;
  sort_order: number;
};

function mediaFromRow(row: ReportMediaRow): ReportMediaRecord {
  return {
    id: row.id,
    reportId: row.report_id,
    ownerUserId: row.owner_user_id,
    r2Key: row.r2_key,
    contentType: row.content_type,
    byteSize: row.byte_size,
    kind: row.kind as ReportMediaKind,
    sortOrder: row.sort_order,
    url: mediaPublicUrl(row.r2_key),
  };
}

/** Public boundary: media metadata only, gated by the artifactMedia PublicFieldKey by the caller. */
export async function listReportMedia(reportId: string): Promise<ReportMediaRecord[]> {
  const rows = await (await database())
    .prepare(
      "SELECT id, report_id, owner_user_id, r2_key, content_type, byte_size, kind, sort_order FROM buildstory_report_media WHERE report_id = ? ORDER BY sort_order ASC, created_at ASC",
    )
    .bind(reportId)
    .all<ReportMediaRow>();
  return rows.results.map(mediaFromRow);
}

/**
 * Registers an already-uploaded R2 object against a report. Never accepts
 * bytes itself - the API route puts the object to R2 first, then calls this
 * to record the metadata row, so this function can stay a pure D1 write.
 */
export async function addReportMedia(
  creatorId: string,
  reportId: string,
  media: { r2Key: string; contentType: string; byteSize: number; kind: ReportMediaKind },
): Promise<ReportMediaRecord> {
  const report = await getReport(creatorId, reportId);
  if (report.status !== "ready") {
    throw new D1IngestionError("report_not_ready", "Report is not ready to edit.", 409);
  }
  const owner = await userByAuthSubject(creatorId);
  if (!owner) throw new D1IngestionError("not_found", "Creator account not found.", 404);
  const existing = await listReportMedia(reportId);
  if (existing.length >= MAX_MEDIA_PER_REPORT) {
    throw new D1IngestionError(
      "media_limit_reached",
      `A report can have at most ${MAX_MEDIA_PER_REPORT} images.`,
      422,
    );
  }
  const id = makeId("med");
  const now = new Date().toISOString();
  await (await database())
    .prepare(
      "INSERT INTO buildstory_report_media (id, report_id, owner_user_id, r2_key, content_type, byte_size, kind, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(id, reportId, owner.id, media.r2Key, media.contentType, media.byteSize, media.kind, existing.length, now)
    .run();
  return {
    id,
    reportId,
    ownerUserId: owner.id,
    r2Key: media.r2Key,
    contentType: media.contentType,
    byteSize: media.byteSize,
    kind: media.kind,
    sortOrder: existing.length,
    url: mediaPublicUrl(media.r2Key),
  };
}

/** Returns the deleted row's r2Key so the caller can also remove the R2 object; deletes nothing if the media doesn't belong to this creator. */
export async function deleteReportMedia(creatorId: string, mediaId: string): Promise<{ r2Key: string }> {
  const owner = await userByAuthSubject(creatorId);
  if (!owner) throw new D1IngestionError("not_found", "Creator account not found.", 404);
  const row = await (await database())
    .prepare("SELECT id, r2_key FROM buildstory_report_media WHERE id = ? AND owner_user_id = ?")
    .bind(mediaId, owner.id)
    .first<{ id: string; r2_key: string }>();
  if (!row) throw new D1IngestionError("not_found", "Media not found.", 404);
  await (await database()).prepare("DELETE FROM buildstory_report_media WHERE id = ?").bind(mediaId).run();
  return { r2Key: row.r2_key };
}

/**
 * Publishing is chapter-aware: a project can have several simultaneously-published
 * reports now, one per chapter, each at its own path. Exactly one - the one with the
 * highest chapter_index - holds the canonical (extensionless) path; older ones live at
 * "<canonical>/<chapterIndex>". Publishing a report that isn't the project's highest
 * chapter (e.g. republishing an old draft out of order) never touches the current
 * canonical chapter. See db/schema.ts's chapterIndex comment for the full model.
 */
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
  if (!report.category) {
    throw new D1IngestionError("missing_category", "Choose a project category before publishing.", 422);
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
  const owner = await userByAuthSubject(creatorId);
  if (!owner) throw new D1IngestionError("not_found", "Creator account not found.", 404);

  const db = await database();
  const existing = await db
    .prepare("SELECT chapter_index FROM buildstory_reports WHERE id = ?")
    .bind(reportId)
    .first<{ chapter_index: number | null }>();
  let chapterIndex = existing?.chapter_index ?? null;
  if (chapterIndex === null) {
    const maxRow = await db
      .prepare("SELECT MAX(chapter_index) AS max_chapter FROM buildstory_reports WHERE project_id = ?")
      .bind(report.projectId)
      .first<{ max_chapter: number | null }>();
    chapterIndex = (maxRow?.max_chapter ?? 0) + 1;
  }

  const currentCanonical = await db
    .prepare(
      `SELECT id, chapter_index FROM buildstory_reports
       WHERE project_id = ? AND publication_status = 'published' AND id != ?
       ORDER BY chapter_index DESC LIMIT 1`,
    )
    .bind(report.projectId, reportId)
    .first<{ id: string; chapter_index: number }>();

  const becomesCanonical = !currentCanonical || currentCanonical.chapter_index < chapterIndex;
  const handle = owner.handle.toLocaleLowerCase("en-US");
  const canonicalPath = `${handle}/${report.publication.slug}`;
  const canonicalUrl = `${publicOrigin()}/u/${owner.handle}/${report.publication.slug}`;
  const publishedAt = new Date().toISOString();

  const statements = [];
  if (becomesCanonical && currentCanonical) {
    statements.push(
      db
        .prepare("UPDATE buildstory_reports SET publication_path = ?, public_url = ?, updated_at = ? WHERE id = ?")
        .bind(`${canonicalPath}/${currentCanonical.chapter_index}`, `${canonicalUrl}/${currentCanonical.chapter_index}`, publishedAt, currentCanonical.id),
    );
  }
  const thisPath = becomesCanonical ? canonicalPath : `${canonicalPath}/${chapterIndex}`;
  const thisUrl = becomesCanonical ? canonicalUrl : `${canonicalUrl}/${chapterIndex}`;
  const publicStory = publicBuildStoryFromSnapshot(
    report.snapshot,
    report.selectedPublicFields,
    { reflection: report.editorial.reflection, category: report.category },
    { ...report.artifact, media: await listReportMedia(reportId) },
    { storyBackgroundId: report.storyBackgroundId },
  );
  const publicCoverUrl = publicStory.artifactMedia.find((item) => item.kind === "cover")?.url ?? publicStory.artifactMedia[0]?.url ?? null;
  const publicSearchText = [publicStory.name, publicStory.tagline, publicStory.description, publicStory.owner.name, publicStory.owner.handle, publicStory.category, ...publicStory.stack, ...publicStory.tools.map((tool) => tool.label), ...publicStory.models.map((model) => model.label)].join(" ").slice(0, 12_000);
  statements.push(
    db
      .prepare(
        `UPDATE buildstory_reports SET publication_status = 'published', publication_path = ?, published_at = ?, public_url = ?, chapter_index = ?, updated_at = ?
         WHERE id = ? AND creator_id = ?`,
      )
      .bind(thisPath, publishedAt, thisUrl, chapterIndex, publishedAt, reportId, creatorId),
  );
  statements.push(
    db.prepare(`INSERT INTO buildstory_public_story_index (report_id, story_json, category, search_text, has_live_demo, cover_url, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(report_id) DO UPDATE SET story_json = excluded.story_json, category = excluded.category, search_text = excluded.search_text, has_live_demo = excluded.has_live_demo, cover_url = excluded.cover_url, updated_at = excluded.updated_at`)
      .bind(reportId, JSON.stringify(publicStory), report.category, publicSearchText, publicStory.artifactLinks.projectUrl ? 1 : 0, publicCoverUrl, publishedAt),
  );
  statements.push(db.prepare("DELETE FROM buildstory_public_story_facets WHERE report_id = ?").bind(reportId));
  statements.push(db.prepare("INSERT INTO buildstory_public_story_facets (id, report_id, kind, facet_key, label, weight) VALUES (?, ?, 'category', ?, ?, 1)").bind(makeId("facet"), reportId, report.category, report.category));
  const publicFacetTools = new Map(
    [...publicStory.stack, ...publicStory.tools.map((item) => item.label)].map((tool) => [tool.toLocaleLowerCase("en-US"), tool]),
  );
  for (const tool of publicFacetTools.values()) {
    statements.push(db.prepare("INSERT INTO buildstory_public_story_facets (id, report_id, kind, facet_key, label, weight) VALUES (?, ?, 'tool', ?, ?, 1)").bind(makeId("facet"), reportId, tool.toLocaleLowerCase("en-US"), tool));
  }
  for (const model of new Map(publicStory.models.map((item) => [item.id.toLocaleLowerCase("en-US"), item])).values()) {
    statements.push(db.prepare("INSERT INTO buildstory_public_story_facets (id, report_id, kind, facet_key, label, weight) VALUES (?, ?, 'model', ?, ?, ?)").bind(makeId("facet"), reportId, model.id.toLocaleLowerCase("en-US"), model.label, model.requests));
  }

  try {
    await db.batch(statements);
  } catch {
    throw new D1IngestionError("publication_path_conflict", "That public project path is already in use.", 409);
  }
  return getReport(creatorId, reportId);
}

/**
 * Unpublishing the canonical chapter promotes the next-highest still-published
 * chapter (if any) to the canonical path, so the project's main URL never dangles
 * while older chapters remain live.
 */
export async function unpublishReport(creatorId: string, reportId: string): Promise<GeneratedReport> {
  const db = await database();
  const row = await db
    .prepare(
      "SELECT project_id, publication_path FROM buildstory_reports WHERE id = ? AND creator_id = ? AND publication_status = 'published'",
    )
    .bind(reportId, creatorId)
    .first<{ project_id: string; publication_path: string | null }>();
  if (!row) throw new D1IngestionError("not_published", "Published report not found.", 404);

  const now = new Date().toISOString();
  const statements = [
    db
      .prepare(
        "UPDATE buildstory_reports SET publication_status = 'not_published', publication_path = NULL, published_at = NULL, public_url = NULL, updated_at = ? WHERE id = ?",
      )
      .bind(now, reportId),
    db.prepare("DELETE FROM buildstory_public_story_index WHERE report_id = ?").bind(reportId),
    db.prepare("DELETE FROM buildstory_public_story_facets WHERE report_id = ?").bind(reportId),
  ];

  const wasCanonical = Boolean(row.publication_path) && !/\/\d+$/.test(row.publication_path!);
  if (wasCanonical) {
    const next = await db
      .prepare(
        `SELECT id, publication_slug FROM buildstory_reports
         WHERE project_id = ? AND publication_status = 'published' AND id != ?
         ORDER BY chapter_index DESC LIMIT 1`,
      )
      .bind(row.project_id, reportId)
      .first<{ id: string; publication_slug: string }>();
    if (next) {
      const owner = await userByAuthSubject(creatorId);
      if (owner) {
        const canonicalPath = `${owner.handle.toLocaleLowerCase("en-US")}/${next.publication_slug}`;
        const canonicalUrl = `${publicOrigin()}/u/${owner.handle}/${next.publication_slug}`;
        statements.push(
          db
            .prepare("UPDATE buildstory_reports SET publication_path = ?, public_url = ?, updated_at = ? WHERE id = ?")
            .bind(canonicalPath, canonicalUrl, now, next.id),
        );
      }
    }
  }
  await db.batch(statements);
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

export async function renameProjectSlug(
  creatorId: string,
  projectId: string,
  requestedSlug: string,
): Promise<ProjectRecord> {
  const owner = await userByAuthSubject(creatorId);
  if (!owner) throw new D1IngestionError("not_found", "Creator account not found.", 404);
  const slug = baseSlugFrom(requestedSlug);
  if (slug !== requestedSlug.trim().toLocaleLowerCase("en-US") || ![...candidateSlugs(slug)].includes(slug)) {
    throw new D1IngestionError("invalid_project_slug", "Project slugs may use lowercase letters, numbers, and hyphens.", 422);
  }
  const existing = await (await database()).prepare(
    "SELECT id, owner_user_id, slug, name, repository_fingerprint FROM buildstory_projects WHERE id = ? AND owner_user_id = ?",
  ).bind(projectId, owner.id).first<{ id: string; owner_user_id: string; slug: string; name: string; repository_fingerprint: string }>();
  if (!existing) throw new D1IngestionError("not_found", "Project not found.", 404);
  try {
    await (await database()).prepare(
      "UPDATE buildstory_projects SET slug = ?, updated_at = ? WHERE id = ? AND owner_user_id = ?",
    ).bind(slug, new Date().toISOString(), projectId, owner.id).run();
  } catch {
    throw new D1IngestionError("project_slug_conflict", "That project slug is already in use.", 409, [...candidateSlugs(slug)].slice(1, 4));
  }
  return { id: existing.id, ownerUserId: existing.owner_user_id, slug, name: existing.name, repositoryFingerprint: existing.repository_fingerprint };
}

export type ProjectVerificationDetail = {
  id: string;
  ownerUserId: string;
  repositoryFingerprint: string;
  fingerprintBasis: string;
  verifiedRepoAt: string | null;
};

/** Owner-scoped read for the repo-verification flow. */
export async function getProjectForVerification(creatorId: string, projectId: string): Promise<ProjectVerificationDetail> {
  const owner = await userByAuthSubject(creatorId);
  if (!owner) throw new D1IngestionError("not_found", "Creator account not found.", 404);
  const row = await (await database())
    .prepare(
      "SELECT id, owner_user_id, repository_fingerprint, fingerprint_basis, verified_repo_at FROM buildstory_projects WHERE id = ? AND owner_user_id = ?",
    )
    .bind(projectId, owner.id)
    .first<{ id: string; owner_user_id: string; repository_fingerprint: string; fingerprint_basis: string; verified_repo_at: string | null }>();
  if (!row) throw new D1IngestionError("not_found", "Project not found.", 404);
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    repositoryFingerprint: row.repository_fingerprint,
    fingerprintBasis: row.fingerprint_basis,
    verifiedRepoAt: row.verified_repo_at,
  };
}

/**
 * Marks a project's repository as ownership-verified. The caller (the
 * verify-repo API route) must have already independently confirmed the
 * match - both that the linked GitHub account's numeric id owns the repo,
 * and that the repo's recomputed fingerprint matches this project's stored
 * one - before calling this; it performs no verification itself.
 */
export async function markProjectRepoVerified(creatorId: string, projectId: string): Promise<{ verifiedRepoAt: string }> {
  const owner = await userByAuthSubject(creatorId);
  if (!owner) throw new D1IngestionError("not_found", "Creator account not found.", 404);
  const now = new Date().toISOString();
  const result = await (await database())
    .prepare("UPDATE buildstory_projects SET verified_repo_at = ?, updated_at = ? WHERE id = ? AND owner_user_id = ?")
    .bind(now, now, projectId, owner.id)
    .run();
  if (changes(result) !== 1) throw new D1IngestionError("not_found", "Project not found.", 404);
  return { verifiedRepoAt: now };
}

/** Public read: a project's verification status by its published story's handle/slug, for the "Verified" chip. Null if the story or project can't be found. */
export async function getPublicProjectVerification(handle: string, slug: string): Promise<string | null> {
  const row = await (await database())
    .prepare(
      `SELECT p.verified_repo_at AS verified_repo_at
       FROM buildstory_projects p
       JOIN buildstory_reports r ON r.project_id = p.id
       JOIN buildstory_users u ON u.id = p.owner_user_id
       WHERE u.handle_lower = ? AND r.publication_slug = ? AND r.publication_status = 'published'
       LIMIT 1`,
    )
    .bind(handle.toLocaleLowerCase("en-US"), slug)
    .first<{ verified_repo_at: string | null }>();
  return row?.verified_repo_at ?? null;
}

/** Public boundary: this query does not select the private source snapshot. */
export async function getPublishedStoryBySlug(slug: string) {
  const row = await (await database())
    .prepare(
      `SELECT id AS report_id, snapshot_json, selected_public_fields_json, editorial_tagline, editorial_description, editorial_reflection, category, story_background_id,
              artifact_project_url, artifact_repo_url, artifact_video_url
       FROM buildstory_reports
       WHERE publication_slug = ? AND publication_status = 'published'
       ORDER BY chapter_index DESC LIMIT 1`,
    )
    .bind(slug)
    .first<{
      snapshot_json: string;
      selected_public_fields_json: string;
      editorial_tagline: string;
      editorial_description: string;
      editorial_reflection: string;
      category: string | null;
      story_background_id: string;
      report_id: string;
      artifact_project_url: string | null;
      artifact_repo_url: string | null;
      artifact_video_url: string | null;
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
  const media = await listReportMedia(row.report_id);
  return {
    ...publicBuildStoryFromSnapshot(snapshot, selected, { reflection: row.editorial_reflection, category: row.category as GeneratedReport["category"] }, {
      projectUrl: row.artifact_project_url,
      repoUrl: row.artifact_repo_url,
      videoUrl: row.artifact_video_url,
      media,
    }, { storyBackgroundId: isStoryBackgroundId(row.story_background_id) ? row.story_background_id : DEFAULT_STORY_BACKGROUND_ID }),
    reportId: row.report_id,
  };
}

export async function getPublishedStory(handle: string, slug: string) {
  const row = await (await database()).prepare(
    `SELECT r.id AS report_id, r.snapshot_json, r.selected_public_fields_json, r.editorial_tagline, r.editorial_description, r.editorial_reflection, r.category, r.story_background_id,
            r.artifact_project_url, r.artifact_repo_url, r.artifact_video_url
     FROM buildstory_reports r JOIN buildstory_users u ON u.id = r.owner_user_id
     WHERE u.handle_lower = ? AND r.publication_slug = ? AND r.publication_path = ? AND r.publication_status = 'published' LIMIT 1`,
  ).bind(handle.toLocaleLowerCase("en-US"), slug, `${handle.toLocaleLowerCase("en-US")}/${slug}`).first<{
    report_id: string; snapshot_json: string; selected_public_fields_json: string; editorial_tagline: string; editorial_description: string; editorial_reflection: string; category: string | null; story_background_id: string;
    artifact_project_url: string | null; artifact_repo_url: string | null; artifact_video_url: string | null;
  }>();
  if (!row) return null;
  const snapshot = parseJson<ProjectSnapshot>(row.snapshot_json, "public report");
  const selected = parseJson<PublicFieldKey[]>(row.selected_public_fields_json, "public field");
  snapshot.identity.tagline = row.editorial_tagline;
  snapshot.identity.description = row.editorial_description;
  snapshot.identity.visibility = "public";
  const media = await listReportMedia(row.report_id);
  return {
    ...publicBuildStoryFromSnapshot(snapshot, selected, { reflection: row.editorial_reflection, category: row.category as GeneratedReport["category"] }, {
      projectUrl: row.artifact_project_url,
      repoUrl: row.artifact_repo_url,
      videoUrl: row.artifact_video_url,
      media,
    }, { storyBackgroundId: isStoryBackgroundId(row.story_background_id) ? row.story_background_id : DEFAULT_STORY_BACKGROUND_ID }),
    reportId: row.report_id,
  };
}

/** A specific chapter of a project's public story, by its 1-based chapterIndex - used for the archival "<slug>/<n>" path. */
export async function getPublishedStoryChapter(handle: string, slug: string, chapterIndex: number) {
  const row = await (await database()).prepare(
    `SELECT r.id AS report_id, r.snapshot_json, r.selected_public_fields_json, r.editorial_tagline, r.editorial_description, r.editorial_reflection, r.category, r.story_background_id,
            r.artifact_project_url, r.artifact_repo_url, r.artifact_video_url
     FROM buildstory_reports r JOIN buildstory_users u ON u.id = r.owner_user_id
     WHERE u.handle_lower = ? AND r.publication_slug = ? AND r.publication_status = 'published' AND r.chapter_index = ? LIMIT 1`,
  ).bind(handle.toLocaleLowerCase("en-US"), slug, chapterIndex).first<{
    report_id: string; snapshot_json: string; selected_public_fields_json: string; editorial_tagline: string; editorial_description: string; editorial_reflection: string; category: string | null; story_background_id: string;
    artifact_project_url: string | null; artifact_repo_url: string | null; artifact_video_url: string | null;
  }>();
  if (!row) return null;
  const snapshot = parseJson<ProjectSnapshot>(row.snapshot_json, "public report");
  const selected = parseJson<PublicFieldKey[]>(row.selected_public_fields_json, "public field");
  snapshot.identity.tagline = row.editorial_tagline;
  snapshot.identity.description = row.editorial_description;
  snapshot.identity.visibility = "public";
  const media = await listReportMedia(row.report_id);
  return {
    ...publicBuildStoryFromSnapshot(snapshot, selected, { reflection: row.editorial_reflection, category: row.category as GeneratedReport["category"] }, {
      projectUrl: row.artifact_project_url,
      repoUrl: row.artifact_repo_url,
      videoUrl: row.artifact_video_url,
      media,
    }, { storyBackgroundId: isStoryBackgroundId(row.story_background_id) ? row.story_background_id : DEFAULT_STORY_BACKGROUND_ID }),
    reportId: row.report_id,
  };
}

export type PublishedChapterSummary = {
  reportId: string;
  chapterIndex: number;
  publishedAt: string | null;
  tagline: string;
  commits: number;
  activeDays: number;
  costMicroUsd: number | null;
};

/** All currently-published chapters of a project, oldest first - powers the timeline nav. */
export async function listPublishedChapters(handle: string, slug: string): Promise<PublishedChapterSummary[]> {
  const db = await database();
  const canonical = await db
    .prepare(
      `SELECT r.project_id FROM buildstory_reports r JOIN buildstory_users u ON u.id = r.owner_user_id
       WHERE u.handle_lower = ? AND r.publication_path = ? AND r.publication_status = 'published' LIMIT 1`,
    )
    .bind(handle.toLocaleLowerCase("en-US"), `${handle.toLocaleLowerCase("en-US")}/${slug}`)
    .first<{ project_id: string }>();
  if (!canonical) return [];
  const rows = await db
    .prepare(
      `SELECT id, chapter_index, published_at, editorial_tagline, snapshot_json FROM buildstory_reports
       WHERE project_id = ? AND publication_status = 'published' ORDER BY chapter_index ASC`,
    )
    .bind(canonical.project_id)
    .all<{ id: string; chapter_index: number | null; published_at: string | null; editorial_tagline: string; snapshot_json: string }>();
  return rows.results.map((row) => {
    const snapshot = parseJson<ProjectSnapshot>(row.snapshot_json, "public report");
    return {
      reportId: row.id,
      chapterIndex: row.chapter_index ?? 1,
      publishedAt: row.published_at,
      tagline: row.editorial_tagline,
      commits: snapshot.git.commits,
      activeDays: snapshot.timeWindow.activeDays,
      costMicroUsd: snapshot.usage.cost?.totalMicroUsd ?? null,
    };
  });
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

export async function getPublicStoryIdentityByReportId(reportId: string) {
  const row = await (await database()).prepare(
    "SELECT id, owner_user_id FROM buildstory_reports WHERE id = ? AND publication_status = 'published' LIMIT 1",
  ).bind(reportId).first<{ id: string; owner_user_id: string | null }>();
  return row ? { reportId: row.id, ownerUserId: row.owner_user_id } : null;
}

/**
 * Public boundary: this query does not select the private source snapshot.
 * Newest published stories first, capped for a single feed page.
 */
/**
 * A project can now have several simultaneously-published reports (one per chapter -
 * see db/schema.ts's chapterIndex comment). List/search views must still show exactly
 * one representative row per project - always its current latest (highest chapter_index)
 * - or a re-scanned project would appear as N duplicate entries in Explore/search.
 * Detail views (getPublishedStory, getPublishedStoryChapter) are unaffected; they
 * already resolve one specific report by its own path or chapter number.
 */
function latestChapterOnly(outerAlias = "buildstory_reports"): string {
  return `${outerAlias}.chapter_index = (
    SELECT MAX(r2.chapter_index) FROM buildstory_reports r2
    WHERE r2.project_id = ${outerAlias}.project_id AND r2.publication_status = 'published'
  )`;
}

export async function listPublishedStories(limit = 30, cursor?: string) {
  const boundedLimit = Math.min(Math.max(1, Math.trunc(limit)), 100);
  const rows = await (await database())
    .prepare(
      `SELECT snapshot_json, selected_public_fields_json, editorial_tagline, editorial_description, editorial_reflection, category, story_background_id, published_at,
              artifact_project_url, artifact_repo_url, artifact_video_url
       FROM buildstory_reports
       WHERE publication_status = 'published' AND ${latestChapterOnly()} AND (? IS NULL OR published_at < ?)
       ORDER BY published_at DESC LIMIT ?`,
    )
    .bind(cursor ?? null, cursor ?? null, boundedLimit)
    .all<{
      snapshot_json: string;
      selected_public_fields_json: string;
      editorial_tagline: string;
      editorial_description: string;
      editorial_reflection: string;
      category: string | null;
      story_background_id: string;
      published_at: string | null;
      artifact_project_url: string | null;
      artifact_repo_url: string | null;
      artifact_video_url: string | null;
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
      // List views intentionally omit media (would be N+1 for up to 100 rows);
      // only the single-story detail queries (getPublishedStory[BySlug]) fetch it.
      ...publicBuildStoryFromSnapshot(snapshot, selected, { reflection: row.editorial_reflection, category: row.category as GeneratedReport["category"] }, {
        projectUrl: row.artifact_project_url,
        repoUrl: row.artifact_repo_url,
        videoUrl: row.artifact_video_url,
      }, { storyBackgroundId: isStoryBackgroundId(row.story_background_id) ? row.story_background_id : DEFAULT_STORY_BACKGROUND_ID }),
      publishedAt: row.published_at,
    });
  }
  return stories;
}

/** Public Explore index query. Only materialized publication projections are selected; private snapshots are never read here. */
export async function explorePublishedStories(query: {
  query?: string;
  category?: string;
  tools?: string[];
  models?: string[];
  hasDemo?: boolean;
  sort?: "newest" | "trending";
  limit?: number;
  cursor?: string;
}) {
  const sort = query.sort === "trending" ? "trending" : "newest";
  const boundedLimit = Math.min(Math.max(1, Math.trunc(query.limit ?? 30)), 100);
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const db = await database();
  const rows = await db.prepare(
    `SELECT r.id AS report_id, i.story_json, i.search_text, r.published_at
     FROM buildstory_public_story_index i
     JOIN buildstory_reports r ON r.id = i.report_id
     WHERE r.publication_status = 'published' AND ${latestChapterOnly("r")}`,
  ).all<{ report_id: string; story_json: string; search_text: string; published_at: string | null }>();
  const [reactionRows, commentRows, upvoteRows] = await Promise.all([
    db.prepare("SELECT report_id, COUNT(*) AS count FROM buildstory_reactions WHERE created_at >= ? GROUP BY report_id").bind(cutoff).all<{ report_id: string; count: number }>(),
    db.prepare("SELECT report_id, COUNT(*) AS count FROM buildstory_comments WHERE status = 'visible' AND created_at >= ? GROUP BY report_id").bind(cutoff).all<{ report_id: string; count: number }>(),
    db.prepare("SELECT c.report_id, COUNT(*) AS count FROM buildstory_comment_upvotes u JOIN buildstory_comments c ON c.id = u.comment_id WHERE c.status = 'visible' AND u.created_at >= ? GROUP BY c.report_id").bind(cutoff).all<{ report_id: string; count: number }>(),
  ]);
  const trend = new Map<string, number>();
  for (const row of [...reactionRows.results, ...commentRows.results, ...upvoteRows.results]) trend.set(row.report_id, (trend.get(row.report_id) ?? 0) + Number(row.count));
  const needle = query.query?.trim().toLocaleLowerCase("en-US") ?? "";
  const selectedTools = (query.tools ?? []).map((value) => value.toLocaleLowerCase("en-US"));
  const selectedModels = (query.models ?? []).map((value) => value.toLocaleLowerCase("en-US"));
  const indexed = rows.results.flatMap((row) => {
    const story = parseJson<PublicBuildStoryViewModel>(row.story_json, "public Explore story");
    if (!story || typeof story.name !== "string" || !story.owner || !Array.isArray(story.stack) || !Array.isArray(story.models)) return [];
    return [{ ...story, reportId: row.report_id, publishedAt: row.published_at, trendScore: trend.get(row.report_id) ?? 0, publicSearchText: row.search_text.toLocaleLowerCase("en-US") }];
  });
  type IndexedStory = (typeof indexed)[number];
  const matches = (story: IndexedStory, excludedFacet?: "category" | "tools" | "models" | "demo") => {
    const toolValues = [...story.stack, ...story.tools.map((tool) => tool.label)].map((value) => value.toLocaleLowerCase("en-US"));
    const modelValues = story.models.flatMap((model) => [model.id, model.label]).map((value) => value.toLocaleLowerCase("en-US"));
    return (!needle || story.publicSearchText.includes(needle))
      && (excludedFacet === "category" || !query.category || story.category === query.category)
      && (excludedFacet === "tools" || !selectedTools.length || selectedTools.some((tool) => toolValues.includes(tool)))
      && (excludedFacet === "models" || !selectedModels.length || selectedModels.some((model) => modelValues.includes(model)))
      && (excludedFacet === "demo" || !query.hasDemo || Boolean(story.artifactLinks.projectUrl));
  };
  const resultRows = indexed.filter((story) => matches(story));
  resultRows.sort((left, right) => compareExploreRows(left, right, sort));
  const decodedCursor = decodeExploreCursor(query.cursor);
  const cursorRows = resultRows.filter((story) => decodedCursor
    ? isAfterExploreCursor(story, decodedCursor, sort)
    : !query.cursor || (story.publishedAt ?? "") < query.cursor);
  const visible = cursorRows.slice(0, boundedLimit);

  const categories = new Map<string, number>();
  for (const story of indexed.filter((item) => matches(item, "category"))) categories.set(story.category, (categories.get(story.category) ?? 0) + 1);
  const toolCounts = new Map<string, { label: string; count: number }>();
  for (const story of indexed.filter((item) => matches(item, "tools"))) {
    const storyTools = new Map([...story.stack, ...story.tools.map((tool) => tool.label)].map((value) => [value.toLocaleLowerCase("en-US"), value]));
    for (const [value, label] of storyTools) toolCounts.set(value, { label, count: (toolCounts.get(value)?.count ?? 0) + 1 });
  }
  const modelCalls = new Map<string, { label: string; weight: number }>();
  for (const story of indexed.filter((item) => matches(item, "models"))) {
    for (const model of story.models) modelCalls.set(model.id, { label: model.label, weight: (modelCalls.get(model.id)?.weight ?? 0) + model.requests });
  }
  const totalModelCalls = Array.from(modelCalls.values()).reduce((sum, item) => sum + item.weight, 0);
  const modelFacetRows = Array.from(modelCalls, ([value, item]) => ({ value, label: item.label, exact: totalModelCalls ? (item.weight * 100) / totalModelCalls : 0, share: 0 }));
  for (const item of modelFacetRows) item.share = Math.floor(item.exact);
  let remainingModelShare = totalModelCalls ? 100 - modelFacetRows.reduce((sum, item) => sum + item.share, 0) : 0;
  modelFacetRows.sort((a, b) => (b.exact - Math.floor(b.exact)) - (a.exact - Math.floor(a.exact)) || a.value.localeCompare(b.value));
  for (const item of modelFacetRows) { if (remainingModelShare <= 0) break; item.share += 1; remainingModelShare -= 1; }
  modelFacetRows.sort((a, b) => b.share - a.share || a.value.localeCompare(b.value));
  const last = visible.at(-1);
  return {
    stories: visible.map(({ trendScore, publicSearchText, ...story }) => {
      void trendScore;
      void publicSearchText;
      return story;
    }),
    nextCursor: last && cursorRows.length > boundedLimit ? encodeExploreCursor({ version: 1, sort, publishedAt: last.publishedAt ?? "", reportId: last.reportId, trendScore: last.trendScore }) : null,
    resultCount: resultRows.length,
    facets: {
      categories: Array.from(categories, ([value, count]) => ({ value, label: value.replaceAll("-", " "), count })),
      tools: Array.from(toolCounts, ([value, item]) => ({ value, label: item.label, count: item.count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)),
      models: modelFacetRows.map(({ value, label, share }) => ({ value, label, requestShare: share })),
      liveDemoCount: indexed.filter((story) => matches(story, "demo") && Boolean(story.artifactLinks.projectUrl)).length,
    },
  };
}

/**
 * Public boundary: same projection as listPublishedStories, scoped to one owner.
 * Used to populate a builder's public profile page with their published stories.
 */
export async function listStoriesByOwner(ownerUserId: string, limit = 30, cursor?: string) {
  const boundedLimit = Math.min(Math.max(1, Math.trunc(limit)), 100);
  const rows = await (await database())
    .prepare(
      `SELECT snapshot_json, selected_public_fields_json, editorial_tagline, editorial_description, editorial_reflection, category, story_background_id, published_at,
              artifact_project_url, artifact_repo_url, artifact_video_url
       FROM buildstory_reports
       WHERE publication_status = 'published' AND owner_user_id = ? AND ${latestChapterOnly()} AND (? IS NULL OR published_at < ?)
       ORDER BY published_at DESC LIMIT ?`,
    )
    .bind(ownerUserId, cursor ?? null, cursor ?? null, boundedLimit)
    .all<{
      snapshot_json: string;
      selected_public_fields_json: string;
      editorial_tagline: string;
      editorial_description: string;
      editorial_reflection: string;
      category: string | null;
      story_background_id: string;
      published_at: string | null;
      artifact_project_url: string | null;
      artifact_repo_url: string | null;
      artifact_video_url: string | null;
    }>();

  const stories = [];
  for (const row of rows.results) {
    const snapshot = parseJson<ProjectSnapshot>(row.snapshot_json, "public report");
    const selected = parseJson<PublicFieldKey[]>(
      row.selected_public_fields_json,
      "public field",
    );
    if (!Array.isArray(selected) || selected.some((field) => !PUBLIC_FIELDS.includes(field))) {
      continue; // skip rather than fail the whole list on one invalid stored row
    }
    snapshot.identity.tagline = row.editorial_tagline;
    snapshot.identity.description = row.editorial_description;
    snapshot.identity.visibility = "public";
    stories.push({
      ...publicBuildStoryFromSnapshot(snapshot, selected, { reflection: row.editorial_reflection, category: row.category as GeneratedReport["category"] }, {
        projectUrl: row.artifact_project_url,
        repoUrl: row.artifact_repo_url,
        videoUrl: row.artifact_video_url,
      }, { storyBackgroundId: isStoryBackgroundId(row.story_background_id) ? row.story_background_id : DEFAULT_STORY_BACKGROUND_ID }),
      publishedAt: row.published_at,
    });
  }
  return stories;
}

function escapeLikePattern(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

/** Public boundary: matches only against already-public editorial text and the owner's handle/display name, never source snapshot content. */
export async function searchPublishedStories(query: string, limit = 20, cursor?: string) {
  const boundedLimit = Math.min(Math.max(1, Math.trunc(limit)), 50);
  const trimmed = query.trim().slice(0, 200);
  if (trimmed.length < 2) return [];
  const pattern = `%${escapeLikePattern(trimmed)}%`;
  const prefix = `${escapeLikePattern(trimmed.toLocaleLowerCase("en-US"))}%`;
  const rows = await (await database())
    .prepare(
      `SELECT r.snapshot_json, r.selected_public_fields_json, r.editorial_tagline, r.editorial_description, r.editorial_reflection, r.category, r.story_background_id, r.published_at,
              r.artifact_project_url, r.artifact_repo_url, r.artifact_video_url
       FROM buildstory_reports r
       LEFT JOIN buildstory_users u ON u.id = r.owner_user_id
       WHERE r.publication_status = 'published'
         AND ${latestChapterOnly("r")}
         AND (? IS NULL OR r.published_at < ?)
         AND (
           r.editorial_tagline LIKE ? ESCAPE '\\'
           OR r.editorial_description LIKE ? ESCAPE '\\'
           OR u.handle_lower LIKE ? ESCAPE '\\'
           OR LOWER(u.display_name) LIKE ? ESCAPE '\\'
         )
       ORDER BY r.published_at DESC LIMIT ?`,
    )
    .bind(cursor ?? null, cursor ?? null, pattern, pattern, prefix, prefix, boundedLimit)
    .all<{
      snapshot_json: string;
      selected_public_fields_json: string;
      editorial_tagline: string;
      editorial_description: string;
      editorial_reflection: string;
      category: string | null;
      story_background_id: string;
      published_at: string | null;
      artifact_project_url: string | null;
      artifact_repo_url: string | null;
      artifact_video_url: string | null;
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
      ...publicBuildStoryFromSnapshot(snapshot, selected, { reflection: row.editorial_reflection, category: row.category as GeneratedReport["category"] }, {
        projectUrl: row.artifact_project_url,
        repoUrl: row.artifact_repo_url,
        videoUrl: row.artifact_video_url,
      }, { storyBackgroundId: isStoryBackgroundId(row.story_background_id) ? row.story_background_id : DEFAULT_STORY_BACKGROUND_ID }),
      publishedAt: row.published_at,
    });
  }
  return stories;
}
