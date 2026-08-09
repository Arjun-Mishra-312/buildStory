import { getD1 } from "@/db";
import { getR2, MediaStorageUnavailableError } from "@/db/r2";
import { mediaPublicUrl } from "@/lib/media/url";
import { AccountError, type AccountExport } from "./contracts";
import { listGuidance } from "@/lib/ingestion/d1-store";

/** Malformed stored JSON should degrade the export, not fail the whole request - an export is a best-effort dump of what exists, not a validated re-import format. */
function parseJsonSafely(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function database() {
  try {
    return await getD1();
  } catch {
    throw new AccountError("production_dependency_unavailable", "Buildstory's durable database is unavailable.", 503);
  }
}

/** Everything Buildstory holds that is tied to this account, for the user's own records - not a public projection. */
export async function exportAccountData(userId: string): Promise<AccountExport> {
  const db = await database();
  const user = await db
    .prepare("SELECT id, handle, display_name, email, bio, builder_role, onboarding_completed_at, created_at FROM buildstory_users WHERE id = ?")
    .bind(userId)
    .first<{ id: string; handle: string; display_name: string; email: string; bio: string | null; builder_role: string | null; onboarding_completed_at: string | null; created_at: string }>();
  if (!user) throw new AccountError("not_found", "Account not found.", 404);

  const [projects, reports, comments, reactions, commentUpvotes, following, followers, media, guidance, scans, narratives, uploadSessions] = await Promise.all([
    db
      .prepare("SELECT id, slug, name, latest_commit_count, latest_active_days FROM buildstory_projects WHERE owner_user_id = ? LIMIT 500")
      .bind(userId)
      .all<{ id: string; slug: string; name: string; latest_commit_count: number; latest_active_days: number }>(),
    db
      .prepare(
        "SELECT id, status, publication_status, publication_slug, editorial_tagline, created_at, published_at FROM buildstory_reports WHERE owner_user_id = ? LIMIT 500",
      )
      .bind(userId)
      .all<{
        id: string;
        status: string;
        publication_status: string;
        publication_slug: string;
        editorial_tagline: string;
        created_at: string;
        published_at: string | null;
      }>(),
    db
      .prepare(
        "SELECT id, report_id, parent_comment_id, body, created_at FROM buildstory_comments WHERE author_user_id = ? AND status = 'visible' LIMIT 500",
      )
      .bind(userId)
      .all<{ id: string; report_id: string; parent_comment_id: string | null; body: string; created_at: string }>(),
    db
      .prepare("SELECT report_id, kind, created_at FROM buildstory_reactions WHERE user_id = ? LIMIT 500")
      .bind(userId)
      .all<{ report_id: string; kind: string; created_at: string }>(),
    db
      .prepare("SELECT u.comment_id, c.report_id, u.created_at FROM buildstory_comment_upvotes u JOIN buildstory_comments c ON c.id = u.comment_id WHERE u.user_id = ? LIMIT 500")
      .bind(userId)
      .all<{ comment_id: string; report_id: string; created_at: string }>(),
    db
      .prepare(
        "SELECT u.handle FROM buildstory_follows f JOIN buildstory_users u ON u.id = f.followee_user_id WHERE f.follower_user_id = ? LIMIT 500",
      )
      .bind(userId)
      .all<{ handle: string }>(),
    db
      .prepare(
        "SELECT u.handle FROM buildstory_follows f JOIN buildstory_users u ON u.id = f.follower_user_id WHERE f.followee_user_id = ? LIMIT 500",
      )
      .bind(userId)
      .all<{ handle: string }>(),
    db
      .prepare("SELECT id, report_id, r2_key, kind, created_at FROM buildstory_report_media WHERE owner_user_id = ? LIMIT 500")
      .bind(userId)
      .all<{ id: string; report_id: string; r2_key: string; kind: string; created_at: string }>(),
    listGuidance(userId),
    // The scanner data itself: previously entirely absent from this export.
    // Bounded the same as everything else here (LIMIT 500), matching the
    // fair-use ceiling on stored reports per account, so this query can
    // never return more rows than that ceiling permits to exist.
    db
      .prepare("SELECT id AS report_id, created_at, source_snapshot_json FROM buildstory_reports WHERE owner_user_id = ? LIMIT 500")
      .bind(userId)
      .all<{ report_id: string; created_at: string; source_snapshot_json: string }>(),
    db
      .prepare("SELECT report_id, mode, provider, model, status, sections_json, fallbacks_used_json, created_at FROM buildstory_narratives WHERE owner_user_id = ? LIMIT 500")
      .bind(userId)
      .all<{ report_id: string; mode: string; provider: string; model: string; status: string; sections_json: string | null; fallbacks_used_json: string | null; created_at: string }>(),
    db
      .prepare("SELECT id, project_label, narrative_mode, status, report_id, created_at FROM buildstory_upload_sessions WHERE owner_user_id = ? LIMIT 500")
      .bind(userId)
      .all<{ id: string; project_label: string; narrative_mode: string; status: string; report_id: string | null; created_at: string }>(),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    profile: {
      id: user.id,
      handle: user.handle,
      displayName: user.display_name,
      email: user.email,
      bio: user.bio,
      builderRole: user.builder_role,
      onboardingCompletedAt: user.onboarding_completed_at,
      createdAt: user.created_at,
    },
    guidance,
    projects: projects.results.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      latestCommitCount: row.latest_commit_count,
      latestActiveDays: row.latest_active_days,
    })),
    reports: reports.results.map((row) => ({
      id: row.id,
      status: row.status,
      publicationStatus: row.publication_status,
      publicationSlug: row.publication_slug,
      editorialTagline: row.editorial_tagline,
      createdAt: row.created_at,
      publishedAt: row.published_at,
    })),
    commentsAuthored: comments.results.map((row) => ({
      id: row.id,
      reportId: row.report_id,
      parentCommentId: row.parent_comment_id,
      body: row.body,
      createdAt: row.created_at,
    })),
    reactionsGiven: reactions.results.map((row) => ({ reportId: row.report_id, kind: row.kind, createdAt: row.created_at })),
    commentUpvotesGiven: commentUpvotes.results.map((row) => ({ commentId: row.comment_id, reportId: row.report_id, createdAt: row.created_at })),
    following: following.results.map((row) => row.handle),
    followers: followers.results.map((row) => row.handle),
    media: media.results.map((row) => ({
      id: row.id,
      reportId: row.report_id,
      url: mediaPublicUrl(row.r2_key),
      kind: row.kind,
      createdAt: row.created_at,
    })),
    scans: scans.results.map((row) => ({
      reportId: row.report_id,
      createdAt: row.created_at,
      sourceSnapshot: parseJsonSafely(row.source_snapshot_json),
    })),
    narratives: narratives.results.map((row) => ({
      reportId: row.report_id,
      mode: row.mode,
      provider: row.provider,
      model: row.model,
      status: row.status,
      sections: row.sections_json ? parseJsonSafely(row.sections_json) : null,
      fallbacksUsed: row.fallbacks_used_json ? (parseJsonSafely(row.fallbacks_used_json) as string[] ?? []) : [],
      createdAt: row.created_at,
    })),
    uploadSessions: uploadSessions.results.map((row) => ({
      id: row.id,
      projectLabel: row.project_label,
      narrativeMode: row.narrative_mode,
      status: row.status,
      reportId: row.report_id,
      createdAt: row.created_at,
    })),
  };
}

