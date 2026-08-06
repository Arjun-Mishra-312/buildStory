import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifacts = path.join(root, "artifacts");
const archive = readdirSync(artifacts).filter((name) => /^buildstory-scanner-.*\.tgz$/.test(name)).sort().at(-1);
if (!archive) throw new Error("No packed scanner artifact found in artifacts/.");
const archivePath = path.join(artifacts, archive);
const packaged = JSON.parse(execFileSync("tar", ["-xOf", archivePath, "package/schema/project-snapshot.schema.json"], { encoding: "utf8" }));
const source = JSON.parse(readFileSync(path.join(root, "packages/buildstory-scanner/schema/project-snapshot.schema.json"), "utf8"));
const packagedVersion = packaged.properties?.schemaVersion?.const;
const sourceVersion = source.properties?.schemaVersion?.const;
if (packagedVersion !== sourceVersion) throw new Error(`Scanner artifact ${archive} embeds schema ${packagedVersion}; source requires ${sourceVersion}.`);
console.log(`Scanner artifact ${archive} matches ProjectSnapshot schema ${sourceVersion}.`);
