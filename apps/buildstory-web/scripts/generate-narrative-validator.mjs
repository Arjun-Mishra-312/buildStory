import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import standaloneCode from "ajv/dist/standalone/index.js";

/**
 * Cloudflare Workers (workerd) disallows runtime code generation
 * (new Function/eval), which is exactly how Ajv's ajv.compile() normally
 * works. This script precompiles the narrative output schema into a plain
 * JS module at build time - the same approach already used for the
 * ProjectSnapshot validator (see generate-snapshot-validator.mjs).
 */

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const outputDirectory = path.join(projectRoot, "lib", "narrative", "generated");
const entries = [
  ["narrative-output.schema.json", "narrative-output-validator.mjs"],
  ["narrative-profile-output.schema.json", "narrative-profile-output-validator.mjs"],
];

for (const [schemaFileName, outputFileName] of entries) {
  const schemaPath = path.join(projectRoot, "lib", "narrative", schemaFileName);
  const outputPath = path.join(outputDirectory, outputFileName);
  const schema = JSON.parse(await readFile(schemaPath, "utf8"));
  const ajv = new Ajv2020({ allErrors: true, strict: true, code: { esm: true, source: true } });
  const validate = ajv.compile(schema);
  const runtimeImports = `import equalModule from "ajv/dist/runtime/equal.js";
import ucs2LengthModule from "ajv/dist/runtime/ucs2length.js";`;
  const browserSafeStandalone = standaloneCode(ajv, validate)
    .replace('const func0 = require("ajv/dist/runtime/equal").default;', "const func0 = equalModule.default;")
    .replaceAll('require("ajv/dist/runtime/ucs2length").default;', "ucs2LengthModule.default;");
  if (browserSafeStandalone.includes("require(")) throw new Error("Generated narrative validator contains an unhandled CommonJS runtime dependency.");
  const source = `/* eslint-disable */
/* Generated from ${schemaFileName}. Do not edit by hand. */
${runtimeImports}
${browserSafeStandalone}`;
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputPath, source, "utf8");
}