/**
 * Permanent, irreversible erasure. Reports/projects/upload sessions the
 * account owns are explicitly deleted first (their FK to users is
 * onDelete:"set null", not cascade, precisely so an ordinary user-record
 * change never silently wipes a report - deletion is the one path that
 * deliberately overrides that and removes them outright). Deleting the
 * user row last cascades everything else (follows, reactions, comments,
 * notifications, llm_budgets, filed content reports) per the FKs already
 * declared in db/schema.ts, verified against a real D1 database to
 * actually cascade (D1 runs with PRAGMA foreign_keys=1).
 *
 * A comment this account authored on someone else's report that has
 * replies from other people is left as a dangling parent (comments.
 * parent_comment_id has no DB-level FK by design, see db/schema.ts) - an
 * accepted, documented edge case rather than deleting other users' replies
 * as collateral.
 */
export async function deleteAccount(userId: string): Promise<void> {
  const db = await database();
  const user = await db.prepare("SELECT id FROM buildstory_users WHERE id = ?").bind(userId).first();
  if (!user) throw new AccountError("not_found", "Account not found.", 404);

  // R2 objects have no FK to the D1 row that references them, so cascading the
  // buildstory_reports delete below only removes the *metadata* row - the underlying
  // blob would otherwise survive account deletion, which is the one outcome this
  // product's entire privacy pitch cannot afford. Delete the objects first.
  const mediaRows = await db
    .prepare("SELECT r2_key FROM buildstory_report_media WHERE owner_user_id = ?")
    .bind(userId)
    .all<{ r2_key: string }>();
  if (mediaRows.results.length > 0) {
    try {
      const bucket = await getR2();
      await bucket.delete(mediaRows.results.map((row) => row.r2_key));
    } catch (error) {
      if (!(error instanceof MediaStorageUnavailableError)) throw error;
      // R2 not configured (e.g. local dev without the binding) - nothing to clean up.
    }
  }

  await db.batch([
    db.prepare("DELETE FROM buildstory_reports WHERE owner_user_id = ?").bind(userId),
    db.prepare("DELETE FROM buildstory_upload_sessions WHERE owner_user_id = ?").bind(userId),
    db.prepare("DELETE FROM buildstory_users WHERE id = ?").bind(userId),
  ]);
}
