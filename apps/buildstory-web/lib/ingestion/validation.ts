import type { ErrorObject } from "ajv";
import validateSchemaCurrent from "./generated/project-snapshot-validator.mjs";
import validateSchemaLegacy from "./generated/project-snapshot-validator-1.2.0.mjs";
import validateSchema13 from "./generated/project-snapshot-validator-1.3.0.mjs";
import type { SnapshotValidationResult } from "./contracts";
import type {
  QualityWarningCode,
  ScannerProjectSnapshot,
} from "./scanner-project-snapshot";
import { LEGACY_PROJECT_SNAPSHOT_SCHEMA_VERSION, OLDEST_PROJECT_SNAPSHOT_SCHEMA_VERSION, PREVIOUS_PROJECT_SNAPSHOT_SCHEMA_VERSION, PROJECT_SNAPSHOT_SCHEMA_VERSION } from "./scanner-project-snapshot";
import { sanitizePublicText } from "../publication/sanitization";
import type { ReportStoryPackV2 } from "./scanner-project-snapshot";

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

function formatSchemaError(error: ErrorObject, versionLabel: string) {
  const path = displayPath(error.instancePath);
  if (error.keyword === "additionalProperties") {
    const field = String(
      (error.params as { additionalProperty?: unknown }).additionalProperty ??
        "unknown",
    );
    return `${path}.${field} is not part of ProjectSnapshot ${versionLabel}.`;
  }
  if (error.keyword === "required") {
    const field = String(
      (error.params as { missingProperty?: unknown }).missingProperty ?? "field",
    );
    return `${path}.${field} is required.`;
  }
  return `${path} ${error.message ?? `does not match ProjectSnapshot ${versionLabel}`}.`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

type SnapshotValidator = {
  (value: unknown): boolean;
  errors?: ErrorObject[] | null;
};

/**
 * Which compiled Ajv validator applies to an upload, chosen from the
 * payload's own schemaVersion before any structural validation runs. The
 * legacy 1.2.0 schema stays frozen (see project-snapshot-1.2.0.schema.json)
 * so an already-installed CLI that hasn't upgraded yet keeps working; every
 * other version - including an unrecognized one - is validated against the
 * current schema, which will fail closed on the schemaVersion const check.
 */
function resolveValidator(value: unknown): {
  validate: SnapshotValidator;
  versionLabel: string;
} {
  const version = isRecord(value) ? value.schemaVersion : undefined;
  if (version === OLDEST_PROJECT_SNAPSHOT_SCHEMA_VERSION) {
    return { validate: validateSchemaLegacy, versionLabel: OLDEST_PROJECT_SNAPSHOT_SCHEMA_VERSION };
  }
  if (version === LEGACY_PROJECT_SNAPSHOT_SCHEMA_VERSION) {
    return { validate: validateSchema13, versionLabel: LEGACY_PROJECT_SNAPSHOT_SCHEMA_VERSION };
  }
  if (version === PREVIOUS_PROJECT_SNAPSHOT_SCHEMA_VERSION) {
    const validatePrevious = ((candidate: unknown) => {
      if (!isRecord(candidate)) return false;
      return validateSchemaCurrent({ ...candidate, schemaVersion: PROJECT_SNAPSHOT_SCHEMA_VERSION });
    }) as SnapshotValidator;
    Object.defineProperty(validatePrevious, "errors", { get: () => validateSchemaCurrent.errors });
    return { validate: validatePrevious, versionLabel: PREVIOUS_PROJECT_SNAPSHOT_SCHEMA_VERSION };
  }
  return { validate: validateSchemaCurrent, versionLabel: PROJECT_SNAPSHOT_SCHEMA_VERSION };
}

/** Human-facing label for a provider id. Mirrors @buildstory/scanner's scanner.ts providerLabel exactly. */
function providerLabel(provider: ScannerProjectSnapshot["sessions"][number]["provider"]) {
  if (provider === "claude-code") return "Claude Code";
  if (provider === "gemini-antigravity") return "Gemini Antigravity";
  if (provider === "cursor") return "Cursor";
  return "Codex";
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
    "Estimated cost is priced from a static, versioned table of known model families; a model not in that table shows tokens only, never a guessed price.",
  ];
  if (providerIds.includes("codex")) {
    assumptions.push(
      "Codex sessions are repository-scoped from session or turn-context working-directory metadata.",
      "User-turn and assistant-message counts prefer event records and fall back to response records to avoid double counting.",
      "Codex token usage is a cumulative session-wide snapshot, not tied to a specific model event; a session that switches models attributes its tokens and estimated cost to whichever model had the most turns.",
    );
  }
  if (providerIds.includes("cursor")) {
    assumptions.push(
      "Cursor sessions are repository-scoped from each workspace's workspace.json folder path.",
      "Cursor's local conversation format is unverified; session content metrics are best-effort and may undercount or miss activity.",
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
  GEMINI_ANTIGRAVITY_ROOT_UNAVAILABLE: [
    "Google Antigravity's local data directory was not found; treated as not installed.",
  ],
  CURSOR_ROOT_UNAVAILABLE: [
    "Cursor's local workspace storage directory was not found; treated as not installed.",
  ],
  PROVIDER_FORMAT_UNVERIFIED: [
    "Google Antigravity is installed, but its local conversation format is not yet verified; no sessions were read.",
    "Cursor's local database could not be opened because this Node runtime has no built-in SQLite support; no sessions were read.",
    "A Cursor local database could not be read; treated as zero sessions for that workspace.",
    "Cursor's local conversation format is not yet verified against a real installation; session metrics are best-effort.",
  ],
  PROVIDER_SCOPE_UNKNOWN: [],
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
    "A Cursor workspace database had no recognizable user or assistant messages in its unverified local format.",
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
    "No Cursor sessions were scoped to the selected repository.",
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
  // narrativeEvidence.excerpts[].text is the one field in ProjectSnapshot
  // deliberately allowed to carry real (redacted) conversation text rather
  // than scanner-generated metadata - the schema's additionalProperties
  // guard and rawFieldViolations' forbidden-name list both intentionally
  // permit it. This privacy-boundary scan is the server-side backstop for
  // that exception: the scanner already redacted every excerpt before
  // sending it, but a snapshot is rejected outright if any excerpt still
  // fails this check on arrival rather than silently accepted.
  if (snapshot.narrativeEvidence) {
    snapshot.narrativeEvidence.excerpts.forEach((excerpt, index) =>
      entries.push([`$.narrativeEvidence.excerpts[${index}].text`, excerpt.text]));
  }
  if (snapshot.generatedNarrative) {
    const sections = snapshot.generatedNarrative.sections;
    entries.push(["$.generatedNarrative.sections.headline", sections.headline]);
    entries.push(["$.generatedNarrative.sections.narrative", sections.narrative]);
    entries.push(["$.generatedNarrative.sections.turningPoint", sections.turningPoint]);
    sections.learnings.forEach((value, index) => entries.push([`$.generatedNarrative.sections.learnings[${index}]`, value]));
    sections.decisionPatterns.forEach((value, index) => entries.push([`$.generatedNarrative.sections.decisionPatterns[${index}]`, value]));
    sections.standoutTraits.forEach((value, index) => entries.push([`$.generatedNarrative.sections.standoutTraits[${index}]`, value]));
    entries.push(["$.generatedNarrative.sections.growthEdge", sections.growthEdge]);
    const pack = snapshot.generatedNarrative.storyPack;
    if (pack) {
      entries.push(["$.generatedNarrative.storyPack.hero.headline", pack.hero.headline]);
      entries.push(["$.generatedNarrative.storyPack.hero.summary", pack.hero.summary]);
      pack.buildArc.forEach((item, index) => {
        entries.push([`$.generatedNarrative.storyPack.buildArc[${index}].headline`, item.headline]);
        entries.push([`$.generatedNarrative.storyPack.buildArc[${index}].summary`, item.summary]);
      });
      pack.moments.forEach((item, index) => {
        entries.push([`$.generatedNarrative.storyPack.moments[${index}].title`, item.title]);
        entries.push([`$.generatedNarrative.storyPack.moments[${index}].whatHappened`, item.whatHappened]);
        entries.push([`$.generatedNarrative.storyPack.moments[${index}].whyItMattered`, item.whyItMattered]);
      });
      entries.push(["$.generatedNarrative.storyPack.turningPoint.quote", pack.turningPoint.quote]);
      pack.decisions.forEach((item, index) => {
        entries.push([`$.generatedNarrative.storyPack.decisions[${index}].title`, item.title]);
        entries.push([`$.generatedNarrative.storyPack.decisions[${index}].rationale`, item.rationale]);
        entries.push([`$.generatedNarrative.storyPack.decisions[${index}].outcome`, item.outcome]);
      });
      pack.learnings.forEach((item, index) => {
        entries.push([`$.generatedNarrative.storyPack.learnings[${index}].title`, item.title]);
        entries.push([`$.generatedNarrative.storyPack.learnings[${index}].detail`, item.detail]);
      });
      pack.standoutTraits.forEach((item, index) => {
        entries.push([`$.generatedNarrative.storyPack.standoutTraits[${index}].title`, item.title]);
        entries.push([`$.generatedNarrative.storyPack.standoutTraits[${index}].detail`, item.detail]);
      });
      entries.push(["$.generatedNarrative.storyPack.growthEdge.title", pack.growthEdge.title]);
      entries.push(["$.generatedNarrative.storyPack.growthEdge.observation", pack.growthEdge.observation]);
      entries.push(["$.generatedNarrative.storyPack.growthEdge.nextStep", pack.growthEdge.nextStep]);
    }
  }
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
  // Local and cloud narrative generation are mutually exclusive by design:
  // local mode's whole privacy guarantee is that conversation excerpts never
  // leave the machine. The scanner enforces this client-side
  // (NARRATIVE_MODE_CONFLICT), but the server must not simply trust that -
  // a snapshot claiming both must be rejected outright rather than silently
  // preferring one field, which would let excerpts reach storage anyway.
  if (snapshot.generatedNarrative && snapshot.narrativeEvidence && snapshot.narrativeEvidence.excerpts.length > 0) {
    errors.push(
      "$.generatedNarrative and $.narrativeEvidence.excerpts cannot both be present - local and cloud narrative generation are mutually exclusive.",
    );
  }
  return errors.slice(0, 20);
}

function storyPackViolations(snapshot: ScannerProjectSnapshot): string[] {
  const pack = snapshot.generatedNarrative?.storyPack as ReportStoryPackV2 | undefined;
  if (!pack) return [];
  const errors: string[] = [];
  if (pack.version !== "2.0.0") errors.push("$.generatedNarrative.storyPack.version must be 2.0.0.");
  const refs = new Set(pack.sources.map((source) => source.ref));
  const checkRefs = (path: string, values: string[]) => values.forEach((ref, index) => {
    if (!refs.has(ref)) errors.push(`${path}[${index}] references unknown source ${ref}.`);
  });
  const phases = pack.buildArc.map((phase) => phase.phase);
  if (phases.length !== 3 || new Set(phases).size !== 3 || !(["discover", "decide", "deliver"] as const).every((phase) => phases.includes(phase))) {
    errors.push("$.generatedNarrative.storyPack.buildArc must contain exactly one discover, decide, and deliver phase.");
  }
  if (pack.moments.length < 3 || pack.moments.length > 5) errors.push("$.generatedNarrative.storyPack.moments must contain 3-5 items.");
  if (pack.decisions.length < 2 || pack.decisions.length > 4) errors.push("$.generatedNarrative.storyPack.decisions must contain 2-4 items.");
  if (pack.learnings.length < 2 || pack.learnings.length > 4) errors.push("$.generatedNarrative.storyPack.learnings must contain 2-4 items.");
  if (pack.standoutTraits.length < 2 || pack.standoutTraits.length > 4) errors.push("$.generatedNarrative.storyPack.standoutTraits must contain 2-4 items.");
  pack.buildArc.forEach((item, index) => checkRefs(`$.generatedNarrative.storyPack.buildArc[${index}].sourceRefs`, item.sourceRefs));
  pack.moments.forEach((item, index) => checkRefs(`$.generatedNarrative.storyPack.moments[${index}].sourceRefs`, item.sourceRefs));
  checkRefs("$.generatedNarrative.storyPack.turningPoint.sourceRefs", pack.turningPoint.sourceRefs);
  pack.decisions.forEach((item, index) => checkRefs(`$.generatedNarrative.storyPack.decisions[${index}].sourceRefs`, item.sourceRefs));
  pack.learnings.forEach((item, index) => checkRefs(`$.generatedNarrative.storyPack.learnings[${index}].sourceRefs`, item.sourceRefs));
  pack.standoutTraits.forEach((item, index) => checkRefs(`$.generatedNarrative.storyPack.standoutTraits[${index}].sourceRefs`, item.sourceRefs));
  checkRefs("$.generatedNarrative.storyPack.growthEdge.sourceRefs", pack.growthEdge.sourceRefs);
  return errors.slice(0, 20);
}

export function validateProjectSnapshot(
  value: unknown,
): SnapshotValidationResult {
  const forbidden = rawFieldViolations(value);
  if (forbidden.length) return { ok: false, errors: forbidden };

  const { validate: validateSchema, versionLabel } = resolveValidator(value);
  if (!validateSchema(value)) {
    const errors = (validateSchema.errors ?? [])
      .map((error) => formatSchemaError(error, versionLabel))
      .filter((message, index, all) => all.indexOf(message) === index)
      .slice(0, 50);
    return {
      ok: false,
      errors: errors.length
        ? errors
        : [`Snapshot does not match ProjectSnapshot ${versionLabel}.`],
    };
  }

  const snapshot = value as ScannerProjectSnapshot;
  const privacyErrors = [
    ...privacyBoundaryViolations(snapshot),
    ...deterministicNarrativeViolations(snapshot),
    ...storyPackViolations(snapshot),
  ].slice(0, 20);
  if (privacyErrors.length > 0) return { ok: false, errors: privacyErrors };

  return { ok: true, snapshot };
}
