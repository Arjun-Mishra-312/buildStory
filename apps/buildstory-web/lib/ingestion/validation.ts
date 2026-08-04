import type { ErrorObject } from "ajv";
import validateSchema from "./generated/project-snapshot-validator.mjs";
import type { SnapshotValidationResult } from "./contracts";
import type {
  QualityWarningCode,
  ScannerProjectSnapshot,
} from "./scanner-project-snapshot";
import { PROJECT_SNAPSHOT_SCHEMA_VERSION } from "./scanner-project-snapshot";
import { sanitizePublicText } from "../publication/sanitization";

export const MAX_SNAPSHOT_BYTES = 1_000_000;

const forbiddenRawFieldNames = new Set([
  "absolutepath",
  "assistantresponse",
  "assistantresponses",
  "commitmessage",
  "commitmessages",
  "cwd",
  "diff",
  "environment",
  "environmentvariables",
  "filebody",
  "filecontent",
  "filepath",
  "filepaths",
  "messagebody",
  "messages",
  "host",
  "patch",
  "prompt",
  "prompts",
  "rawremote",
  "rawsource",
  "rawtranscript",
  "remoteurl",
  "repositorypath",
  "sourcecode",
  "sourcetext",
  "toolarguments",
  "toolinput",
  "tooloutput",
  "toolpayload",
  "toolresult",
  "toolresults",
  "transcript",
  "transcriptbody",
  "transcriptcontent",
  "transcripttext",
]);

function normalizeFieldName(value: string) {
  return value.toLocaleLowerCase("en-US").replaceAll(/[^a-z0-9]/g, "");
}

function rawFieldViolations(
  value: unknown,
  path = "$",
  errors: string[] = [],
): string[] {
  if (errors.length >= 20 || value === null || typeof value !== "object") {
    return errors;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => rawFieldViolations(item, `${path}[${index}]`, errors));
    return errors;
  }
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenRawFieldNames.has(normalizeFieldName(key))) {
      errors.push(
        `${path}.${key} is forbidden: ProjectSnapshot cannot contain raw source, transcript, path, diff, prompt, or tool-payload fields.`,
      );
    }
    rawFieldViolations(child, `${path}.${key}`, errors);
    if (errors.length >= 20) break;
  }
  return errors;
}

function displayPath(instancePath: string) {
  return instancePath ? `$${instancePath.replaceAll("/", ".")}` : "$";
}

function formatSchemaError(error: ErrorObject) {
  const path = displayPath(error.instancePath);
  if (error.keyword === "additionalProperties") {
    const field = String(
      (error.params as { additionalProperty?: unknown }).additionalProperty ??
        "unknown",
    );
    return `${path}.${field} is not part of ProjectSnapshot ${PROJECT_SNAPSHOT_SCHEMA_VERSION}.`;
  }
  if (error.keyword === "required") {
    const field = String(
      (error.params as { missingProperty?: unknown }).missingProperty ?? "field",
    );
    return `${path}.${field} is required.`;
  }
  return `${path} ${error.message ?? `does not match ProjectSnapshot ${PROJECT_SNAPSHOT_SCHEMA_VERSION}`}.`;
}

/** Human-facing label for a provider id. Mirrors @buildstory/scanner's scanner.ts providerLabel exactly. */
function providerLabel(provider: ScannerProjectSnapshot["sessions"][number]["provider"]) {
  return provider === "claude-code" ? "Claude Code" : "Codex";
}

/**
 * Assumption strings the scanner emits for a snapshot. Mirrors
 * @buildstory/scanner's scanner.ts assumptionsForProviders exactly -
 * generic assumptions first, then provider-specific ones appended only for
 * providers actually present in sourceSelection.providers, in provider order
 * (which the scanner always emits sorted).
 */
function expectedAssumptions(snapshot: ScannerProjectSnapshot) {
  const providerIds = snapshot.sourceSelection.providers.map((selection) => selection.provider);
  const assumptions = [
    "When no explicit start is supplied, the scanner uses a deterministic 30-day lookback from the effective end.",
    "Git fileTouches is the sum of per-commit changed-file counts and is not a unique-file count.",
  ];
  if (providerIds.includes("codex")) {
    assumptions.push(
      "Codex sessions are repository-scoped from session or turn-context working-directory metadata.",
      "User-turn and assistant-message counts prefer event records and fall back to response records to avoid double counting.",
    );
  }
  if (providerIds.includes("claude-code")) {
    assumptions.push(
      "Claude Code sessions are repository-scoped from the working directory recorded on transcript lines.",
      "Claude Code turn counts exclude tool-result continuation lines; only author-authored messages are counted as turns.",
      "Claude Code token usage is summed per assistant message rather than read from a cumulative counter.",
      "Claude Code subagent invocations and their token usage are counted from a sibling transcript directory when present.",
    );
  }
  return assumptions;
}

