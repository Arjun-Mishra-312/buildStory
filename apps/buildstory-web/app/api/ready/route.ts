import { assertDatabaseReady } from "@/db";
import { productionRuntimeIssues } from "@/lib/config/runtime";

export const dynamic = "force-dynamic";

export async function GET() {
  const issues = productionRuntimeIssues();
  const configurationReady = issues.length === 0;
  let databaseReady = process.env.NODE_ENV !== "production";
  if (configurationReady && process.env.NODE_ENV === "production") {
    try {
      await assertDatabaseReady();
      databaseReady = true;
    } catch {
      issues.push({
        code: "database_or_migration_unavailable",
        variable: "DB",
      });
    }
  }
  const ready = issues.length === 0 && databaseReady;
  return Response.json(
    {
      status: ready ? "ready" : "not_ready",
      checks: {
        configuration: configurationReady,
        database: databaseReady,
      },
      issues,
    },
    {
      status: ready ? 200 : 503,
      headers: {
        "cache-control": "no-store, max-age=0",
        "x-content-type-options": "nosniff",
      },
    },
  );
}
