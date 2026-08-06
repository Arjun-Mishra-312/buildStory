import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

function parseJsonc(value: string) {
  const withoutComments = value.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
  return JSON.parse(withoutComments.replace(/,\s*([}\]])/g, "$1")) as Record<string, unknown>;
}

const appRoot = process.cwd();
const source = parseJsonc(await readFile(path.join(appRoot, "wrangler.jsonc.future"), "utf8"));
const generatedPath = path.join(appRoot, "dist/server/wrangler.json");
const generated = JSON.parse(await readFile(generatedPath, "utf8")) as Record<string, unknown>;
const databaseId = ((source.d1_databases as Array<Record<string, string>> | undefined)?.[0]?.database_id) ?? "";
if (!databaseId || databaseId === "00000000-0000-4000-8000-000000000000") throw new Error("A real D1 database_id is required before deploy.");
generated.account_id = source.account_id;
generated.d1_databases = (source.d1_databases as Array<Record<string, unknown>>).map((database) => {
  const copy = { ...database };
  delete copy.migrations_dir;
  return copy;
});
generated.routes = [{ pattern: "buildstory.dev/*", zone_name: "buildstory.dev" }];
generated.triggers = { crons: ["0 * * * *", "*/5 * * * *"] };
if (JSON.stringify(generated).includes("00000000-0000-4000-8000-000000000000")) throw new Error("Generated deploy config still contains the placeholder D1 id.");
await writeFile(generatedPath, `${JSON.stringify(generated, null, 2)}\n`, "utf8");
console.log(`Prepared ${generatedPath} for buildstory.dev with D1 ${databaseId}.`);