const expectedLimitations = [
  "Pattern matching cannot identify every secret, especially novel formats or low-entropy credentials.",
  "Repository names, branch names, tool names, and model names are metadata and may still be identifying after redaction.",
  "JSONL records are parsed in local process memory; transcript bodies and tool payloads are immediately discarded and never serialized.",
  "Opaque hashes prevent direct disclosure but can permit correlation, and low-entropy inputs may be guessable.",
];

const expectedWarningMessages: Record<QualityWarningCode, readonly string[]> = {
  CODEX_ROOT_UNAVAILABLE: [
    "A configured Codex session root was unavailable and was skipped.",
  ],
  CLAUDE_CODE_ROOT_UNAVAILABLE: [
    "The configured Claude Code session root was unavailable and was skipped.",
  ],
  SESSION_FILE_LIMIT_REACHED: [
    "Only the first 5000 sorted Codex session files were considered.",
    "Only the first 5000 sorted Claude Code session files were considered.",
  ],
  SESSION_FILE_TOO_LARGE: [
    "A Codex session exceeded the 128 MiB safety limit and was skipped.",
    "A Claude Code session exceeded the 128 MiB safety limit and was skipped.",
  ],
  SESSION_LINE_TOO_LARGE: [
    "At least one JSONL record exceeded the 4 MiB safety limit and was ignored.",
  ],
  SESSION_LINE_INVALID_JSON: [
    "At least one JSONL record was invalid and ignored.",
  ],
  SESSION_MISSING_METADATA: [
    "A Codex JSONL file had no repository-scoping metadata in its discovery prefix.",
    "A Claude Code transcript had no repository-scoping metadata in its discovery prefix.",
  ],
  SESSION_TIMESTAMP_INVALID: [
    "At least one session timestamp was invalid and ignored.",
    "A matched session had no usable timestamp and was excluded.",
  ],
  SESSION_MODEL_UNKNOWN: [
    "No model identifier was present in the session metadata.",
    "No model identifier was present in an assistant message.",
  ],
  SESSION_ACTIVE_AT_SCAN_END: [
    "An active Codex session had no completion marker at the observed boundary.",
    "An active Claude Code session had no completion marker at the observed boundary.",
  ],
  GIT_HISTORY_UNAVAILABLE: [
    "The repository has no readable HEAD commit; history aggregates are zero.",
    "Some Git history aggregates could not be read and may be incomplete.",
  ],
  GIT_STATUS_UNAVAILABLE: [
    "Working-tree status could not be read; status aggregates are zero.",
  ],
  NO_MATCHING_SESSIONS: [
    "No Codex sessions were scoped to the selected repository.",
    "No Claude Code sessions were scoped to the selected repository.",
  ],
};

function sameOrderedStrings(actual: string[], expected: string[]) {
  return actual.length === expected.length &&
    actual.every((value, index) => value === expected[index]);
}

function contentTextEntries(snapshot: ScannerProjectSnapshot) {
  const entries: Array<[path: string, value: string]> = [
    ["$.repository.displayName", snapshot.repository.displayName],
  ];
  if (snapshot.repository.branch !== null) {
    entries.push(["$.repository.branch", snapshot.repository.branch]);
  }
  snapshot.sessions.forEach((session, index) => {
    entries.push([`$.sessions[${index}].summary`, session.summary]);
    session.modelRefs.forEach((value, itemIndex) =>
      entries.push([`$.sessions[${index}].modelRefs[${itemIndex}]`, value]));
    session.toolRefs.forEach((value, itemIndex) =>
      entries.push([`$.sessions[${index}].toolRefs[${itemIndex}]`, value]));
  });
  snapshot.usage.tools.forEach((tool, index) =>
    entries.push([`$.usage.tools[${index}].name`, tool.name]));
  snapshot.usage.models.forEach((model, index) => {
    entries.push([`$.usage.models[${index}].provider`, model.provider]);
    entries.push([`$.usage.models[${index}].name`, model.name]);
  });
  snapshot.milestones.forEach((milestone, index) => {
    entries.push([`$.milestones[${index}].title`, milestone.title]);
    entries.push([`$.milestones[${index}].summary`, milestone.summary]);
  });
  snapshot.redaction.limitations.forEach((value, index) =>
    entries.push([`$.redaction.limitations[${index}]`, value]));
  snapshot.quality.warnings.forEach((warning, index) =>
    entries.push([`$.quality.warnings[${index}].message`, warning.message]));
  snapshot.quality.assumptions.forEach((value, index) =>
    entries.push([`$.quality.assumptions[${index}]`, value]));
  return entries;
}

