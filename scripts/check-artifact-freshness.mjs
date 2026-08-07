import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifacts = path.join(root, "artifacts");
const packageRoot = path.join(root, "packages/buildstory-scanner");

// Derive the exact expected filename from the manifest rather than globbing for
// the "newest" archive. Two reasons the old `/^buildstory-scanner-/` + sort()
// approach was wrong once the package was renamed to buildstory-scan:
//   - the new archive (buildstory-scan-0.7.0.tgz) does not match that prefix at
//     all, so the check silently validated a stale buildstory-scanner-*.tgz;
//   - even with a widened prefix, string sort puts "buildstory-scan-0.7.0"
//     BEFORE "buildstory-scanner-0.6.5" ('-' < 'n'), so .at(-1) picks the older
//     package entirely.
// Pinning to name@version also catches a version bump with no repack, which the
// newest-wins rule could never detect.
const manifest = JSON.parse(readFileSync(path.join(packageRoot, "package.json"), "utf8"));
const archive = `${manifest.name}-${manifest.version}.tgz`;
if (!existsSync(path.join(artifacts, archive))) {
  throw new Error(`Expected artifacts/${archive} for ${manifest.name}@${manifest.version}; run \`npm run package:scanner\`.`);
}
// Run tar from `artifacts` and hand it a bare filename. An absolute Windows
// path (`D:\...`) is parsed by GNU tar as a remote `host:path` spec and fails
// with "Cannot connect to D: resolve failed" - CI never caught it because it
// runs on Linux, where the same path has no colon.
const packaged = JSON.parse(execFileSync("tar", ["-xOf", archive, "package/schema/project-snapshot.schema.json"], { encoding: "utf8", cwd: artifacts }));
const source = JSON.parse(readFileSync(path.join(packageRoot, "schema/project-snapshot.schema.json"), "utf8"));
const packagedVersion = packaged.properties?.schemaVersion?.const;
const sourceVersion = source.properties?.schemaVersion?.const;
if (packagedVersion !== sourceVersion) throw new Error(`Scanner artifact ${archive} embeds schema ${packagedVersion}; source requires ${sourceVersion}.`);
console.log(`Scanner artifact ${archive} matches ProjectSnapshot schema ${sourceVersion}.`);
