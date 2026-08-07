import { execFileSync } from "node:child_process";
import { readFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

type Journal = { entries: Array<{ tag: string }> };

const argv = process.argv.slice(2);
const has = (flag: string) => argv.includes(flag);
const valueAfter = (flag: string, fallback: string) => {
  const index = argv.indexOf(flag);
  return index >= 0 && argv[index + 1] ? argv[index + 1]! : fallback;
};

const dryRun = has("--dry-run");
const localValidation = has("--local");
const localSqlite = has("--local-sqlite");
const config = valueAfter("--config", "wrangler.deploy.jsonc");
const baseline = valueAfter("--baseline", "");
const databasePath = valueAfter("--db-path", path.join(".tmp", "buildstory-contract.sqlite"));
const root = process.cwd();
const journal = JSON.parse(await readFile(path.join(root, "drizzle/meta/_journal.json"), "utf8")) as Journal;
const migrations = journal.entries.map((entry) => entry.tag);

for (const tag of migrations) {
  const file = path.join(root, "drizzle", `${tag}.sql`);
  await readFile(file, "utf8");
}

if (dryRun || localValidation) {
  console.log(`${dryRun ? "Would apply" : "Validated"} ${migrations.length} forward-only migrations${localValidation ? " locally" : ""}.`);
  process.exit(0);
}

const migrationTable = `CREATE TABLE IF NOT EXISTS buildstory_migrations (
  tag TEXT PRIMARY KEY NOT NULL,
  applied_at TEXT NOT NULL
)`;

if (localSqlite) {
  await mkdir(path.dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec(migrationTable);
  for (const tag of migrations) {
    const applied = db.prepare("SELECT 1 FROM buildstory_migrations WHERE tag = ?").get(tag);
    if (applied) continue;
    const sql = await readFile(path.join(root, "drizzle", `${tag}.sql`), "utf8");
    db.exec(sql.replaceAll("--> statement-breakpoint", ""));
    db.prepare("INSERT INTO buildstory_migrations (tag, applied_at) VALUES (?, ?)").run(tag, new Date().toISOString());
    console.log(`Applied local sqlite migration ${tag}.`);
  }
  db.close();
  process.exit(0);
}

// Run wrangler's JS entry under the current Node binary rather than going
// through `npx`. On Windows the npm shim is `npx.cmd`: a bare "npx" fails
// ENOENT (execFileSync ignores PATHEXT), and naming "npx.cmd" explicitly fails
// EINVAL because Node refuses to spawn .cmd/.bat without a shell since the
// CVE-2024-27980 fix. Using a shell is not an option here - these commands
// carry multi-line SQL that cmd.exe would mangle. CI is Linux, so neither
// failure ever surfaced there.
// Derived from the package root, not resolved directly: wrangler's `exports`
// map does not expose ./bin/wrangler.js, so resolving that path throws
// ERR_PACKAGE_PATH_NOT_EXPORTED. package.json is exported, and resolving it
// also finds the hoisted copy at the workspace root.
const WRANGLER_BIN = path.join(
  path.dirname(createRequire(import.meta.url).resolve("wrangler/package.json")),
  "bin",
  "wrangler.js",
);

const wrangler = (args: string[]) => execFileSync(process.execPath, [WRANGLER_BIN, "d1", "execute", "buildstory-d1", "--remote", `--config=${config}`, ...args], { encoding: "utf8" });

/**
 * Applied tags, parsed rather than substring-matched.
 *
 * The previous check tested `rows.includes('"tag":"<tag>"')` against wrangler's
 * `--json` output, which is PRETTY-PRINTED - it emits `"tag": "<tag>"`, with a
 * space after the colon. The compact-form needle never matched, so every
 * migration looked unapplied and the run tried to re-apply 0000 onto a live
 * schema, dying on "table `buildstory_report_jobs` already exists".
 *
 * wrangler also prints a banner before the JSON, so isolate the array first.
 */
function appliedTags(): Set<string> {
  const raw = wrangler(["--command=SELECT tag FROM buildstory_migrations", "--json"]);
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start < 0 || end <= start) throw new Error("Could not locate JSON in wrangler d1 execute output.");
  const payload = JSON.parse(raw.slice(start, end + 1)) as Array<{ results?: Array<{ tag?: string }> }>;
  return new Set(payload.flatMap((entry) => entry.results ?? []).map((row) => row.tag).filter((tag): tag is string => Boolean(tag)));
}

wrangler([`--command=${migrationTable}`]);
if (baseline) {
  const baselineIndex = migrations.indexOf(baseline);
  if (baselineIndex < 0) throw new Error(`Unknown migration baseline ${baseline}.`);
  if (appliedTags().size === 0) {
    for (const tag of migrations.slice(0, baselineIndex + 1)) {
      wrangler([`--command=INSERT INTO buildstory_migrations (tag, applied_at) VALUES ('${tag.replaceAll("'", "''")}', '${new Date().toISOString()}')`]);
    }
    console.log(`Recorded existing remote schema through ${baseline}.`);
  }
}
// Read the ledger once and track locally, instead of re-querying per migration.
const applied = appliedTags();
for (const tag of migrations) {
  if (applied.has(tag)) continue;
  const file = path.join(root, "drizzle", `${tag}.sql`);
  wrangler([`--file=${file}`]);
  wrangler([`--command=INSERT INTO buildstory_migrations (tag, applied_at) VALUES ('${tag.replaceAll("'", "''")}', '${new Date().toISOString()}')`]);
  applied.add(tag);
  console.log(`Applied remote migration ${tag}.`);
}
console.log(`Ledger now records ${applied.size} of ${migrations.length} migrations.`);
