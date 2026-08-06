import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import standaloneCode from "ajv/dist/standalone/index.js";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const outputDirectory = path.join(
  projectRoot,
  "lib",
  "ingestion",
  "generated",
);

/**
 * Generates one standalone Ajv validator per accepted ProjectSnapshot schema
 * version. The current version is compiled to project-snapshot-validator.mjs
 * (the existing filename, so nothing else needs to change its import); every
 * older, still-accepted version compiles to project-snapshot-validator-
 * <version>.mjs. See lib/ingestion/validation.ts for how these are selected
 * by the payload's own schemaVersion field at upload time.
 */
const schemaFiles = [
  { schemaFileName: "project-snapshot.schema.json", outputFileName: "project-snapshot-validator.mjs" },
  { schemaFileName: "project-snapshot-1.3.0.schema.json", outputFileName: "project-snapshot-validator-1.3.0.mjs" },
  { schemaFileName: "project-snapshot-1.2.0.schema.json", outputFileName: "project-snapshot-validator-1.2.0.mjs" },
];

async function generateOne({ schemaFileName, outputFileName }) {
  const schemaPath = path.join(projectRoot, "lib", "ingestion", schemaFileName);
  const outputPath = path.join(outputDirectory, outputFileName);

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
      /const (formats\d+) = require\("ajv-formats\/dist\/formats"\)\.fullFormats\["date-time"\];/g,
      (_match, name) => `const ${name} = formatsModule.fullFormats["date-time"];`,
    )
    .replace(
      /const (func\d+) = require\("ajv\/dist\/runtime\/equal"\)\.default;/g,
      (_match, name) => `const ${name} = equalModule.default;`,
    )
    .replace(
      /const (func\d+) = require\("ajv\/dist\/runtime\/ucs2length"\)\.default;/g,
      (_match, name) => `const ${name} = ucs2LengthModule.default;`,
    );

  if (browserSafeStandalone.includes("require(")) {
    throw new Error(
      `Generated validator for ${schemaFileName} contains an unhandled CommonJS runtime dependency.`,
    );
  }

  const source = `/* eslint-disable */
/* Generated from ${schemaFileName}. Do not edit by hand. */
${runtimeImports}
${browserSafeStandalone}`;

  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputPath, source, "utf8");
}

for (const entry of schemaFiles) {
  await generateOne(entry);
}
