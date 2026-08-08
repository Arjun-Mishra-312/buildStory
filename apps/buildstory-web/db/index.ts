import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

let testDatabase: D1Database | null = null;

export class DatabaseUnavailableError extends Error {
  constructor() {
    super(
      "The required Cloudflare D1 binding `DB` is unavailable. Configure the Cloudflare D1 binding and apply migrations before serving production traffic.",
    );
  }
}

export async function getD1(): Promise<D1Database> {
  if (testDatabase) return testDatabase;
  const { env } = await import("cloudflare:workers");
  if (!env.DB) throw new DatabaseUnavailableError();
  return env.DB;
}

/** Test-only seam: production callers must continue to resolve the Worker DB binding. */
export function __setD1ForTests(database: D1Database | null) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("__setD1ForTests is only available when NODE_ENV=test.");
  }
  testDatabase = database;
}

export async function getDb() {
  return drizzle(await getD1(), { schema });
}

const REQUIRED_TABLES = [
  "buildstory_upload_sessions",
  "buildstory_reports",
  "buildstory_report_jobs",
  "buildstory_users",
  "buildstory_projects",
  "buildstory_narratives",
  "buildstory_narrative_jobs",
  "buildstory_llm_budgets",
  "buildstory_follows",
  "buildstory_reactions",
  "buildstory_comments",
  "buildstory_notifications",
  "buildstory_rate_limits",
  "buildstory_content_reports",
  "buildstory_content_report_audit",
  "buildstory_leaderboard_entries",
  "buildstory_leaderboard_runs",
] as const;

export async function assertDatabaseReady() {
  const database = await getD1();
  const row = await database
    .prepare(
      `SELECT COUNT(*) AS table_count FROM sqlite_schema WHERE type = 'table' AND name IN (${REQUIRED_TABLES.map(() => "?").join(",")})`,
    )
    .bind(...REQUIRED_TABLES)
    .first<{ table_count: number }>();
  if (Number(row?.table_count ?? 0) !== REQUIRED_TABLES.length) {
    throw new DatabaseUnavailableError();
  }
}
