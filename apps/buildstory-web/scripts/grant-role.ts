import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const userId = args[args.indexOf("--user-id") + 1];
const role = args[args.indexOf("--role") + 1];
if (!userId || !["member", "moderator", "admin"].includes(role)) {
  throw new Error("Usage: tsx scripts/grant-role.ts --user-id <id> --role member|moderator|admin");
}
const sql = `UPDATE buildstory_users SET role = '${role}', updated_at = datetime('now') WHERE id = '${userId.replaceAll("'", "''")}'`;
execFileSync("npx", ["wrangler", "d1", "execute", "buildstory-d1", "--remote", "--config", "wrangler.jsonc.future", "--command", sql], { stdio: "inherit" });
