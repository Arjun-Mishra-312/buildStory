import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import standaloneCode from "ajv/dist/standalone/index.js";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const schemaPath = path.join(
  projectRoot,
  "lib",
  "ingestion",
  "project-snapshot.schema.json",
);
const outputDirectory = path.join(
  projectRoot,
  "lib",
  "ingestion",
  "generated",
);
const outputPath = path.join(outputDirectory, "project-snapshot-validator.mjs");

const schema = JSON.parse(await readFile(schemaPath, "utf8"));
const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  validateFormats: true,
  code: { esm: true, source: true },
});
addFormats(ajv);
const validate = ajv.compile(schema);
const runtimeImports = `import formatsModule from "ajv-formats/dist/formats.js";
import equalModule from "ajv/dist/runtime/equal.js";
import ucs2LengthModule from "ajv/dist/runtime/ucs2length.js";`;

const browserSafeStandalone = standaloneCode(ajv, validate)
  .replace(
    'const formats0 = require("ajv-formats/dist/formats").fullFormats["date-time"];',
    'const formats0 = formatsModule.fullFormats["date-time"];',
  )
  .replace(
    'const func0 = require("ajv/dist/runtime/equal").default;',
    "const func0 = equalModule.default;",
  )
  .replace(
    'const func3 = require("ajv/dist/runtime/ucs2length").default;',
    "const func3 = ucs2LengthModule.default;",
  );

if (browserSafeStandalone.includes("require(")) {
  throw new Error(
    "Generated validator contains an unhandled CommonJS runtime dependency.",
  );
}

const source = `/* eslint-disable */
/* Generated from project-snapshot.schema.json. Do not edit by hand. */
${runtimeImports}
${browserSafeStandalone}`;

await mkdir(outputDirectory, { recursive: true });
await writeFile(outputPath, source, "utf8");
