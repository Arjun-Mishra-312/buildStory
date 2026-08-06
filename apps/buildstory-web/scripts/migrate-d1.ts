import { execFileSync } from "node:child_process";
import { readFile, mkdir } from "node:fs/promises";
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
const config = valueAfter("--config", "wrangler.jsonc.future");
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

const wrangler = (args: string[]) => execFileSync("npx", ["wrangler", "d1", "execute", "buildstory-d1", "--remote", `--config=${config}`, ...args], { encoding: "utf8" });
wrangler([`--command=${migrationTable}`]);
if (baseline) {
  const baselineIndex = migrations.indexOf(baseline);
  if (baselineIndex < 0) throw new Error(`Unknown migration baseline ${baseline}.`);
  const existing = wrangler(["--command=SELECT tag FROM buildstory_migrations", "--json"]);
  if (!existing.includes('"tag"')) {
    for (const tag of migrations.slice(0, baselineIndex + 1)) {
      wrangler([`--command=INSERT INTO buildstory_migrations (tag, applied_at) VALUES ('${tag.replaceAll("'", "''")}', '${new Date().toISOString()}')`]);
    }
    console.log(`Recorded existing remote schema through ${baseline}.`);
  }
}
for (const tag of migrations) {
  const rows = wrangler(["--command=SELECT tag FROM buildstory_migrations", "--json"]);
  if (rows.includes(`\"tag\":\"${tag}\"`)) continue;
  const file = path.join(root, "drizzle", `${tag}.sql`);
  wrangler([`--file=${file}`]);
  wrangler([`--command=INSERT INTO buildstory_migrations (tag, applied_at) VALUES ('${tag.replaceAll("'", "''")}', '${new Date().toISOString()}')`]);
  console.log(`Applied remote migration ${tag}.`);
}
