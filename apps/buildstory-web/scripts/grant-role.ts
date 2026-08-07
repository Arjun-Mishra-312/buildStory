import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const args = process.argv.slice(2);
const userId = args[args.indexOf("--user-id") + 1];
const role = args[args.indexOf("--role") + 1];
if (!userId || !["member", "moderator", "admin"].includes(role)) {
  throw new Error("Usage: tsx scripts/grant-role.ts --user-id <id> --role member|moderator|admin");
}
const sql = `UPDATE buildstory_users SET role = '${role}', updated_at = datetime('now') WHERE id = '${userId.replaceAll("'", "''")}'`;
// Invoke wrangler's JS entry under the current Node binary. Going through `npx`
// is broken on Windows: bare "npx" is ENOENT, and "npx.cmd" is EINVAL because
// Node will not spawn .cmd without a shell. See scripts/migrate-d1.ts.
// wrangler's exports map hides ./bin/wrangler.js, so derive it from the package root.
const WRANGLER_BIN = path.join(
  path.dirname(createRequire(import.meta.url).resolve("wrangler/package.json")),
  "bin",
  "wrangler.js",
);
execFileSync(process.execPath, [WRANGLER_BIN, "d1", "execute", "buildstory-d1", "--remote", "--config", "wrangler.deploy.jsonc", "--command", sql], { stdio: "inherit" });
