import { assertDatabaseReady } from "@/db";
import { productionRuntimeIssues } from "@/lib/config/runtime";
import { configuredCloudNarrativeProvider, openRouterZdrModelReady } from "@/lib/narrative/provider";

export const dynamic = "force-dynamic";

export async function GET() {
  const issues = productionRuntimeIssues();
  const configurationReady = issues.length === 0;
  let databaseReady = process.env.NODE_ENV !== "production";
  let openRouterReady = process.env.NODE_ENV !== "production" || configuredCloudNarrativeProvider() !== "openrouter";
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
  if (configurationReady && process.env.NODE_ENV === "production" && configuredCloudNarrativeProvider() === "openrouter") {
    openRouterReady = await openRouterZdrModelReady();
    if (!openRouterReady) issues.push({ code: "openrouter_zdr_model_unavailable", variable: "BUILDSTORY_OPENROUTER_API_KEY" });
  }
  const ready = issues.length === 0 && databaseReady && openRouterReady;
  return Response.json(
    {
      status: ready ? "ready" : "not_ready",
      checks: {
        configuration: configurationReady,
        database: databaseReady,
        openRouterZdrModel: openRouterReady,
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
