import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Rewrites the Vite/vinext-generated `dist/server/wrangler.json` into a real
 * deploy config driven by `wrangler.deploy.jsonc`.
 *
 * The generated file is built from vite.config.ts's *local dev* binding block,
 * so it ships local-dev placeholders (`buildstory-local-d1`, `buildstory-local-r2`, the
 * all-zero database id) and an empty `vars`. Every one of those is wrong for a
 * real deploy, and none of them fail `wrangler deploy --dry-run` - the dry run
 * never contacts the account. So each is overwritten here and then re-checked
 * against the assertions at the bottom.
 */

const DEV_PLACEHOLDERS = ["00000000-0000-4000-8000-000000000000", "buildstory-local-d1", "buildstory-local-r2"];

/** Names worker/index.ts and lib/config/runtime.ts require at runtime; secrets are set separately. */
const REQUIRED_VARS = [
  "BUILDSTORY_STORE",
  "BUILDSTORY_DEV_AUTH_BYPASS",
  "BUILDSTORY_LOCAL_API_ENABLED",
  "BUILDSTORY_PUBLIC_ORIGIN",
  "BUILDSTORY_ALLOWED_HOSTS",
];

/** Secrets belong in the Worker secret store; wrangler.deploy.jsonc is committed. */
const FORBIDDEN_VARS = ["AUTH_SECRET", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET", "AUTH_GITHUB_ID", "AUTH_GITHUB_SECRET", "BUILDSTORY_LLM_API_KEY", "BUILDSTORY_CRON_SECRET"];

/**
 * Strips JSONC comments and trailing commas. Deliberately a character scanner
 * rather than a regex: a regex block-comment strip is not string-aware, so the
 * `/*` inside a route pattern like "buildstory.dev/*" pairs with the `*​/` inside
 * a cron like "*​/5 * * * *" and silently swallows everything between them.
 */
function parseJsonc(value: string) {
  let out = "";
  let inString = false;
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i]!;
    const next = value[i + 1];
    if (inString) {
      out += char;
      if (char === "\\") {
        out += value[i + 1] ?? "";
        i += 1;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      out += char;
      continue;
    }
    if (char === "/" && next === "*") {
      const end = value.indexOf("*/", i + 2);
      i = end < 0 ? value.length : end + 1;
      continue;
    }
    if (char === "/" && next === "/") {
      const end = value.indexOf("\n", i + 2);
      i = end < 0 ? value.length : end - 1;
      continue;
    }
    out += char;
  }
  return JSON.parse(out.replace(/,\s*([}\]])/g, "$1")) as Record<string, unknown>;
}

function required<T>(value: T | undefined, message: string): T {
  if (value === undefined || value === null) throw new Error(message);
  return value;
}

const appRoot = process.cwd();
const source = parseJsonc(await readFile(path.join(appRoot, "wrangler.deploy.jsonc"), "utf8"));
const generatedPath = path.join(appRoot, "dist/server/wrangler.json");
const generated = JSON.parse(await readFile(generatedPath, "utf8")) as Record<string, unknown>;

const databaseId = (source.d1_databases as Array<Record<string, string>> | undefined)?.[0]?.database_id ?? "";
if (!databaseId || DEV_PLACEHOLDERS.includes(databaseId)) throw new Error("A real D1 database_id is required before deploy.");

generated.account_id = required(source.account_id, "wrangler.deploy.jsonc is missing account_id.");
generated.compatibility_date = required(source.compatibility_date, "wrangler.deploy.jsonc is missing compatibility_date.");
generated.compatibility_flags = source.compatibility_flags ?? generated.compatibility_flags;

// Share-card rendering reads generated artwork directly through this binding.
// Without it, a Worker-side fetch to the public origin re-enters the same
// Worker and stalls until the subrequest times out.
generated.assets = { ...(generated.assets as Record<string, unknown> | undefined), binding: "ASSETS" };

generated.d1_databases = (source.d1_databases as Array<Record<string, unknown>>).map((database) => {
  const copy = { ...database };
  // wrangler rejects migrations_dir alongside an explicit deploy config; scripts/migrate-d1.ts owns migrations.
  delete copy.migrations_dir;
  return copy;
});

// db/r2.ts resolves env.MEDIA. Without this the generated file keeps the
// local-dev `buildstory-local-r2` placeholder and deploy binds a bucket that does
// not exist - or, worse, silently creates the wrong one.
generated.r2_buckets = required(source.r2_buckets, "wrangler.deploy.jsonc must declare the MEDIA r2_buckets binding before deploy.");
generated.queues = required(source.queues, "wrangler.deploy.jsonc must declare the narrative Queue producer and consumer.");

const vars = required(source.vars, "wrangler.deploy.jsonc must declare a vars block; the Worker returns 503 without BUILDSTORY_ALLOWED_HOSTS.") as Record<string, string>;
for (const name of REQUIRED_VARS) {
  if (!vars[name]) throw new Error(`vars.${name} is required for a production deploy.`);
}
for (const name of FORBIDDEN_VARS) {
  if (name in vars) throw new Error(`${name} is a secret and must not be committed in vars; use \`wrangler secret put ${name} -c wrangler.deploy.jsonc\`.`);
}
generated.vars = vars;

generated.routes = required(source.routes, "wrangler.deploy.jsonc must declare routes before deploy.");
// Both default to true once a workers.dev route exists, so carry them explicitly
// rather than letting a wrangler default decide how many origins serve the app.
generated.workers_dev = source.workers_dev ?? false;
generated.preview_urls = source.preview_urls ?? false;
generated.triggers = required(source.triggers, "wrangler.deploy.jsonc must declare cron triggers; worker/index.ts's scheduled handler drives leaderboards and lease recovery.");

// The host the CLI pins, the host allowlist, and the route must agree, or the
// deployment answers 421 on its own domain.
const originHost = new URL(vars.BUILDSTORY_PUBLIC_ORIGIN).hostname;
const allowed = vars.BUILDSTORY_ALLOWED_HOSTS.split(",").map((host) => host.trim().toLocaleLowerCase("en-US"));
if (!allowed.includes(originHost)) throw new Error(`BUILDSTORY_PUBLIC_ORIGIN host ${originHost} is not in BUILDSTORY_ALLOWED_HOSTS.`);
const routePatterns = (generated.routes as Array<{ pattern: string }>).map((route) => route.pattern);
if (!routePatterns.some((pattern) => pattern.startsWith(`${originHost}/`))) {
  throw new Error(`No route matches BUILDSTORY_PUBLIC_ORIGIN host ${originHost}; got ${routePatterns.join(", ")}.`);
}

const serialized = JSON.stringify(generated, null, 2);
for (const placeholder of DEV_PLACEHOLDERS) {
  if (serialized.includes(placeholder)) throw new Error(`Generated deploy config still contains the local-dev placeholder "${placeholder}".`);
}

await writeFile(generatedPath, `${serialized}\n`, "utf8");
console.log(`Prepared ${generatedPath} for ${originHost} with D1 ${databaseId} and R2 ${(source.r2_buckets as Array<{ bucket_name: string }>)[0]?.bucket_name}.`);