function privacyBoundaryViolations(snapshot: ScannerProjectSnapshot) {
  const errors: string[] = [];
  for (const [path, value] of contentTextEntries(snapshot)) {
    const findings = sanitizePublicText(value, value.length).findings;
    if (findings.length > 0) {
      errors.push(
        `${path} violates the upload privacy boundary (${findings.join(", ")}); secrets, URLs or hosts, and paths are not accepted.`,
      );
    }
    if (errors.length >= 20) break;
  }
  return errors;
}

function deterministicNarrativeViolations(snapshot: ScannerProjectSnapshot) {
  const errors: string[] = [];
  const expectedSummaries = new Map<string, string>();
  for (const [index, session] of snapshot.sessions.entries()) {
    const expected = `${providerLabel(session.provider)} session with ${session.turns} user turn${session.turns === 1 ? "" : "s"}, ${session.assistantMessages} assistant message${session.assistantMessages === 1 ? "" : "s"}, and ${session.toolCalls} tool call${session.toolCalls === 1 ? "" : "s"}.`;
    expectedSummaries.set(expected, `${providerLabel(session.provider)} session activity`);
    if (session.summary !== expected) {
      errors.push(`$.sessions[${index}].summary is not a scanner-generated aggregate summary.`);
    }
  }

  for (const [index, milestone] of snapshot.milestones.entries()) {
    if (milestone.kind === "session-activity") {
      if (expectedSummaries.get(milestone.summary) !== milestone.title) {
        errors.push(`$.milestones[${index}] is not a scanner-generated session milestone.`);
      }
    } else {
      const commits = snapshot.git.commits;
      const expected = `${commits} commit${commits === 1 ? "" : "s"} observed in the selected time window.`;
      if (milestone.title !== "Repository activity" || milestone.summary !== expected) {
        errors.push(`$.milestones[${index}] is not a scanner-generated repository milestone.`);
      }
    }
  }

  for (const [index, warning] of snapshot.quality.warnings.entries()) {
    if (!expectedWarningMessages[warning.code].includes(warning.message)) {
      errors.push(`$.quality.warnings[${index}].message is not a scanner-generated warning.`);
    }
  }
  if (!sameOrderedStrings(snapshot.quality.assumptions, expectedAssumptions(snapshot))) {
    errors.push(`$.quality.assumptions does not match ProjectSnapshot ${PROJECT_SNAPSHOT_SCHEMA_VERSION} scanner output.`);
  }
  if (!sameOrderedStrings(snapshot.redaction.limitations, expectedLimitations)) {
    errors.push(`$.redaction.limitations does not match ProjectSnapshot ${PROJECT_SNAPSHOT_SCHEMA_VERSION} scanner output.`);
  }
  if (snapshot.quality.warningCount !== snapshot.quality.warnings.length) {
    errors.push("$.quality.warningCount does not match the warnings array.");
  }
  const findingCount = snapshot.redaction.categories.reduce(
    (total, category) => total + category.count,
    0,
  );
  if (snapshot.redaction.findings !== findingCount) {
    errors.push("$.redaction.findings does not match the redaction category counts.");
  }
  return errors.slice(0, 20);
}

export function validateProjectSnapshot(
  value: unknown,
): SnapshotValidationResult {
  const forbidden = rawFieldViolations(value);
  if (forbidden.length) return { ok: false, errors: forbidden };

  if (!validateSchema(value)) {
    const errors = (validateSchema.errors ?? [])
      .map(formatSchemaError)
      .filter((message, index, all) => all.indexOf(message) === index)
      .slice(0, 50);
    return {
      ok: false,
      errors: errors.length
        ? errors
        : [`Snapshot does not match ProjectSnapshot ${PROJECT_SNAPSHOT_SCHEMA_VERSION}.`],
    };
  }

  const snapshot = value as ScannerProjectSnapshot;
  const privacyErrors = [
    ...privacyBoundaryViolations(snapshot),
    ...deterministicNarrativeViolations(snapshot),
  ].slice(0, 20);
  if (privacyErrors.length > 0) return { ok: false, errors: privacyErrors };

  return { ok: true, snapshot };
}
