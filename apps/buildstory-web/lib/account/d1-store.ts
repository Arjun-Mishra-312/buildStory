import { getD1 } from "@/db";
import { AccountError, type AccountExport } from "./contracts";

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
    .prepare("SELECT id, handle, display_name, email, bio, created_at FROM buildstory_users WHERE id = ?")
    .bind(userId)
    .first<{ id: string; handle: string; display_name: string; email: string; bio: string | null; created_at: string }>();
  if (!user) throw new AccountError("not_found", "Account not found.", 404);

  const [projects, reports, comments, reactions, following, followers] = await Promise.all([
    db
      .prepare("SELECT id, slug, name, latest_commit_count, latest_active_days FROM buildstory_projects WHERE owner_user_id = ?")
      .bind(userId)
      .all<{ id: string; slug: string; name: string; latest_commit_count: number; latest_active_days: number }>(),
    db
      .prepare(
        "SELECT id, status, publication_status, publication_slug, editorial_tagline, created_at, published_at FROM buildstory_reports WHERE owner_user_id = ?",
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
        "SELECT id, report_id, parent_comment_id, body, created_at FROM buildstory_comments WHERE author_user_id = ? AND status = 'visible'",
      )
      .bind(userId)
      .all<{ id: string; report_id: string; parent_comment_id: string | null; body: string; created_at: string }>(),
    db
      .prepare("SELECT report_id, kind, created_at FROM buildstory_reactions WHERE user_id = ?")
      .bind(userId)
      .all<{ report_id: string; kind: string; created_at: string }>(),
    db
      .prepare(
        "SELECT u.handle FROM buildstory_follows f JOIN buildstory_users u ON u.id = f.followee_user_id WHERE f.follower_user_id = ?",
      )
      .bind(userId)
      .all<{ handle: string }>(),
    db
      .prepare(
        "SELECT u.handle FROM buildstory_follows f JOIN buildstory_users u ON u.id = f.follower_user_id WHERE f.followee_user_id = ?",
      )
      .bind(userId)
      .all<{ handle: string }>(),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    profile: {
      id: user.id,
      handle: user.handle,
      displayName: user.display_name,
      email: user.email,
      bio: user.bio,
      createdAt: user.created_at,
    },
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
    following: following.results.map((row) => row.handle),
    followers: followers.results.map((row) => row.handle),
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

  await db.batch([
    db.prepare("DELETE FROM buildstory_reports WHERE owner_user_id = ?").bind(userId),
    db.prepare("DELETE FROM buildstory_upload_sessions WHERE owner_user_id = ?").bind(userId),
    db.prepare("DELETE FROM buildstory_users WHERE id = ?").bind(userId),
  ]);
}
