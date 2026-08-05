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
const schemaPath = path.join(projectRoot, "lib", "narrative", "narrative-output.schema.json");
const outputDirectory = path.join(projectRoot, "lib", "narrative", "generated");
const outputPath = path.join(outputDirectory, "narrative-output-validator.mjs");

const NARRATIVE_OUTPUT_JSON_SCHEMA = JSON.parse(await readFile(schemaPath, "utf8"));

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  code: { esm: true, source: true },
});
const validate = ajv.compile(NARRATIVE_OUTPUT_JSON_SCHEMA);
const runtimeImports = `import equalModule from "ajv/dist/runtime/equal.js";
import ucs2LengthModule from "ajv/dist/runtime/ucs2length.js";`;

const browserSafeStandalone = standaloneCode(ajv, validate)
  .replace(
    'const func0 = require("ajv/dist/runtime/equal").default;',
    "const func0 = equalModule.default;",
  )
  .replace(
    'const func2 = require("ajv/dist/runtime/ucs2length").default;',
    "const func2 = ucs2LengthModule.default;",
  )
  .replace(
    'const func1 = require("ajv/dist/runtime/ucs2length").default;',
    "const func1 = ucs2LengthModule.default;",
  );

if (browserSafeStandalone.includes("require(")) {
  throw new Error(
    "Generated narrative validator contains an unhandled CommonJS runtime dependency.",
  );
}

const source = `/* eslint-disable */
/* Generated from lib/narrative/narrative-output-schema.mjs. Do not edit by hand. */
${runtimeImports}
${browserSafeStandalone}`;

await mkdir(outputDirectory, { recursive: true });
await writeFile(outputPath, source, "utf8");
