import { getD1 } from "@/db";
import { publicBuildStoryFromSnapshot, type PublicBuildStoryViewModel } from "@/lib/build-story";
import { baseHandleFrom, baseSlugFrom, candidateHandles, candidateSlugs, isReservedHandle } from "@/lib/identity/handles";
import { normalizeArtifactUrl, type ArtifactLinksUpdate } from "@/lib/ingestion/artifact-links";
import { mediaPublicUrl } from "@/lib/media/url";
import { isLoopbackHostname } from "@/lib/ingestion/local-api";
import { configuredCloudNarrativeModel, configuredCloudNarrativeProvider, generateNarrative, narrativeProviderConfigured, NarrativeProviderError } from "@/lib/narrative/provider";
import { canUseCloudNarrative, effectivePlan } from "@/lib/narrative/entitlement";
import { estimateCostMicroUsd } from "@/lib/narrative/pricing";
import { NARRATIVE_FIELD_LIMITS, NARRATIVE_PROMPT_VERSION } from "@/lib/narrative/schema";
import type { ProjectSnapshot } from "@/lib/project-snapshot";
import { sanitizePublicText } from "@/lib/publication/sanitization";
import { computeChapterDelta, publicChapterDelta, type ChapterDelta } from "@/lib/story/chapter-delta";
import { MAX_MEDIA_PER_REPORT, PUBLIC_FIELD_KEYS } from "./contracts";
import type {
  ActiveHighlight,
  BillingProfile,
  BillingUpdate,
  DeviceAuthorization,
  FeatureBudgetName,
  GeneratedReport,
  LocalReportSummary,
  NarrativeRecord,
  NarrativeStatus,
  ProjectDetail,
  ProjectRecord,
  ProjectScanStats,
  ProjectSummary,
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
import { notifyFollowersOfStoryUpdate } from "@/lib/social/store";
import { builderRoleLabel, isBuilderRole, type BuilderRole } from "@/lib/identity/builder-roles";
import { GUIDE_VERSION, isGuideKey, isGuideState, type GuideKey, type GuideState, type GuidanceRecord } from "@/lib/guidance/contracts";

const DEFAULT_MONTHLY_LLM_CAP_MICRO_USD = 1_000_000; // $1.00/month/user, subsidized default
const PRO_MONTHLY_LLM_CAP_MICRO_USD = 5_000_000; // $5.00/month/user - a first number, not a considered business decision; revisit before Pro is a paid tier.
/** Anti-abuse ceiling on stored reports per account - see acceptSnapshot. Same on every plan; storage cost is ours regardless of tier. */
const MAX_STORED_REPORTS_PER_ACCOUNT = 500;
/** Free-tier monthly cap on re-scanning an existing project; Pro is unlimited. First-time project scans are never capped. */
const MONTHLY_RESCAN_CAP_FREE = 3;
/** Pro-only monthly allowance for spotlighting a story on Explore's Pro Picks rail. */
const MONTHLY_HIGHLIGHT_CAP_PRO = 5;
const HIGHLIGHT_DURATION_MS = 24 * 60 * 60 * 1000;

function monthlyLlmCapMicroUsd(plan: "free" | "pro"): number {
  return effectivePlan(plan) === "pro" ? PRO_MONTHLY_LLM_CAP_MICRO_USD : DEFAULT_MONTHLY_LLM_CAP_MICRO_USD;
}

type SessionRow = {
  id: string;
  creator_id: string;
  owner_user_id: string | null;
  target_project_id: string | null;
  project_label: string;
  narrative_model: string | null;
  narrative_mode: string | null;
  narrative_provider: string | null;
  analysis_tier: string | null;
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
  chapter_delta_json: string | null;
};

const PUBLIC_FIELDS: readonly PublicFieldKey[] = PUBLIC_FIELD_KEYS;

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

function narrativeStatusValue(value: string | null | undefined): NarrativeStatus | null {
  return value === "queued" || value === "generating" || value === "ready" || value === "failed" ? value : null;
}

function cleanSession(row: SessionRow, narrativeStatus: NarrativeStatus | null = null): UploadSessionView {
  const narrativeMode = row.narrative_mode === "local" || row.narrative_mode === "byok" || row.narrative_mode === "off" ? row.narrative_mode : "cloud";
  return {
    id: row.id,
    creatorId: row.creator_id,
    projectLabel: row.project_label,
    narrativeModel: row.narrative_model,
    narrativeMode,
    narrativeProvider: row.narrative_provider === "openai" || row.narrative_provider === "ollama" || row.narrative_provider === "openai-compatible" ? row.narrative_provider : row.narrative_mode === "local" ? "ollama" : "openrouter",
    analysisTier: row.narrative_mode === "local" ? "standard" : row.analysis_tier === "deep" ? "deep" : "standard",
    status: row.status as UploadSessionStatus,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    scannerAuthorizedAt: row.scanner_authorized_at,
    snapshotReceivedAt: row.snapshot_received_at,
    reportId: row.report_id,
    statusDetail: row.status_detail,
    narrativeStatus,
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
    chapterDelta: row.chapter_delta_json ? parseJson<ChapterDelta>(row.chapter_delta_json, "chapter delta") : null,
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
  reasoning_tokens: number;
  cached_tokens: number;
  cost_micro_usd: number;
  analysis_tier_requested: string | null;
  analysis_tier_delivered: string | null;
  evidence_scrubbed_at: string | null;
  evidence_expires_at: string | null;
  evidence_receipt_json: string | null;
  reservation_micro_usd: number;
  last_error_code: string | null;
};

function narrativeFromRow(row: NarrativeRow): NarrativeRecord {
  const stored = row.sections_json ? parseJson<unknown>(row.sections_json, "narrative sections") : null;
  const storedRecord = stored && typeof stored === "object" && !Array.isArray(stored) ? stored as {
    sections?: NarrativeRecord["sections"];
    storyPack?: NarrativeRecord["storyPack"];
    observability?: Partial<NonNullable<NarrativeRecord["observability"]>>;
    analysisTierRequested?: NarrativeRecord["analysisTierRequested"];
    analysisTierDelivered?: NarrativeRecord["analysisTierDelivered"];
    evidenceScrubbedAt?: string | null;
    validationFailure?: NarrativeRecord["validationFailure"];
  } : null;
  const observability = storedRecord?.observability
    ? {
        ...storedRecord.observability,
        providerCounts: storedRecord.observability.providerCounts ?? {},
        promptVersion: storedRecord.observability.promptVersion ?? row.prompt_version,
        schemaVersion: storedRecord.observability.schemaVersion ?? PROJECT_SNAPSHOT_SCHEMA_VERSION,
        generationLatencyMs: storedRecord.observability.generationLatencyMs ?? 0,
        inputTokens: storedRecord.observability.inputTokens ?? row.input_tokens,
        outputTokens: storedRecord.observability.outputTokens ?? row.output_tokens,
        reasoningTokens: storedRecord.observability.reasoningTokens ?? 0,
        cachedTokens: storedRecord.observability.cachedTokens ?? 0,
        costMicroUsd: storedRecord.observability.costMicroUsd ?? row.cost_micro_usd,
        invalidReferenceCount: storedRecord.observability.invalidReferenceCount ?? 0,
        fallbackCount: storedRecord.observability.fallbackCount ?? 0,
      }
    : null;
  return {
    id: row.id,
    reportId: row.report_id,
    mode: row.mode as "cloud" | "local",
    provider: row.provider,
    model: row.model,
    status: row.status as NarrativeStatus,
    failureCode: row.last_error_code,
    sections: storedRecord && "sections" in storedRecord ? storedRecord.sections ?? null : stored as NarrativeRecord["sections"],
    storyPack: storedRecord?.storyPack ?? null,
    analysisTierRequested: row.analysis_tier_requested === "deep" ? "deep" : storedRecord?.analysisTierRequested ?? "standard",
    analysisTierDelivered: row.analysis_tier_delivered === "deep" ? "deep" : row.analysis_tier_delivered === "standard" ? "standard" : storedRecord?.analysisTierDelivered ?? null,
    evidenceScrubbedAt: row.evidence_scrubbed_at ?? storedRecord?.evidenceScrubbedAt ?? null,
    evidenceReceipt: row.evidence_receipt_json ? parseJson<NonNullable<NarrativeRecord["evidenceReceipt"]>>(row.evidence_receipt_json, "evidence receipt") : null,
    observability,
    fallbacksUsed: row.fallbacks_used_json ? parseJson<string[]>(row.fallbacks_used_json, "narrative fallbacks") : [],
    costMicroUsd: row.cost_micro_usd,
    validationFailure: storedRecord?.validationFailure ?? null,
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

/**
 * Creator access is intentionally dual-keyed during the identity migration:
 * newer rows carry the durable user id, while older rows only carry the
 * original auth subject. The project owner is the authoritative fallback for
 * a legacy report whose owner_user_id was not backfilled yet.
 */
async function reportByIdForCreator(creatorId: string, reportId: string) {
  const owner = await userByAuthSubject(creatorId);
  const ownerId = owner?.id ?? "";
  return (await database())
    .prepare(
      `SELECT r.*
       FROM buildstory_reports r
       LEFT JOIN buildstory_projects p ON p.id = r.project_id
       WHERE r.id = ?
         AND (r.creator_id = ? OR r.owner_user_id = ? OR p.owner_user_id = ?)`
    )
    .bind(reportId, creatorId, ownerId, ownerId)
    .first<ReportRow>();
}

async function userByAuthSubject(authSubject: string) {
  const user = await (await database())
    .prepare(
      "SELECT id, handle, display_name, avatar_url, bio, builder_role, role, status FROM buildstory_users WHERE auth_subject = ? AND deleted_at IS NULL",
    )
    .bind(authSubject)
    .first<{
      id: string;
      handle: string;
      display_name: string;
      avatar_url: string | null;
      bio: string | null;
      builder_role: string | null;
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
    const terminal = !(error instanceof NarrativeProviderError && error.retryable) || Number(job?.attempts ?? 1) >= 3;
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
  const owner = await userByAuthSubject(creatorId);
  const ownerId = owner?.id ?? "";
  const rows = await (await database())
    .prepare(
      `SELECT j.report_id
       FROM buildstory_report_jobs j
       JOIN buildstory_reports r ON r.id = j.report_id
       LEFT JOIN buildstory_projects p ON p.id = r.project_id
       WHERE (r.creator_id = ? OR r.owner_user_id = ? OR p.owner_user_id = ?)
         AND j.status IN ('pending', 'processing')
       ORDER BY j.created_at ASC LIMIT 1`,
    )
    .bind(creatorId, ownerId, ownerId)
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
  const owner = await userByAuthSubject(creatorId);
  const ownerId = owner?.id ?? "";
  const rows = await (await database())
    .prepare(
      `SELECT s.*, n.status AS joined_narrative_status
       FROM buildstory_upload_sessions s
       LEFT JOIN buildstory_narratives n ON n.report_id = s.report_id
       LEFT JOIN buildstory_reports r ON r.id = s.report_id
       LEFT JOIN buildstory_projects p ON p.id = COALESCE(s.target_project_id, r.project_id)
       WHERE (s.creator_id = ? OR s.owner_user_id = ? OR p.owner_user_id = ?)
         AND (? IS NULL OR s.created_at < ?)
       ORDER BY s.created_at DESC LIMIT ?`,
    )
    .bind(creatorId, ownerId, ownerId, cursor ?? null, cursor ?? null, bounded)
    .all<SessionRow & { joined_narrative_status: string | null }>();
  return rows.results.map((row) => cleanSession(row, narrativeStatusValue(row.joined_narrative_status)));
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
      "SELECT id, handle, display_name, avatar_url, role, status, handle_changed_at, builder_role, onboarding_completed_at, plan FROM buildstory_users WHERE auth_subject = ?",
    )
    .bind(session.creatorId)
    .first<{ id: string; handle: string; display_name: string; avatar_url: string | null; role: string; status: string; handle_changed_at: string | null; builder_role: string | null; onboarding_completed_at: string | null; plan: string }>();
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
      builderRole: isBuilderRole(existing.builder_role) ? existing.builder_role : null,
      onboardingCompletedAt: existing.onboarding_completed_at,
      plan: existing.plan === "pro" ? "pro" : "free",
    };
  }

  const base = baseHandleFrom(session.name, session.email);
  for (const candidate of candidateHandles(base)) {
    const id = makeId("usr");
    const result = await db
      .prepare(
        `INSERT INTO buildstory_users (
          id, auth_subject, email, handle, handle_lower, display_name, avatar_url,
          role, status, builder_role, onboarding_completed_at, created_at, updated_at
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, 'member', 'active', ?, ?, ?, ?
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
        null,
        null,
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
        builderRole: null,
        onboardingCompletedAt: null,
        plan: "free",
      };
    }
    const raced = await db
      .prepare("SELECT id, handle, display_name, avatar_url, role, status, handle_changed_at, builder_role, onboarding_completed_at, plan FROM buildstory_users WHERE auth_subject = ?")
      .bind(session.creatorId)
      .first<{ id: string; handle: string; display_name: string; avatar_url: string | null; role: string; status: string; handle_changed_at: string | null; builder_role: string | null; onboarding_completed_at: string | null; plan: string }>();
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
        builderRole: isBuilderRole(raced.builder_role) ? raced.builder_role : null,
        onboardingCompletedAt: raced.onboarding_completed_at,
        plan: raced.plan === "pro" ? "pro" : "free",
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

type BillingProfileRow = {
  plan: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string | null;
  billing_interval: string | null;
  current_period_end: string | null;
  cancel_at_period_end: number;
};

function billingProfileFromRow(row: BillingProfileRow): BillingProfile {
  return {
    plan: row.plan === "pro" ? "pro" : "free",
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    subscriptionStatus: row.subscription_status,
    billingInterval: row.billing_interval === "month" || row.billing_interval === "year" ? row.billing_interval : null,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end === 1,
  };
}

/** Stripe subscription state for a user, read by the Settings billing section and the checkout/portal routes. */
export async function getBillingProfile(userId: string): Promise<BillingProfile | null> {
  const db = await database();
  const row = await db
    .prepare(
      "SELECT plan, stripe_customer_id, stripe_subscription_id, subscription_status, billing_interval, current_period_end, cancel_at_period_end FROM buildstory_users WHERE id = ?",
    )
    .bind(userId)
    .first<BillingProfileRow>();
  return row ? billingProfileFromRow(row) : null;
}

/** Resolves a Stripe customer id back to the owning user - the webhook's fallback path when an event carries no buildstoryUserId metadata. */
export async function findUserIdByStripeCustomerId(stripeCustomerId: string): Promise<string | null> {
  const db = await database();
  const row = await db
    .prepare("SELECT id FROM buildstory_users WHERE stripe_customer_id = ?")
    .bind(stripeCustomerId)
    .first<{ id: string }>();
  return row?.id ?? null;
}

/** Writes Stripe subscription state onto a user row - the only place billing columns are mutated, called from the checkout route and the webhook handler. */
export async function applyBillingUpdate(userId: string, update: BillingUpdate): Promise<void> {
  const db = await database();
  const sets: string[] = [];
  const values: unknown[] = [];

  if (update.stripeCustomerId !== undefined) {
    sets.push("stripe_customer_id = ?");
    values.push(update.stripeCustomerId);
  }
  if (update.stripeSubscriptionId !== undefined) {
    sets.push("stripe_subscription_id = ?");
    values.push(update.stripeSubscriptionId);
  }
  if (update.subscriptionStatus !== undefined) {
    sets.push("subscription_status = ?");
    values.push(update.subscriptionStatus);
  }
  if (update.billingInterval !== undefined) {
    sets.push("billing_interval = ?");
    values.push(update.billingInterval);
  }
  if (update.currentPeriodEnd !== undefined) {
    sets.push("current_period_end = ?");
    values.push(update.currentPeriodEnd);
  }
  if (update.cancelAtPeriodEnd !== undefined) {
    sets.push("cancel_at_period_end = ?");
    values.push(update.cancelAtPeriodEnd ? 1 : 0);
  }
  if (update.plan !== undefined) {
    sets.push("plan = ?");
    values.push(update.plan);
  }

  if (sets.length === 0) return;

  sets.push("updated_at = ?");
  values.push(new Date().toISOString(), userId);
  await db.prepare(`UPDATE buildstory_users SET ${sets.join(", ")} WHERE id = ?`).bind(...values).run();
}

/** Current count for a monthly-capped feature, for the current UTC period. Zero if the user hasn't used it this period. */
export async function getFeatureBudgetCount(userId: string, feature: FeatureBudgetName): Promise<number> {
  const db = await database();
  const row = await db
    .prepare("SELECT count FROM buildstory_feature_budgets WHERE user_id = ? AND period_key = ? AND feature = ?")
    .bind(userId, currentBudgetPeriodKey(), feature)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

/** Race-safe upsert-increment for the current UTC period - a small tolerance for two concurrent requests both passing a prior budget check is acceptable for a soft, nudge-to-upgrade cap. */
export async function incrementFeatureBudget(userId: string, feature: FeatureBudgetName): Promise<void> {
  const db = await database();
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO buildstory_feature_budgets (user_id, period_key, feature, count, updated_at)
       VALUES (?, ?, ?, 1, ?)
       ON CONFLICT(user_id, period_key, feature) DO UPDATE SET count = count + 1, updated_at = excluded.updated_at`,
    )
    .bind(userId, currentBudgetPeriodKey(), feature, now)
    .run();
}

/**
 * Spotlights a report on Explore's additive "Pro Picks" rail for
 * HIGHLIGHT_DURATION_MS - never reorders the real organic ranking (see
 * getActiveHighlights / explorePublishedStories, which are untouched by
 * this). Pro-only, capped at MONTHLY_HIGHLIGHT_CAP_PRO per month.
 */
export async function createHighlight(userId: string, reportId: string): Promise<void> {
  const db = await database();
  const user = await db.prepare("SELECT plan FROM buildstory_users WHERE id = ?").bind(userId).first<{ plan: string }>();
  if (!user || effectivePlan(user.plan === "pro" ? "pro" : "free") !== "pro") {
    throw new D1IngestionError("highlight_requires_pro", "Highlighting a story is a Pro benefit.", 403);
  }
  const owned = await db
    .prepare("SELECT id FROM buildstory_reports WHERE id = ? AND owner_user_id = ? AND publication_status = 'published'")
    .bind(reportId, userId)
    .first();
  if (!owned) throw new D1IngestionError("not_found", "Published report not found.", 404);

  const used = await getFeatureBudgetCount(userId, "highlight");
  if (used >= MONTHLY_HIGHLIGHT_CAP_PRO) {
    throw new D1IngestionError("highlight_limit_reached", `You've used all ${MONTHLY_HIGHLIGHT_CAP_PRO} highlights for this month.`, 403);
  }

  const now = new Date();
  await db
    .prepare("INSERT INTO buildstory_report_highlights (id, report_id, owner_user_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)")
    .bind(makeId("hlt"), reportId, userId, now.toISOString(), new Date(now.getTime() + HIGHLIGHT_DURATION_MS).toISOString())
    .run();
  await incrementFeatureBudget(userId, "highlight");
}

/** Currently-active highlights for the Pro Picks rail, newest first. Read-time expiry (no cron sweep needed). */
export async function getActiveHighlights(limit = 6): Promise<ActiveHighlight[]> {
  const db = await database();
  const rows = await db
    .prepare(
      `SELECT h.report_id AS report_id, h.expires_at AS expires_at,
              u.handle AS owner_handle, u.display_name AS owner_display_name,
              r.editorial_tagline AS tagline, r.public_url AS public_url,
              idx.cover_url AS cover_url
       FROM buildstory_report_highlights h
       JOIN buildstory_reports r ON r.id = h.report_id
       JOIN buildstory_users u ON u.id = h.owner_user_id
       LEFT JOIN buildstory_public_story_index idx ON idx.report_id = h.report_id
       WHERE h.expires_at > ? AND r.publication_status = 'published'
       ORDER BY h.created_at DESC
       LIMIT ?`,
    )
    .bind(new Date().toISOString(), limit)
    .all<{ report_id: string; expires_at: string; owner_handle: string; owner_display_name: string; tagline: string; public_url: string | null; cover_url: string | null }>();
  return rows.results
    .filter((row) => row.public_url)
    .map((row) => ({
      reportId: row.report_id,
      ownerHandle: row.owner_handle,
      ownerDisplayName: row.owner_display_name,
      tagline: row.tagline,
      publicUrl: row.public_url!,
      coverUrl: row.cover_url,
      expiresAt: row.expires_at,
    }));
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
  builderRole: BuilderRole | null;
  onboardingCompletedAt: string | null;
};

type ProfileRow = {
  id: string;
  handle: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  handle_changed_at: string | null;
  builder_role: string | null;
  onboarding_completed_at: string | null;
};

function profileUpdateResultFromRow(row: ProfileRow): ProfileUpdateResult {
  return {
    id: row.id,
    handle: row.handle,
    displayName: row.display_name,
    bio: row.bio,
    avatarUrl: row.avatar_url,
    handleChangedAt: row.handle_changed_at,
    builderRole: isBuilderRole(row.builder_role) ? row.builder_role : null,
    onboardingCompletedAt: row.onboarding_completed_at,
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
  update: { bio?: string; displayName?: string; handle?: string; builderRole?: BuilderRole | null },
): Promise<ProfileUpdateResult> {
  const db = await database();
  const existing = await db
    .prepare("SELECT id, handle, display_name, bio, avatar_url, handle_changed_at, builder_role, onboarding_completed_at FROM buildstory_users WHERE id = ?")
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

  if (update.builderRole !== undefined) {
    if (update.builderRole !== null && !isBuilderRole(update.builderRole)) {
      throw new D1IngestionError("invalid_builder_role", "Choose one of the available builder roles.", 422);
    }
    sets.push("builder_role = ?");
    values.push(update.builderRole);
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
    .prepare("SELECT id, handle, display_name, bio, avatar_url, handle_changed_at, builder_role, onboarding_completed_at FROM buildstory_users WHERE id = ?")
    .bind(userId)
    .first<ProfileRow>();
  return profileUpdateResultFromRow(updated!);
}

/** Initial profile setup. The first handle selection does not spend the later one-time handle change. */
export async function completeOnboarding(
  userId: string,
  update: { displayName: string; handle: string; bio?: string | null; builderRole?: BuilderRole | null },
): Promise<ProfileUpdateResult> {
  const db = await database();
  const existing = await db
    .prepare("SELECT id, handle, display_name, bio, avatar_url, handle_changed_at, builder_role, onboarding_completed_at FROM buildstory_users WHERE id = ?")
    .bind(userId)
    .first<ProfileRow>();
  if (!existing) throw new D1IngestionError("not_found", "Account not found.", 404);

  const displayName = update.displayName.trim().slice(0, MAX_DISPLAY_NAME_LENGTH);
  if (!displayName) throw new D1IngestionError("invalid_display_name", "Display name cannot be empty.", 422);
  const handle = update.handle.trim().toLocaleLowerCase("en-US");
  if (handle.length < 3 || handle.length > 32 || !HANDLE_PATTERN.test(handle)) {
    throw new D1IngestionError("invalid_handle", "Handles must be 3-32 characters: lowercase letters, numbers, and single hyphens between them.", 422);
  }
  if (isReservedHandle(handle)) throw new D1IngestionError("handle_reserved", "That handle is reserved.", 422);
  if (update.builderRole !== undefined && update.builderRole !== null && !isBuilderRole(update.builderRole)) {
    throw new D1IngestionError("invalid_builder_role", "Choose one of the available builder roles.", 422);
  }
  const taken = await db
    .prepare("SELECT id FROM buildstory_users WHERE handle_lower = ? AND id != ?")
    .bind(handle, userId)
    .first();
  if (taken) throw new D1IngestionError("handle_taken", "That handle is already taken.", 422);

  if (existing.onboarding_completed_at) {
    const same = existing.handle.toLocaleLowerCase("en-US") === handle
      && existing.display_name === displayName
      && (existing.bio ?? null) === (update.bio?.trim().slice(0, MAX_BIO_LENGTH) || null)
      && (isBuilderRole(existing.builder_role) ? existing.builder_role : null) === (update.builderRole ?? null);
    if (same) return profileUpdateResultFromRow(existing);
    throw new D1IngestionError("onboarding_already_completed", "Onboarding is already complete. Update your profile from Settings.", 409);
  }

  const now = new Date().toISOString();
  await db
    .prepare(`UPDATE buildstory_users
      SET display_name = ?, handle = ?, handle_lower = ?, bio = ?, builder_role = ?, onboarding_completed_at = ?, updated_at = ?
      WHERE id = ? AND onboarding_completed_at IS NULL`)
    .bind(displayName, handle, handle, update.bio?.trim().slice(0, MAX_BIO_LENGTH) || null, update.builderRole ?? null, now, now, userId)
    .run();
  const updated = await db
    .prepare("SELECT id, handle, display_name, bio, avatar_url, handle_changed_at, builder_role, onboarding_completed_at FROM buildstory_users WHERE id = ?")
    .bind(userId)
    .first<ProfileRow>();
  return profileUpdateResultFromRow(updated!);
}

export async function listGuidance(userId: string): Promise<GuidanceRecord[]> {
  const rows = await (await database())
    .prepare("SELECT guide_key, guide_version, state, updated_at FROM buildstory_user_guidance WHERE user_id = ? ORDER BY guide_key")
    .bind(userId)
    .all<{ guide_key: string; guide_version: number; state: string; updated_at: string }>();
  return rows.results.flatMap((row) => isGuideKey(row.guide_key) && isGuideState(row.state)
    ? [{ guideKey: row.guide_key, guideVersion: row.guide_version, state: row.state, updatedAt: row.updated_at }]
    : []);
}

export async function setGuidance(userId: string, guideKey: GuideKey, guideVersion: number, state: GuideState): Promise<GuidanceRecord> {
  if (!isGuideKey(guideKey) || !isGuideState(state) || guideVersion !== GUIDE_VERSION) {
    throw new D1IngestionError("invalid_guidance", "That guide is not available.", 422);
  }
  const db = await database();
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO buildstory_user_guidance (id, user_id, guide_key, guide_version, state, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, guide_key, guide_version) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at`)
    .bind(makeId("gde"), userId, guideKey, guideVersion, state, now, now)
    .run();
  return { guideKey, guideVersion, state, updatedAt: now };
}

/**
 * Get-or-create the project a scan belongs to, grouped by the scanner's
 * content-derived repository fingerprint (stable across scans of the same
 * repository; NOT the scan-specific scanId). Refreshes the rollup fields
 * to this scan's own totals on every call rather than summing across
 * scans, since each ProjectSnapshot already aggregates its full selected
 * time window and scan windows can overlap.
 */
/** isExisting distinguishes a rescan of an owner's existing project from that project's first-ever scan - see acceptSnapshot's rescan-budget check, which only applies to the former. */
export async function ensureProject(
  ownerUserId: string,
  fingerprint: string,
  fingerprintBasis: string,
  stats: ProjectScanStats,
): Promise<ProjectRecord & { isExisting: boolean }> {
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
      isExisting: true,
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
      return { id, ownerUserId, slug: candidate, name: stats.displayName, repositoryFingerprint: fingerprint, isExisting: false };
    }
    const raced = await db
      .prepare("SELECT id, slug, name FROM buildstory_projects WHERE owner_user_id = ? AND repository_fingerprint = ?")
      .bind(ownerUserId, fingerprint)
      .first<{ id: string; slug: string; name: string }>();
    if (raced) {
      // Another concurrent request won the race and created it first - this is still that project's first scan, not a rescan.
      return { id: raced.id, ownerUserId, slug: raced.slug, name: raced.name, repositoryFingerprint: fingerprint, isExisting: false };
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

/** Fast pre-check; reserveNarrativeSpend is the authoritative atomic guard. */
async function planForUser(db: D1Database, userId: string): Promise<"free" | "pro"> {
  const row = await db.prepare("SELECT plan FROM buildstory_users WHERE id = ?").bind(userId).first<{ plan: string }>();
  return row?.plan === "pro" ? "pro" : "free";
}

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

async function reserveNarrativeSpend(db: D1Database, narrative: NarrativeRow, snapshot: ScannerProjectSnapshot): Promise<number> {
  if (narrative.reservation_micro_usd > 0) return narrative.reservation_micro_usd;
  const estimatedInputTokens = Math.ceil(new TextEncoder().encode(JSON.stringify(snapshot)).byteLength / 3);
  const estimatedOutputTokens = narrative.analysis_tier_requested === "deep" ? 64_000 : 4_000;
  const amount = estimateCostMicroUsd("deepseek/deepseek-v4-flash", estimatedInputTokens, estimatedOutputTokens);
  const periodKey = currentBudgetPeriodKey();
  const now = new Date().toISOString();
  const cap = monthlyLlmCapMicroUsd(await planForUser(db, narrative.owner_user_id));
  await db.prepare(
    `INSERT OR IGNORE INTO buildstory_llm_budgets (user_id, period_key, spent_micro_usd, reserved_micro_usd, cap_micro_usd, updated_at)
     VALUES (?, ?, 0, 0, ?, ?)`,
  ).bind(narrative.owner_user_id, periodKey, cap, now).run();
  const results = await db.batch([
    db.prepare(
      `UPDATE buildstory_llm_budgets SET reserved_micro_usd = reserved_micro_usd + ?, updated_at = ?
       WHERE user_id = ? AND period_key = ? AND spent_micro_usd + reserved_micro_usd + ? <= cap_micro_usd`,
    ).bind(amount, now, narrative.owner_user_id, periodKey, amount),
    db.prepare("UPDATE buildstory_narratives SET reservation_micro_usd = ?, updated_at = ? WHERE id = ? AND reservation_micro_usd = 0")
      .bind(amount, now, narrative.id),
  ]);
  if (changes(results[0]) !== 1) {
    await db.prepare("UPDATE buildstory_narratives SET reservation_micro_usd = 0 WHERE id = ?").bind(narrative.id).run();
    throw new NarrativeProviderError("llm_budget_exceeded", "Monthly narrative budget has been reached.");
  }
  return amount;
}

async function reconcileNarrativeSpend(db: D1Database, narrative: NarrativeRow, actualCostMicroUsd: number) {
  const reservation = Math.max(0, narrative.reservation_micro_usd);
  const periodKey = currentBudgetPeriodKey();
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(
      `UPDATE buildstory_llm_budgets SET reserved_micro_usd = MAX(0, reserved_micro_usd - ?),
       spent_micro_usd = spent_micro_usd + ?, updated_at = ? WHERE user_id = ? AND period_key = ?`,
    ).bind(reservation, actualCostMicroUsd, now, narrative.owner_user_id, periodKey),
    db.prepare("UPDATE buildstory_narratives SET reservation_micro_usd = 0 WHERE id = ?").bind(narrative.id),
  ]);
}

async function releaseNarrativeReservation(db: D1Database, narrativeId: string) {
  const narrative = await db.prepare("SELECT * FROM buildstory_narratives WHERE id = ?").bind(narrativeId).first<NarrativeRow>();
  if (!narrative || narrative.reservation_micro_usd <= 0) return;
  const periodKey = currentBudgetPeriodKey();
  await db.batch([
    db.prepare("UPDATE buildstory_llm_budgets SET reserved_micro_usd = MAX(0, reserved_micro_usd - ?), updated_at = ? WHERE user_id = ? AND period_key = ?")
      .bind(narrative.reservation_micro_usd, new Date().toISOString(), narrative.owner_user_id, periodKey),
    db.prepare("UPDATE buildstory_narratives SET reservation_micro_usd = 0 WHERE id = ?").bind(narrativeId),
  ]);
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
async function createNarrativeJob(reportId: string, ownerUserId: string): Promise<string> {
  const db = await database();
  const now = new Date().toISOString();
  const evidenceExpiresAt = new Date(Date.now() + 2 * 60 * 60_000).toISOString();
  const report = await reportById(reportId);
  const session = report ? await sessionById(report.upload_session_id) : null;
  const analysisTier = session?.analysis_tier === "deep" ? "deep" : "standard";
  const requestedProvider = session?.narrative_provider === "openai" || session?.narrative_provider === "openrouter"
    ? session.narrative_provider
    : configuredCloudNarrativeProvider();
  const requestedModel = configuredCloudNarrativeModel() ?? "auto";
  const narrativeId = makeId("nar");
  const narrativeJobId = makeId("njob");
  await db.batch([
    db
      .prepare(
        `INSERT INTO buildstory_narratives (
          id, report_id, owner_user_id, mode, provider, model, prompt_version, status,
          sections_json, fallbacks_used_json, input_tokens, output_tokens, reasoning_tokens, cached_tokens, cost_micro_usd,
          analysis_tier_requested, requested_provider, requested_model, evidence_expires_at, created_at, updated_at
        )
        SELECT ?, ?, ?, 'cloud', ?, ?, ?, 'queued', NULL, '[]', 0, 0, 0, 0, 0, ?, ?, ?, ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM buildstory_reports WHERE id = ?)`,
      )
      .bind(narrativeId, reportId, ownerUserId, requestedProvider, requestedModel, NARRATIVE_PROMPT_VERSION, analysisTier, requestedProvider, requestedModel, evidenceExpiresAt, now, now, reportId),
    db
      .prepare(
        `INSERT INTO buildstory_narrative_jobs (
          id, narrative_id, status, attempts, available_at, created_at, updated_at
        ) SELECT ?, ?, 'pending', 0, ?, ?, ?
          WHERE EXISTS (SELECT 1 FROM buildstory_narratives WHERE id = ?)`,
      )
      .bind(narrativeJobId, narrativeId, now, now, now, narrativeId),
  ]);
  return narrativeId;
}

async function enqueueNarrative(narrativeId: string): Promise<void> {
  try {
    const { env } = await import("cloudflare:workers");
    const queue = (env as unknown as { NARRATIVE_QUEUE?: Queue<{ narrativeId: string }> }).NARRATIVE_QUEUE;
    if (queue) await queue.send({ narrativeId });
  } catch {
    // The scheduled sweep will enqueue durable pending rows if dispatch is
    // momentarily unavailable. No prompt or evidence is placed in the message.
  }
}

async function storeLocalNarrative(
  reportId: string,
  ownerUserId: string,
  generated: ScannerProjectSnapshot["generatedNarrative"] | undefined,
  model: string | null,
  analysisTierRequested: "standard" | "deep",
): Promise<void> {
  const db = await database();
  const now = new Date().toISOString();
  await db.prepare(
    `INSERT INTO buildstory_narratives (
      id, report_id, owner_user_id, mode, provider, model, prompt_version, status,
      sections_json, fallbacks_used_json, input_tokens, output_tokens, reasoning_tokens, cached_tokens, cost_micro_usd,
      analysis_tier_requested, analysis_tier_delivered, evidence_scrubbed_at, created_at, updated_at
    ) VALUES (?, ?, ?, 'local', ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, ?, ?, NULL, ?, ?)`
  ).bind(
    makeId("nar"),
    reportId,
    ownerUserId,
    generated?.provider ?? "ollama",
    generated?.model ?? model ?? "auto",
    NARRATIVE_PROMPT_VERSION,
    generated ? "ready" : "failed",
    generated ? JSON.stringify({
      sections: generated.sections,
      storyPack: generated.storyPack,
      analysisTierRequested,
      analysisTierDelivered: generated.storyPack?.version === "3.0.0" ? "deep" : "standard",
      evidenceScrubbedAt: null,
      observability: { providerCounts: {}, promptVersion: NARRATIVE_PROMPT_VERSION, schemaVersion: PROJECT_SNAPSHOT_SCHEMA_VERSION, generationLatencyMs: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cachedTokens: 0, costMicroUsd: 0, invalidReferenceCount: 0, fallbackCount: generated.fallbacksUsed.length },
    }) : null,
    JSON.stringify(generated?.fallbacksUsed ?? []),
    analysisTierRequested,
    generated ? generated.storyPack?.version === "3.0.0" ? "deep" : "standard" : null,
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
export async function processNarrativeQueueJob(narrativeId: string) {
  const db = await database();
  const now = new Date();
  const nowIso = now.toISOString();
  const leaseUntil = new Date(now.getTime() + 12 * 60_000).toISOString();
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

  let sourceSnapshotForScrub: ScannerProjectSnapshot | null = null;
  let reportIdForScrub: string | null = null;
  let analysisTierForFailure: "standard" | "deep" = "standard";
  let claimedNarrative: NarrativeRow | null = null;
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
    claimedNarrative = narrative;
    analysisTierForFailure = narrative.analysis_tier_requested === "deep" ? "deep" : "standard";
    if (narrative.evidence_expires_at && Date.parse(narrative.evidence_expires_at) <= Date.now()) {
      throw new NarrativeProviderError("evidence_expired", "Reviewed evidence expired before generation.");
    }

    if (!canUseCloudNarrative(narrative.owner_user_id)) {
      throw new NarrativeProviderError("llm_not_entitled", "Buildstory Cloud narrative generation is not enabled for this account.");
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
    sourceSnapshotForScrub = sourceSnapshot;
    reportIdForScrub = narrative.report_id;
    narrative.reservation_micro_usd = await reserveNarrativeSpend(db, narrative, sourceSnapshot);

    const session = await sessionById(report.upload_session_id);
    const sessionMode = session?.narrative_mode === "local" || session?.narrative_mode === "byok" || session?.narrative_mode === "off" ? session.narrative_mode : "cloud";
    const analysisTierRequested = session?.analysis_tier === "deep" && sessionMode !== "local" && sessionMode !== "off" ? "deep" : "standard";
    const previousRow = analysisTierRequested === "deep" ? await db.prepare(
      `SELECT snapshot_json FROM buildstory_reports
       WHERE project_id = ? AND id != ? AND status = 'ready'
       ORDER BY COALESCE(chapter_index, 0) DESC, created_at DESC LIMIT 1`,
    ).bind(report.project_id, report.id).first<{ snapshot_json: string }>() : null;
    const previousSnapshot = previousRow ? parseJson<ProjectSnapshot>(previousRow.snapshot_json, "previous chapter snapshot") : null;
    const previousChapter = previousSnapshot ? {
      timeWindow: previousSnapshot.timeWindow,
      sessions: previousSnapshot.sessions.length,
      commits: previousSnapshot.git.commits,
      usage: previousSnapshot.usage,
      profile: previousSnapshot.builderProfile,
      retainedFinalReport: previousSnapshot.narrative?.storyPack ?? previousSnapshot.narrative ?? null,
    } : null;
    const result = await generateNarrative(sourceSnapshot, session?.narrative_model, { analysisTier: analysisTierRequested, previousChapter });
    const completedAtIso = new Date().toISOString();
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
    const costMicroUsd = result.actualCostMicroUsd
      ?? estimateCostMicroUsd(result.model, result.inputTokens, result.outputTokens);
    const analysisTierDelivered = result.storyPack.version === "3.0.0" ? "deep" : "standard";
    const evidenceScrubbedAt = sourceSnapshot.narrativeEvidence ? completedAtIso : null;
    const evidenceReceipt = sourceSnapshot.narrativeEvidence ? {
      excerptCount: sourceSnapshot.narrativeEvidence.excerpts.length,
      sessionCount: new Set(sourceSnapshot.narrativeEvidence.excerpts.map((excerpt) => excerpt.sessionRef)).size,
      byteSize: new TextEncoder().encode(JSON.stringify(sourceSnapshot.narrativeEvidence)).byteLength,
      selectionPolicyVersion: sourceSnapshot.narrativeEvidence.policy.excerptSelection,
      consentVersion: sourceSnapshot.narrativeEvidence.consent.statementVersion,
      scrubbedAt: completedAtIso,
    } : null;
    const observability = {
      providerCounts: Object.fromEntries(sourceSnapshot.sourceSelection.providers.map((item) => [item.provider, item.sessionsIncluded])),
      promptVersion: NARRATIVE_PROMPT_VERSION,
      schemaVersion: sourceSnapshot.schemaVersion,
      generationLatencyMs: result.generationLatencyMs,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      reasoningTokens: result.reasoningTokens,
      cachedTokens: result.cachedTokens,
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
               input_tokens = ?, output_tokens = ?, reasoning_tokens = ?, cached_tokens = ?, cost_micro_usd = ?,
               analysis_tier_delivered = ?, provider_request_ids_json = ?, evidence_scrubbed_at = ?, evidence_receipt_json = ?,
               fallbacks_used_json = ?, last_error_code = NULL, updated_at = ?
           WHERE id = ? AND status != 'failed'`,
        )
        .bind(
          result.provider,
          result.model,
          JSON.stringify({
            sections: sanitizedSections,
            storyPack: result.storyPack,
            analysisTierRequested,
            analysisTierDelivered,
            evidenceScrubbedAt,
            observability,
          }),
          result.inputTokens,
          result.outputTokens,
          result.reasoningTokens,
          result.cachedTokens,
          costMicroUsd,
          analysisTierDelivered,
          JSON.stringify(result.requestIds),
          evidenceScrubbedAt,
          evidenceReceipt ? JSON.stringify(evidenceReceipt) : null,
          JSON.stringify(result.fallbacksUsed),
          completedAtIso,
          narrativeId,
        ),
      db
        .prepare(
          "UPDATE buildstory_narrative_jobs SET status = 'completed', lease_until = NULL, last_error_code = NULL, updated_at = ? WHERE narrative_id = ?",
        )
        .bind(completedAtIso, narrativeId),
      db
        .prepare("UPDATE buildstory_reports SET snapshot_json = ?, updated_at = ? WHERE id = ?")
        .bind(JSON.stringify(reportSnapshot), completedAtIso, narrative.report_id),
      ...(evidenceScrubbedAt
        ? [db
            .prepare("UPDATE buildstory_reports SET source_snapshot_json = ?, updated_at = ? WHERE id = ?")
            .bind(JSON.stringify({ ...sourceSnapshot, narrativeEvidence: undefined }), completedAtIso, narrative.report_id),
          db.prepare("UPDATE buildstory_upload_sessions SET snapshot_json = ?, updated_at = ? WHERE id = ?")
            .bind(JSON.stringify({ ...sourceSnapshot, narrativeEvidence: undefined }), completedAtIso, report.upload_session_id)]
        : []),
    ]);
    await reconcileNarrativeSpend(db, narrative, costMicroUsd);
  } catch (error) {
    const errorCode = error instanceof NarrativeProviderError ? error.code : "narrative_generation_failed";
    const validationFailure = error instanceof NarrativeProviderError ? error.validationDiagnostic : null;
    const failureAtIso = new Date().toISOString();
    const failureUsage = error instanceof NarrativeProviderError ? error.usage : null;
    const failureCostMicroUsd = failureUsage
      ? failureUsage.costMicroUsd ?? estimateCostMicroUsd("deepseek/deepseek-v4-flash", failureUsage.inputTokens, failureUsage.outputTokens)
      : null;
    const job = await db
      .prepare("SELECT attempts FROM buildstory_narrative_jobs WHERE narrative_id = ?")
      .bind(narrativeId)
      .first<{ attempts: number }>();
    // Deep runs two provider calls per attempt at high reasoning effort, so a
    // requeue is twice as expensive as Standard's. Now that a schema/JSON
    // miss is retryable (see NarrativeProviderError in provider.ts) instead
    // of terminal on the first failure, Deep gets one requeue - not two -
    // to bound the added cost of that change.
    const maxAttempts = analysisTierForFailure === "deep" ? 2 : 3;
    const terminal = (error instanceof NarrativeProviderError && !error.retryable) || Number(job?.attempts ?? 1) >= maxAttempts;
    const retryAt = new Date(Date.now() + 60_000).toISOString();
    if (terminal) {
      const terminalReceipt = sourceSnapshotForScrub?.narrativeEvidence ? {
        excerptCount: sourceSnapshotForScrub.narrativeEvidence.excerpts.length,
        sessionCount: new Set(sourceSnapshotForScrub.narrativeEvidence.excerpts.map((excerpt) => excerpt.sessionRef)).size,
        byteSize: new TextEncoder().encode(JSON.stringify(sourceSnapshotForScrub.narrativeEvidence)).byteLength,
        selectionPolicyVersion: sourceSnapshotForScrub.narrativeEvidence.policy.excerptSelection,
        consentVersion: sourceSnapshotForScrub.narrativeEvidence.consent.statementVersion,
        scrubbedAt: failureAtIso,
      } : null;
      const terminalUpdates = [
        db
          .prepare(
            "UPDATE buildstory_narrative_jobs SET status = 'failed', lease_until = NULL, last_error_code = ?, updated_at = ? WHERE narrative_id = ?",
          )
          .bind(errorCode, failureAtIso, narrativeId),
        db
          .prepare(
            `UPDATE buildstory_narratives
             SET status = 'failed', sections_json = ?, evidence_scrubbed_at = ?, evidence_receipt_json = ?,
                 input_tokens = ?, output_tokens = ?, reasoning_tokens = ?, cached_tokens = ?, cost_micro_usd = ?,
                 provider_request_ids_json = ?, last_error_code = ?, updated_at = ?
             WHERE id = ?`,
          )
          .bind(JSON.stringify({
            sections: null,
            storyPack: null,
            analysisTierRequested: analysisTierForFailure,
            // Nothing was delivered on a terminal failure - hardcoding
            // "standard" here made every failed Deep narrative
            // indistinguishable from a failed Standard one in anything that
            // read analysisTierDelivered instead of analysisTierRequested.
            analysisTierDelivered: null,
            evidenceScrubbedAt: sourceSnapshotForScrub?.narrativeEvidence ? failureAtIso : null,
            ...(validationFailure ? { validationFailure } : {}),
          }), terminalReceipt ? failureAtIso : null, terminalReceipt ? JSON.stringify(terminalReceipt) : null,
          failureUsage?.inputTokens ?? 0,
          failureUsage?.outputTokens ?? 0,
          failureUsage?.reasoningTokens ?? 0,
          failureUsage?.cachedTokens ?? 0,
          failureCostMicroUsd ?? 0,
          failureUsage?.requestIds.length ? JSON.stringify(failureUsage.requestIds) : null,
          errorCode, failureAtIso, narrativeId),
      ];
      if (sourceSnapshotForScrub?.narrativeEvidence && reportIdForScrub) {
        terminalUpdates.push(
          db
            .prepare("UPDATE buildstory_reports SET source_snapshot_json = ?, updated_at = ? WHERE id = ?")
            .bind(JSON.stringify({ ...sourceSnapshotForScrub, narrativeEvidence: undefined }), failureAtIso, reportIdForScrub),
          db.prepare("UPDATE buildstory_upload_sessions SET snapshot_json = ?, updated_at = ? WHERE report_id = ?")
            .bind(JSON.stringify({ ...sourceSnapshotForScrub, narrativeEvidence: undefined }), failureAtIso, reportIdForScrub),
        );
      }
      await db.batch(terminalUpdates);
      if (failureCostMicroUsd !== null && claimedNarrative) {
        await reconcileNarrativeSpend(db, claimedNarrative, failureCostMicroUsd);
      } else {
        await releaseNarrativeReservation(db, narrativeId);
      }
    } else {
      await db
        .prepare(
          "UPDATE buildstory_narrative_jobs SET status = 'pending', available_at = ?, lease_until = NULL, last_error_code = ?, updated_at = ? WHERE narrative_id = ?",
        )
        .bind(retryAt, errorCode, failureAtIso, narrativeId)
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
  narrativeMode: "local" | "byok" | "cloud" | "off" = "local",
  targetProjectId: string | null = null,
  narrativeProvider: "openrouter" | "openai" | "ollama" | "openai-compatible" | null = null,
): Promise<{
  session: UploadSessionView;
  deviceAuthorization: DeviceAuthorization;
}> {
  if (targetProjectId) {
    const project = await (await database())
      .prepare("SELECT 1 FROM buildstory_projects WHERE id = ? AND owner_user_id = ?")
      .bind(targetProjectId, ownerUserId)
      .first();
    if (!project) throw new D1IngestionError("not_found", "Project not found.", 404);
  }
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 15 * 60_000);
  const id = makeId("upl");
  const deviceCode = makeDeviceCode();
  const label = projectLabel.trim().slice(0, 120) || "New local project";
  const createdAtIso = createdAt.toISOString();
  const expiresAtIso = expiresAt.toISOString();
  const statusDetail = "Waiting for a scanner to claim the one-time connection code.";
  const resolvedProvider = narrativeMode === "cloud" ? narrativeProvider ?? configuredCloudNarrativeProvider() : narrativeMode === "local" ? "ollama" : narrativeProvider;
  const account = ownerUserId
    ? await (await database()).prepare("SELECT plan FROM buildstory_users WHERE id = ?").bind(ownerUserId).first<{ plan: string }>()
    : null;
  // Early, friendly check before a device-code session is even created (and before the
  // local scanner runs) - acceptSnapshot below is the authoritative enforcement point,
  // since targetProjectId here is only a client-side hint, not the real project match.
  if (targetProjectId && ownerUserId && effectivePlan(account?.plan === "pro" ? "pro" : "free") !== "pro") {
    const used = await getFeatureBudgetCount(ownerUserId, "rescan");
    if (used >= MONTHLY_RESCAN_CAP_FREE) {
      throw new D1IngestionError(
        "rescan_limit_reached",
        `Free accounts get ${MONTHLY_RESCAN_CAP_FREE} project updates a month. Upgrade to Pro for unlimited updates.`,
        403,
      );
    }
  }
  const analysisTier = narrativeMode === "local" || narrativeMode === "off"
    ? "standard"
    : effectivePlan(account?.plan === "pro" ? "pro" : "free") === "pro" ? "deep" : "standard";
  await (await database())
    .prepare(
      `INSERT INTO buildstory_upload_sessions (
        id, creator_id, owner_user_id, target_project_id, project_label, narrative_model, narrative_mode, narrative_provider, analysis_tier, status, created_at, expires_at,
        status_detail, device_code_hash, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'awaiting_scanner', ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      creatorId,
      ownerUserId,
      targetProjectId,
      label,
      narrativeModel,
      narrativeMode,
      resolvedProvider,
      analysisTier,
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
    narrativeProvider: resolvedProvider,
    analysisTier,
    status: "awaiting_scanner",
    createdAt: createdAtIso,
    expiresAt: expiresAtIso,
    scannerAuthorizedAt: null,
    snapshotReceivedAt: null,
    reportId: null,
    statusDetail,
    narrativeStatus: null,
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
  const narrative = row.report_id ? await narrativeByReportId(row.report_id) : null;
  return cleanSession(row, narrativeStatusValue(narrative?.status));
}

export async function claimUploadSession(
  sessionId: string,
  userCode: string,
  narrativeModes?: Array<"local" | "byok" | "cloud" | "off">,
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
  const narrativeMode = row.narrative_mode === "local" || row.narrative_mode === "byok" || row.narrative_mode === "off" ? row.narrative_mode : "cloud";
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
    ...(narrativeModes
      ? {
          narrative: {
            mode: narrativeMode,
            provider: row.narrative_provider === "openai" || row.narrative_provider === "ollama" || row.narrative_provider === "openai-compatible" ? row.narrative_provider : narrativeMode === "off" ? null : "openrouter",
            model: narrativeMode === "cloud" ? configuredCloudNarrativeModel() : row.narrative_model,
            analysisTier: narrativeMode === "local" ? "standard" : row.analysis_tier === "deep" ? "deep" : "standard",
          },
        }
      : {}),
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
  const hasUploadedEvidence = Boolean(validated.snapshot.narrativeEvidence?.excerpts.length);
  const sessionMode = row.narrative_mode === "local" || row.narrative_mode === "byok" || row.narrative_mode === "off" ? row.narrative_mode : "cloud";
  if (sessionMode !== "cloud" && hasUploadedEvidence) {
    throw new D1IngestionError("narrative_mode_mismatch", "This connection mode does not authorize conversation-excerpt uploads.", 422);
  }
  if ((sessionMode === "cloud" || sessionMode === "off") && validated.snapshot.generatedNarrative) {
    throw new D1IngestionError("narrative_mode_mismatch", "This connection mode does not authorize an uploaded generated narrative.", 422);
  }
  if (hasUploadedEvidence) {
    const expectedPolicy = row.analysis_tier === "deep" ? "deep-evidence-v2" : "deterministic-heuristic-v1";
    if (validated.snapshot.narrativeEvidence?.policy.excerptSelection !== expectedPolicy) {
      throw new D1IngestionError("analysis_tier_mismatch", "The evidence-selection policy does not match the analysis tier authorized by this connection.", 422);
    }
  }

  const user = await userByAuthSubject(row.creator_id);
  if (!user) {
    throw new D1IngestionError(
      "creator_not_provisioned",
      "This creator has no account record yet. Sign in through the dashboard once before scanning.",
      409,
    );
  }
  // Anti-abuse only, not a plan lever: scanning through local/BYOK/off mode is
  // unlimited on every tier (that compute cost is the creator's, not ours),
  // but every accepted upload - a new project's first report or an existing
  // project's next chapter alike - still persists a full snapshot_json and
  // source_snapshot_json into D1, which is a real, unbounded storage cost on
  // our side. The ceiling is set well above any real creator's use and
  // matches the LIMIT 500 already assumed throughout exportAccountData, so a
  // truncated export can't silently happen before this refusal would.
  const reportCount = await (await database())
    .prepare("SELECT COUNT(*) AS count FROM buildstory_reports WHERE owner_user_id = ?")
    .bind(user.id)
    .first<{ count: number }>();
  if ((reportCount?.count ?? 0) >= MAX_STORED_REPORTS_PER_ACCOUNT) {
    throw new D1IngestionError(
      "report_limit_reached",
      `This account has reached its ${MAX_STORED_REPORTS_PER_ACCOUNT}-report storage limit. Delete an existing project or report before scanning a new one.`,
      403,
    );
  }
  if (row.target_project_id) {
    const targetProject = await (await database())
      .prepare("SELECT owner_user_id, repository_fingerprint, name FROM buildstory_projects WHERE id = ?")
      .bind(row.target_project_id)
      .first<{ owner_user_id: string; repository_fingerprint: string; name: string }>();
    if (!targetProject || targetProject.owner_user_id !== user.id) {
      throw new D1IngestionError("not_found", "Project not found.", 404);
    }
    if (targetProject.repository_fingerprint !== validated.snapshot.repository.fingerprint) {
      throw new D1IngestionError(
        "project_fingerprint_mismatch",
        `This scan is from a different repository than "${targetProject.name}".`,
        422,
      );
    }
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
  // Authoritative rescan-cap enforcement: targetProjectId above is only a client-side
  // hint, so this is the one true "this counts as a rescan" moment regardless of which
  // UI flow the client came through (also catches a "Create a story" scan that happens
  // to fingerprint-match an existing project). A project's first-ever scan never counts.
  if (project.isExisting) {
    const account = await (await database()).prepare("SELECT plan FROM buildstory_users WHERE id = ?").bind(user.id).first<{ plan: string }>();
    if (effectivePlan(account?.plan === "pro" ? "pro" : "free") !== "pro") {
      const used = await getFeatureBudgetCount(user.id, "rescan");
      if (used >= MONTHLY_RESCAN_CAP_FREE) {
        throw new D1IngestionError(
          "rescan_limit_reached",
          `Free accounts get ${MONTHLY_RESCAN_CAP_FREE} project updates a month. Upgrade to Pro for unlimited updates.`,
          403,
        );
      }
    }
    await incrementFeatureBudget(user.id, "rescan");
  }

  const acceptedAt = new Date().toISOString();
  const reportId = makeId("rpt");
  const receiptId = makeId("rcpt");
  const jobId = makeId("job");
  const reportSnapshot = reportSnapshotFromScanner(validated.snapshot, project, {
    id: user.id,
    name: user.display_name,
    handle: user.handle,
    role: builderRoleLabel(isBuilderRole(user.builder_role) ? user.builder_role : null) ?? user.bio ?? "AI-assisted software builder",
  });
  const db = await database();

  // Carry forward the previous chapter's editorial choices - without this, every
  // update would silently reset to DEFAULT_PUBLIC_FIELDS/no category/no artifact
  // links, discarding everything the creator set up on the prior chapter. Only
  // carry tagline/description if the creator actually rewrote them away from the
  // scanner's own defaults; otherwise the freshly regenerated text is a better
  // default than an old chapter's stale auto-generated copy.
  const previousReportRow = await db
    .prepare(
      `SELECT selected_public_fields_json, editorial_tagline, editorial_description, editorial_reflection, category,
              story_background_id, artifact_project_url, artifact_repo_url, artifact_video_url, snapshot_json
       FROM buildstory_reports WHERE project_id = ? ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(project.id)
    .first<{
      selected_public_fields_json: string; editorial_tagline: string; editorial_description: string; editorial_reflection: string;
      category: string | null; story_background_id: string; artifact_project_url: string | null; artifact_repo_url: string | null;
      artifact_video_url: string | null; snapshot_json: string;
    }>();
  const previousSnapshotIdentity = previousReportRow ? parseJson<ProjectSnapshot>(previousReportRow.snapshot_json, "report snapshot").identity : null;
  const carryForwardTagline = previousReportRow && previousSnapshotIdentity && previousReportRow.editorial_tagline !== previousSnapshotIdentity.tagline
    ? previousReportRow.editorial_tagline
    : reportSnapshot.identity.tagline;
  const carryForwardDescription = previousReportRow && previousSnapshotIdentity && previousReportRow.editorial_description !== previousSnapshotIdentity.description
    ? previousReportRow.editorial_description
    : reportSnapshot.identity.description;
  const carryForwardFields = previousReportRow ? previousReportRow.selected_public_fields_json : JSON.stringify(DEFAULT_PUBLIC_FIELDS);
  const carryForwardReflection = previousReportRow?.editorial_reflection ?? "";
  const carryForwardCategory = previousReportRow?.category ?? null;
  const carryForwardBackground = previousReportRow?.story_background_id ?? DEFAULT_STORY_BACKGROUND_ID;
  const carryForwardArtifact = {
    projectUrl: previousReportRow?.artifact_project_url ?? null,
    repoUrl: previousReportRow?.artifact_repo_url ?? null,
    videoUrl: previousReportRow?.artifact_video_url ?? null,
  };
  const results = await db.batch([
    db
      .prepare(
        `INSERT INTO buildstory_reports (
          id, creator_id, owner_user_id, project_id, upload_session_id, status, created_at,
          source_snapshot_json, snapshot_json, selected_public_fields_json,
          editorial_tagline, editorial_description, editorial_reflection, category,
          story_background_id, artifact_project_url, artifact_repo_url, artifact_video_url,
          publication_status, publication_slug, updated_at
        )
        SELECT ?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'not_published', ?, ?
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
        carryForwardFields,
        carryForwardTagline,
        carryForwardDescription,
        carryForwardReflection,
        carryForwardCategory,
        carryForwardBackground,
        carryForwardArtifact.projectUrl,
        carryForwardArtifact.repoUrl,
        carryForwardArtifact.videoUrl,
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
    await storeLocalNarrative(reportId, user.id, validated.snapshot.generatedNarrative, row.narrative_model, row.analysis_tier === "deep" ? "deep" : "standard");
  } else if (row.narrative_mode === "local" || row.narrative_mode === "byok") {
    // Generation was attempted on the creator's machine (Ollama or a BYOK
    // provider) and produced nothing - record it as failed rather than
    // falling through to the narrativeEvidence branch, which local/byok
    // scans never carry.
    await storeLocalNarrative(reportId, user.id, undefined, row.narrative_model, row.analysis_tier === "deep" ? "deep" : "standard");
  } else if (validated.snapshot.narrativeEvidence && validated.snapshot.narrativeEvidence.excerpts.length > 0) {
    const narrativeId = await createNarrativeJob(reportId, user.id);
    await enqueueNarrative(narrativeId);
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
  const narrative = row.report_id ? await narrativeByReportId(row.report_id) : null;
  return {
    protocolVersion: "1.0" as const,
    status: status as "accepted" | "processing" | "ready" | "failed",
    reportReady: status === "ready",
    narrativeStatus: narrative?.status ?? "not_requested" as const,
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
  let row = await reportByIdForCreator(creatorId, reportId);
  if (!row) {
    throw new D1IngestionError("not_found", "Report not found.", 404);
  }
  await processReportJob(reportId);
  row = await reportByIdForCreator(creatorId, reportId);
  if (!row) {
    throw new D1IngestionError("not_found", "Report not found.", 404);
  }
  const narrativeRow = await narrativeByReportId(reportId);
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
       WHERE id = ? AND project_id = ?`,
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
      report.projectId,
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

/** Owner access or an exact media ID present in the frozen public projection. */
export async function canReadReportMedia(r2Key: string, creatorId: string | null): Promise<boolean> {
  const row = await (await database())
    .prepare(
      `SELECT m.id, r.creator_id, i.story_json
       FROM buildstory_report_media m
       JOIN buildstory_reports r ON r.id = m.report_id
       LEFT JOIN buildstory_public_story_index i ON i.report_id = r.id
       WHERE m.r2_key = ? LIMIT 1`,
    )
    .bind(r2Key)
    .first<{ id: string; creator_id: string; story_json: string | null }>();
  if (!row) return false;
  if (creatorId && row.creator_id === creatorId) return true;
  if (!row.story_json) return false;
  try {
    const story = JSON.parse(row.story_json) as { artifactMedia?: Array<{ id?: unknown }> };
    return Array.isArray(story.artifactMedia) && story.artifactMedia.some((media) => media.id === row.id);
  } catch {
    return false;
  }
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
  if (report.narrative?.status === "queued" || report.narrative?.status === "generating") {
    throw new D1IngestionError(
      "narrative_pending",
      "The AI narrative is still being generated. You can browse the private report while it finishes.",
      409,
    );
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
  const project = await db
    .prepare("SELECT slug FROM buildstory_projects WHERE id = ? AND owner_user_id = ?")
    .bind(report.projectId, owner.id)
    .first<{ slug: string }>();
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
  const canonicalSlug = project?.slug ?? report.publication.slug;
  const canonicalPath = `${handle}/${canonicalSlug}`;
  const canonicalUrl = `${publicOrigin()}/u/${owner.handle}/${canonicalSlug}`;
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

  // Compute the chapter's delta against the immediately-preceding chapter, once, at
  // publish time - never re-derived on a public read, same rationale as story_json.
  let chapterDeltaJson: string | null = null;
  if (chapterIndex > 1) {
    const previousChapter = await db
      .prepare("SELECT snapshot_json FROM buildstory_reports WHERE project_id = ? AND chapter_index = ?")
      .bind(report.projectId, chapterIndex - 1)
      .first<{ snapshot_json: string }>();
    if (previousChapter) {
      const previousSnapshot = parseJson<ProjectSnapshot>(previousChapter.snapshot_json, "report snapshot");
      chapterDeltaJson = JSON.stringify(computeChapterDelta(previousSnapshot, report.snapshot, chapterIndex - 1, chapterIndex));
    }
  }

  const publicStory = publicBuildStoryFromSnapshot(
    report.snapshot,
    report.selectedPublicFields,
    { tagline: report.editorial.tagline, description: report.editorial.description, reflection: report.editorial.reflection, category: report.category },
    { ...report.artifact, media: await listReportMedia(reportId) },
    { storyBackgroundId: report.storyBackgroundId },
  );
  const publicCoverUrl = publicStory.artifactMedia.find((item) => item.kind === "cover")?.url ?? publicStory.artifactMedia[0]?.url ?? null;
  const publicSearchText = [publicStory.name, publicStory.tagline, publicStory.description, publicStory.owner.name, publicStory.owner.handle, publicStory.category, ...publicStory.stack, ...publicStory.tools.map((tool) => tool.label), ...publicStory.models.map((model) => model.label)].join(" ").slice(0, 12_000);
  // Gated at publish time and frozen into story_json, exactly like every other public
  // field - a creator who never republishes after toggling a field off must not have
  // that field's numbers reappear here just because the delta band re-reads live state.
  const publicStoryWithDelta = {
    ...publicStory,
    chapterDelta: chapterDeltaJson ? publicChapterDelta(JSON.parse(chapterDeltaJson) as ChapterDelta, report.selectedPublicFields) : null,
  };
  statements.push(
    db
      .prepare(
        `UPDATE buildstory_reports SET publication_status = 'published', publication_path = ?, published_at = ?, public_url = ?, chapter_index = ?, chapter_delta_json = ?, updated_at = ?
         WHERE id = ? AND project_id = ?`,
      )
      .bind(thisPath, publishedAt, thisUrl, chapterIndex, chapterDeltaJson, publishedAt, reportId, report.projectId),
  );
  statements.push(
    db.prepare(`INSERT INTO buildstory_public_story_index (report_id, story_json, category, search_text, has_live_demo, cover_url, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(report_id) DO UPDATE SET story_json = excluded.story_json, category = excluded.category, search_text = excluded.search_text, has_live_demo = excluded.has_live_demo, cover_url = excluded.cover_url, updated_at = excluded.updated_at`)
      .bind(reportId, JSON.stringify(publicStoryWithDelta), report.category, publicSearchText, publicStory.artifactLinks.projectUrl ? 1 : 0, publicCoverUrl, publishedAt),
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
  if (chapterIndex > 1) {
    await notifyFollowersOfStoryUpdate(reportId, owner.id);
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
  const owner = await userByAuthSubject(creatorId);
  const ownerId = owner?.id ?? "";
  const row = await db
    .prepare(
      `SELECT r.project_id, r.publication_path
       FROM buildstory_reports r
       LEFT JOIN buildstory_projects p ON p.id = r.project_id
       WHERE r.id = ?
         AND (r.creator_id = ? OR r.owner_user_id = ? OR p.owner_user_id = ?)
         AND r.publication_status IN ('published', 'draft_changes')`,
    )
    .bind(reportId, creatorId, ownerId, ownerId)
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
        `SELECT r.id, p.slug FROM buildstory_reports r JOIN buildstory_projects p ON p.id = r.project_id
         WHERE r.project_id = ? AND r.publication_status IN ('published', 'draft_changes') AND r.id != ?
         ORDER BY chapter_index DESC LIMIT 1`,
      )
      .bind(row.project_id, reportId)
      .first<{ id: string; slug: string }>();
    if (next) {
      const owner = await userByAuthSubject(creatorId);
      if (owner) {
        const canonicalPath = `${owner.handle.toLocaleLowerCase("en-US")}/${next.slug}`;
        const canonicalUrl = `${publicOrigin()}/u/${owner.handle}/${next.slug}`;
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

/**
 * Moderator-triggered unpublish, unlike unpublishReport: no ownership check,
 * and reportId is looked up directly (not scoped to a creatorId) since the
 * caller is acting on a filed content report, not the report's own owner.
 * Mirrors unpublishReport's canonical-path reassignment so an older chapter
 * can still take over the project's main URL when the unpublished report
 * held it.
 */
export async function moderatorUnpublishReport(reportId: string): Promise<void> {
  const db = await database();
  const row = await db
    .prepare(
      `SELECT r.project_id, r.publication_path, u.handle AS owner_handle
       FROM buildstory_reports r
       JOIN buildstory_projects p ON p.id = r.project_id
       JOIN buildstory_users u ON u.id = p.owner_user_id
       WHERE r.id = ? AND r.publication_status IN ('published', 'draft_changes')`,
    )
    .bind(reportId)
    .first<{ project_id: string; publication_path: string | null; owner_handle: string }>();
  if (!row) return;

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
        `SELECT r.id, p.slug FROM buildstory_reports r JOIN buildstory_projects p ON p.id = r.project_id
         WHERE r.project_id = ? AND r.publication_status IN ('published', 'draft_changes') AND r.id != ?
         ORDER BY chapter_index DESC LIMIT 1`,
      )
      .bind(row.project_id, reportId)
      .first<{ id: string; slug: string }>();
    if (next) {
      const canonicalPath = `${row.owner_handle.toLocaleLowerCase("en-US")}/${next.slug}`;
      const canonicalUrl = `${publicOrigin()}/u/${row.owner_handle}/${next.slug}`;
      statements.push(
        db
          .prepare("UPDATE buildstory_reports SET publication_path = ?, public_url = ?, updated_at = ? WHERE id = ?")
          .bind(canonicalPath, canonicalUrl, now, next.id),
      );
    }
  }
  await db.batch(statements);
}

/** Bootstraps or changes a moderator/admin. Handle-based since that's the only identifier an operator has on hand. */
export async function setUserRoleByHandle(
  handle: string,
  role: "member" | "moderator" | "admin",
): Promise<{ id: string; handle: string; role: string }> {
  const db = await database();
  const now = new Date().toISOString();
  const row = await db
    .prepare(
      "UPDATE buildstory_users SET role = ?, updated_at = ? WHERE handle_lower = ? RETURNING id, handle, role",
    )
    .bind(role, now, handle.trim().toLocaleLowerCase("en-US"))
    .first<{ id: string; handle: string; role: string }>();
  if (!row) throw new D1IngestionError("not_found", "No user with that handle.", 404);
  return row;
}

/**
 * Flips account status. Suspension relies on the account_suspended checks
 * already scattered through this file (ensureUser and friends) - this is
 * the missing piece that actually sets the status those checks read.
 */
export async function setUserStatusById(
  userId: string,
  status: "active" | "suspended",
): Promise<{ id: string; handle: string; status: string }> {
  const db = await database();
  const now = new Date().toISOString();
  const row = await db
    .prepare("UPDATE buildstory_users SET status = ?, updated_at = ? WHERE id = ? RETURNING id, handle, status")
    .bind(status, now, userId)
    .first<{ id: string; handle: string; status: string }>();
  if (!row) throw new D1IngestionError("not_found", "User not found.", 404);
  return row;
}

export async function publicationStatusForProject(
  creatorId: string,
  projectId: string,
) {
  const owner = await userByAuthSubject(creatorId);
  const ownerId = owner?.id ?? "";
  const row = await (await database())
    .prepare(
      `SELECT publication_status, publication_slug, published_at, public_url
       FROM buildstory_reports
       WHERE project_id = ? AND (owner_user_id = ? OR creator_id = ?)
       ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(projectId, ownerId, creatorId)
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

/** Owner-scoped project list for /studio/projects - one row per project, not per scan. */
export async function listProjects(creatorId: string): Promise<ProjectSummary[]> {
  const owner = await userByAuthSubject(creatorId);
  if (!owner) return [];
  const db = await database();
  const projectRows = await db
    .prepare("SELECT id, slug, name FROM buildstory_projects WHERE owner_user_id = ?")
    .bind(owner.id)
    .all<{ id: string; slug: string; name: string }>();
  if (projectRows.results.length === 0) return [];
  const reportRows = await db
    .prepare(
      `SELECT id, project_id, status, created_at, publication_status, public_url, chapter_index
       FROM buildstory_reports
       WHERE (owner_user_id = ? OR creator_id = ?)
       ORDER BY created_at DESC`,
    )
    .bind(owner.id, creatorId)
    .all<{ id: string; project_id: string; status: string; created_at: string; publication_status: string; public_url: string | null; chapter_index: number | null }>();
  const reportsByProject = new Map<string, typeof reportRows.results>();
  for (const row of reportRows.results) {
    const list = reportsByProject.get(row.project_id) ?? [];
    list.push(row);
    reportsByProject.set(row.project_id, list);
  }
  const summaries: ProjectSummary[] = [];
  for (const project of projectRows.results) {
    const reports = reportsByProject.get(project.id) ?? [];
    const latest = reports[0]; // already ordered by created_at DESC
    if (!latest) continue;
    const published = reports
      .filter((report) => report.chapter_index !== null)
      .sort((left, right) => (right.chapter_index ?? 0) - (left.chapter_index ?? 0));
    const canonical = published[0] ?? null;
    summaries.push({
      id: project.id,
      slug: project.slug,
      name: project.name,
      chapterCount: published.length,
      latestChapterIndex: canonical?.chapter_index ?? null,
      latestPublicationStatus: latest.publication_status as PublicationStatus,
      latestReportId: latest.id,
      latestReportStatus: latest.status as ReportStatus,
      lastScanAt: latest.created_at,
      publicUrl: canonical?.public_url ?? null,
    });
  }
  return summaries.sort((left, right) => right.lastScanAt.localeCompare(left.lastScanAt));
}

/** Owner-scoped project detail - every report (chapter or not) belonging to this project. */
export async function getProjectDetail(creatorId: string, projectId: string): Promise<ProjectDetail> {
  const owner = await userByAuthSubject(creatorId);
  if (!owner) throw new D1IngestionError("not_found", "Creator account not found.", 404);
  const db = await database();
  const project = await db
    .prepare("SELECT id, slug, name FROM buildstory_projects WHERE id = ? AND owner_user_id = ?")
    .bind(projectId, owner.id)
    .first<{ id: string; slug: string; name: string }>();
  if (!project) throw new D1IngestionError("not_found", "Project not found.", 404);
  const reportRows = await db
    .prepare(
      `SELECT id, status, chapter_index, publication_status, created_at, published_at, editorial_tagline, public_url, chapter_delta_json
       FROM buildstory_reports
       WHERE project_id = ? AND (owner_user_id = ? OR creator_id = ?)
       ORDER BY created_at DESC`,
    )
    .bind(projectId, owner.id, creatorId)
    .all<{ id: string; status: string; chapter_index: number | null; publication_status: string; created_at: string; published_at: string | null; editorial_tagline: string; public_url: string | null; chapter_delta_json: string | null }>();
  const canonical = reportRows.results
    .filter((row) => row.chapter_index !== null)
    .sort((left, right) => (right.chapter_index ?? 0) - (left.chapter_index ?? 0))[0] ?? null;
  return {
    id: project.id,
    slug: project.slug,
    name: project.name,
    publicUrl: canonical?.public_url ?? null,
    reports: reportRows.results.map((row) => ({
      reportId: row.id,
      status: row.status as ReportStatus,
      chapterIndex: row.chapter_index,
      publicationStatus: row.publication_status as PublicationStatus,
      createdAt: row.created_at,
      publishedAt: row.published_at,
      chapterDelta: row.chapter_delta_json ? parseJson<ChapterDelta>(row.chapter_delta_json, "chapter delta") : null,
      editorialTagline: row.editorial_tagline,
    })),
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
       WHERE u.handle_lower = ? AND r.publication_slug = ? AND r.publication_status IN ('published', 'draft_changes')
       LIMIT 1`,
    )
    .bind(handle.toLocaleLowerCase("en-US"), slug)
    .first<{ verified_repo_at: string | null }>();
  return row?.verified_repo_at ?? null;
}

/**
 * Reads back the exact projection frozen at the last publish (buildstory_public_story_index.story_json).
 * A report in `draft_changes` has unsaved edits sitting in its own snapshot_json/selected_public_fields_json/
 * editorial_* columns - those must never be re-derived for a public read, or every save would leak the
 * creator's unpublished changes onto the still-live public URL. This is what keeps the last published
 * version visibly live instead of 404ing the moment a creator saves anything.
 */
async function frozenPublicStory(reportId: string): Promise<(PublicBuildStoryViewModel & { reportId: string; chapterDelta: ChapterDelta | null }) | null> {
  const row = await (await database())
    .prepare("SELECT story_json FROM buildstory_public_story_index WHERE report_id = ?")
    .bind(reportId)
    .first<{ story_json: string }>();
  if (!row) return null;
  const parsed = parseJson<PublicBuildStoryViewModel & { chapterDelta?: ChapterDelta | null }>(row.story_json, "public story index");
  return { ...parsed, reportId, chapterDelta: parsed.chapterDelta ?? null };
}

/** Public boundary: this query does not select the private source snapshot. */
export async function getPublishedStoryBySlug(slug: string) {
  const row = await (await database())
    .prepare(
      `SELECT id AS report_id, publication_status, snapshot_json, selected_public_fields_json, editorial_tagline, editorial_description, editorial_reflection, category, story_background_id,
              artifact_project_url, artifact_repo_url, artifact_video_url, chapter_delta_json
       FROM buildstory_reports
       WHERE publication_slug = ? AND publication_status IN ('published', 'draft_changes')
       ORDER BY chapter_index DESC LIMIT 1`,
    )
    .bind(slug)
    .first<{
      publication_status: string;
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
      chapter_delta_json: string | null;
    }>();
  if (!row) return null;
  if (row.publication_status === "draft_changes") return frozenPublicStory(row.report_id);
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
    ...publicBuildStoryFromSnapshot(snapshot, selected, { tagline: row.editorial_tagline, description: row.editorial_description, reflection: row.editorial_reflection, category: row.category as GeneratedReport["category"] }, {
      projectUrl: row.artifact_project_url,
      repoUrl: row.artifact_repo_url,
      videoUrl: row.artifact_video_url,
      media,
    }, { storyBackgroundId: isStoryBackgroundId(row.story_background_id) ? row.story_background_id : DEFAULT_STORY_BACKGROUND_ID }),
    reportId: row.report_id,
    chapterDelta: row.chapter_delta_json ? publicChapterDelta(parseJson<ChapterDelta>(row.chapter_delta_json, "chapter delta"), selected) : null,
  };
}

export async function getPublishedStory(handle: string, slug: string) {
  const row = await (await database()).prepare(
    `SELECT r.id AS report_id, r.publication_status, r.snapshot_json, r.selected_public_fields_json, r.editorial_tagline, r.editorial_description, r.editorial_reflection, r.category, r.story_background_id,
            r.artifact_project_url, r.artifact_repo_url, r.artifact_video_url, r.chapter_delta_json
     FROM buildstory_reports r JOIN buildstory_users u ON u.id = r.owner_user_id
     WHERE u.handle_lower = ? AND r.publication_path = ? AND r.publication_status IN ('published', 'draft_changes') LIMIT 1`,
  ).bind(handle.toLocaleLowerCase("en-US"), `${handle.toLocaleLowerCase("en-US")}/${slug}`).first<{
    report_id: string; publication_status: string; snapshot_json: string; selected_public_fields_json: string; editorial_tagline: string; editorial_description: string; editorial_reflection: string; category: string | null; story_background_id: string;
    artifact_project_url: string | null; artifact_repo_url: string | null; artifact_video_url: string | null; chapter_delta_json: string | null;
  }>();
  if (!row) return null;
  if (row.publication_status === "draft_changes") return frozenPublicStory(row.report_id);
  const snapshot = parseJson<ProjectSnapshot>(row.snapshot_json, "public report");
  const selected = parseJson<PublicFieldKey[]>(row.selected_public_fields_json, "public field");
  snapshot.identity.tagline = row.editorial_tagline;
  snapshot.identity.description = row.editorial_description;
  snapshot.identity.visibility = "public";
  const media = await listReportMedia(row.report_id);
  return {
    ...publicBuildStoryFromSnapshot(snapshot, selected, { tagline: row.editorial_tagline, description: row.editorial_description, reflection: row.editorial_reflection, category: row.category as GeneratedReport["category"] }, {
      projectUrl: row.artifact_project_url,
      repoUrl: row.artifact_repo_url,
      videoUrl: row.artifact_video_url,
      media,
    }, { storyBackgroundId: isStoryBackgroundId(row.story_background_id) ? row.story_background_id : DEFAULT_STORY_BACKGROUND_ID }),
    reportId: row.report_id,
    chapterDelta: row.chapter_delta_json ? publicChapterDelta(parseJson<ChapterDelta>(row.chapter_delta_json, "chapter delta"), selected) : null,
  };
}

/** A specific chapter of a project's public story, by its 1-based chapterIndex - used for the archival "<slug>/<n>" path. */
export async function getPublishedStoryChapter(handle: string, slug: string, chapterIndex: number) {
  const db = await database();
  // The current project slug is the public namespace. An older chapter can
  // retain the slug it had when it was first published, while the timeline
  // correctly links it beneath the project's current canonical URL.
  const canonical = await db.prepare(
    `SELECT r.project_id FROM buildstory_reports r JOIN buildstory_users u ON u.id = r.owner_user_id
     WHERE u.handle_lower = ? AND r.publication_path = ? AND r.publication_status IN ('published', 'draft_changes') LIMIT 1`,
  ).bind(handle.toLocaleLowerCase("en-US"), `${handle.toLocaleLowerCase("en-US")}/${slug}`).first<{ project_id: string }>();
  if (!canonical) return null;

  const row = await db.prepare(
    `SELECT r.id AS report_id, r.publication_status, r.snapshot_json, r.selected_public_fields_json, r.editorial_tagline, r.editorial_description, r.editorial_reflection, r.category, r.story_background_id,
            r.artifact_project_url, r.artifact_repo_url, r.artifact_video_url, r.chapter_delta_json
     FROM buildstory_reports r JOIN buildstory_users u ON u.id = r.owner_user_id
     WHERE u.handle_lower = ? AND r.project_id = ? AND r.publication_status IN ('published', 'draft_changes') AND r.chapter_index = ? LIMIT 1`,
  ).bind(handle.toLocaleLowerCase("en-US"), canonical.project_id, chapterIndex).first<{
    report_id: string; publication_status: string; snapshot_json: string; selected_public_fields_json: string; editorial_tagline: string; editorial_description: string; editorial_reflection: string; category: string | null; story_background_id: string;
    artifact_project_url: string | null; artifact_repo_url: string | null; artifact_video_url: string | null; chapter_delta_json: string | null;
  }>();
  if (!row) return null;
  if (row.publication_status === "draft_changes") return frozenPublicStory(row.report_id);
  const snapshot = parseJson<ProjectSnapshot>(row.snapshot_json, "public report");
  const selected = parseJson<PublicFieldKey[]>(row.selected_public_fields_json, "public field");
  snapshot.identity.tagline = row.editorial_tagline;
  snapshot.identity.description = row.editorial_description;
  snapshot.identity.visibility = "public";
  const media = await listReportMedia(row.report_id);
  return {
    ...publicBuildStoryFromSnapshot(snapshot, selected, { tagline: row.editorial_tagline, description: row.editorial_description, reflection: row.editorial_reflection, category: row.category as GeneratedReport["category"] }, {
      projectUrl: row.artifact_project_url,
      repoUrl: row.artifact_repo_url,
      videoUrl: row.artifact_video_url,
      media,
    }, { storyBackgroundId: isStoryBackgroundId(row.story_background_id) ? row.story_background_id : DEFAULT_STORY_BACKGROUND_ID }),
    reportId: row.report_id,
    chapterDelta: row.chapter_delta_json ? publicChapterDelta(parseJson<ChapterDelta>(row.chapter_delta_json, "chapter delta"), selected) : null,
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
  /**
   * The stored, gated ChapterDelta's own commit/active-day change - null only for
   * chapter 1, which has no previous chapter to compare against. Sourced from
   * chapter_delta_json rather than recomputed from adjacent absolute totals, so the
   * timeline never disagrees with the delta band shown elsewhere on the same page
   * (and never double-counts an incremental chapter's window - see chapter-delta.ts).
   */
  commitsDelta: number | null;
  activeDaysDelta: number | null;
  /** The full, already-gated delta against the previous chapter - null for chapter 1. Powers the project changelog. */
  chapterDelta: ChapterDelta | null;
};

/** All currently-published chapters of a project, oldest first - powers the timeline nav. */
export async function listPublishedChapters(handle: string, slug: string): Promise<PublishedChapterSummary[]> {
  const db = await database();
  const canonical = await db
    .prepare(
      `SELECT r.project_id FROM buildstory_reports r JOIN buildstory_users u ON u.id = r.owner_user_id
       WHERE u.handle_lower = ? AND r.publication_path = ? AND r.publication_status IN ('published', 'draft_changes') LIMIT 1`,
    )
    .bind(handle.toLocaleLowerCase("en-US"), `${handle.toLocaleLowerCase("en-US")}/${slug}`)
    .first<{ project_id: string }>();
  if (!canonical) return [];
  // Reads the frozen, already-gated public projection (buildstory_public_story_index),
  // never the private snapshot_json - a chapter the creator didn't select gitAggregates/
  // costEstimate for must show 0/null here too, exactly like everywhere else on the page.
  const rows = await db
    .prepare(
      `SELECT r.id, r.chapter_index, r.published_at, r.editorial_tagline, i.story_json FROM buildstory_reports r
       LEFT JOIN buildstory_public_story_index i ON i.report_id = r.id
       WHERE r.project_id = ? AND r.publication_status IN ('published', 'draft_changes') ORDER BY r.chapter_index ASC`,
    )
    .bind(canonical.project_id)
    .all<{ id: string; chapter_index: number | null; published_at: string | null; editorial_tagline: string; story_json: string | null }>();
  return rows.results.map((row) => {
    // story_json already carries the gated ChapterDelta baked in at publish time (see
    // publishReport) - read it straight from there instead of re-deriving, so the
    // timeline's inline deltas can never disagree with the "what changed" band.
    const publicStory = row.story_json ? parseJson<PublicBuildStoryViewModel & { chapterDelta?: ChapterDelta | null }>(row.story_json, "public story index") : null;
    return {
      reportId: row.id,
      chapterIndex: row.chapter_index ?? 1,
      publishedAt: row.published_at,
      tagline: row.editorial_tagline,
      commits: publicStory?.git.commits ?? 0,
      activeDays: publicStory?.activeDays ?? 0,
      costMicroUsd: publicStory?.cost?.totalMicroUsd ?? null,
      commitsDelta: publicStory?.chapterDelta?.build.commits.change ?? null,
      activeDaysDelta: publicStory?.chapterDelta?.build.activeDays.change ?? null,
      chapterDelta: publicStory?.chapterDelta ?? null,
    };
  });
}

/** IDs only, for social features (reactions/comments) to key off of - never content. */
export async function getPublicStoryIdentity(
  slug: string,
): Promise<{ reportId: string; ownerUserId: string | null; projectId: string } | null> {
  const row = await (await database())
    .prepare(
      "SELECT id, owner_user_id, project_id FROM buildstory_reports WHERE publication_slug = ? AND publication_status IN ('published', 'draft_changes') LIMIT 1",
    )
    .bind(slug)
    .first<{ id: string; owner_user_id: string | null; project_id: string }>();
  return row ? { reportId: row.id, ownerUserId: row.owner_user_id, projectId: row.project_id } : null;
}

export async function getPublicStoryIdentityByReportId(reportId: string) {
  const row = await (await database()).prepare(
    "SELECT id, owner_user_id, project_id FROM buildstory_reports WHERE id = ? AND publication_status IN ('published', 'draft_changes') LIMIT 1",
  ).bind(reportId).first<{ id: string; owner_user_id: string | null; project_id: string }>();
  return row ? { reportId: row.id, ownerUserId: row.owner_user_id, projectId: row.project_id } : null;
}

/** Every published (or draft_changes) report id for a project, most recent chapter first - for the comment/reaction rollup. */
export async function listPublishedReportIdsForProject(projectId: string): Promise<string[]> {
  const rows = await (await database())
    .prepare(
      `SELECT id FROM buildstory_reports WHERE project_id = ? AND publication_status IN ('published', 'draft_changes')
       ORDER BY chapter_index DESC`,
    )
    .bind(projectId)
    .all<{ id: string }>();
  return rows.results.map((row) => row.id);
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
/**
 * `includeDraftChanges` must match the caller's own outer status filter, not just widen
 * blindly: a caller that still filters its outer WHERE to publication_status = 'published'
 * (listPublishedStories, listStoriesByOwner, searchPublishedStories - they re-derive live
 * from snapshot_json, so a widened outer filter would leak a draft's unsaved edits) must
 * keep computing "latest" against published-only rows too, or a project whose newest chapter
 * is mid-edit would suppress its still-fully-published previous chapter from every listing.
 * Callers that read the frozen buildstory_public_story_index (explorePublishedStories) can
 * safely widen both, since draft_changes rows there are always served their last-frozen JSON.
 */
function latestChapterOnly(outerAlias = "buildstory_reports", includeDraftChanges = false): string {
  const statuses = includeDraftChanges ? "'published', 'draft_changes'" : "'published'";
  return `${outerAlias}.chapter_index = (
    SELECT MAX(r2.chapter_index) FROM buildstory_reports r2
    WHERE r2.project_id = ${outerAlias}.project_id AND r2.publication_status IN (${statuses})
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
     WHERE r.publication_status IN ('published', 'draft_changes') AND ${latestChapterOnly("r", true)}`,
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
