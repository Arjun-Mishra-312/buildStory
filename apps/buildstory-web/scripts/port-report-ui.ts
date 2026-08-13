export {};

const publicOrigin = process.env.BUILDSTORY_PUBLIC_ORIGIN ?? "https://buildstory.dev";
const secret = process.env.BUILDSTORY_CRON_SECRET;
if (!secret) {
  throw new Error("BUILDSTORY_CRON_SECRET is required. Set it in the environment, not on the command line.");
}

const dryRun = process.argv.includes("--dry-run");
const endpoint = new URL("/api/internal/reports/port-ui", publicOrigin);

let cursor = "";
let pages = 0;
let hydrated = 0;
let fieldsUpdated = 0;
let republished = 0;
let processed = 0;

do {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ cursor, limit: 5, dryRun }),
  });
  const payload = await response.json() as {
    error?: { code?: string; message?: string };
    processed?: number;
    hydrated?: number;
    fieldsUpdated?: number;
    republished?: number;
    nextCursor?: string | null;
    done?: boolean;
  };
  if (!response.ok) {
    throw new Error(payload.error?.message ?? `port-ui failed with HTTP ${response.status}`);
  }
  pages += 1;
  processed += payload.processed ?? 0;
  hydrated += payload.hydrated ?? 0;
  fieldsUpdated += payload.fieldsUpdated ?? 0;
  republished += payload.republished ?? 0;
  cursor = payload.nextCursor ?? "";
  console.log(`${dryRun ? "Dry-run page" : "Page"} ${pages}: processed=${payload.processed} hydrated=${payload.hydrated} fields=${payload.fieldsUpdated} republished=${payload.republished} done=${payload.done}`);
  if (payload.done) break;
  if (!cursor) break;
} while (pages < 1_000);

console.log(`${dryRun ? "Would port" : "Ported"} ${processed} ready reports (${hydrated} snapshots, ${fieldsUpdated} field lists, ${republished} public indexes).`);
