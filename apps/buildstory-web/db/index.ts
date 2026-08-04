import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export class DatabaseUnavailableError extends Error {
  constructor() {
    super(
      "The required Cloudflare D1 binding `DB` is unavailable. Configure the Sites D1 binding and apply migrations before serving production traffic.",
    );
  }
}

export async function getD1(): Promise<D1Database> {
  const { env } = await import("cloudflare:workers");
  if (!env.DB) throw new DatabaseUnavailableError();
  return env.DB;
}

export async function getDb() {
  return drizzle(await getD1(), { schema });
}

export async function assertDatabaseReady() {
  const database = await getD1();
  const row = await database
    .prepare(
      "SELECT COUNT(*) AS table_count FROM sqlite_schema WHERE type = 'table' AND name IN ('buildstory_upload_sessions', 'buildstory_reports', 'buildstory_report_jobs')",
    )
    .first<{ table_count: number }>();
  if (Number(row?.table_count ?? 0) !== 3) {
    throw new DatabaseUnavailableError();
  }
}
