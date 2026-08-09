/**
 * Portable mirror of buildstory-scan's ProjectSnapshot 1.2.0 contract.
 *
 * This is the only snapshot shape accepted at the scanner HTTP boundary. The
 * product-facing report model in lib/project-snapshot.ts is derived from this
 * transport object after validation; it is never accepted as upload input.
 */

export const PROJECT_SNAPSHOT_SCHEMA_VERSION = "1.7.0" as const;
/** Accepted only as a transport compatibility shim; new scanners must emit 1.7.0. */
export const PREVIOUS_PROJECT_SNAPSHOT_SCHEMA_VERSION = "1.6.0" as const;
/** Still accepted at the upload boundary for already-installed CLIs during rollout. See validation.ts. */
export const LEGACY_PROJECT_SNAPSHOT_SCHEMA_VERSION = "1.3.0" as const;
export const OLDEST_PROJECT_SNAPSHOT_SCHEMA_VERSION = "1.2.0" as const;
export const CONNECT_PROTOCOL_VERSION = "1.0" as const;
export const NARRATIVE_EVIDENCE_CONSENT_VERSION = "1.0" as const;
export const NARRATIVE_EVIDENCE_BUNDLE_VERSION = "1.0.0" as const;

export type IsoDateTime = string;
export type Sha256Digest = `sha256:${string}`;
/**
 * Connection-level mode, chosen on the dashboard. Distinct from
 * GeneratedNarrative.mode below (always "local" in the snapshot itself,
 * for both "local" and "byok" scans - see the scanner package's
 * contract.ts for the full rationale).
 */
export type NarrativeMode = "local" | "byok" | "cloud" | "off";

/**
 * Every AI coding-session source the scanner can read. gemini-antigravity
 * and cursor are best-effort adapters built from researched, unverified
 * local formats - see ProviderSelection.diagnostic and the
 * PROVIDER_FORMAT_UNVERIFIED quality warning.
 */
export type ProviderId = "codex" | "claude-code" | "gemini-antigravity" | "cursor";

export interface ScannerProjectSnapshot {
  schemaVersion:
    | typeof PROJECT_SNAPSHOT_SCHEMA_VERSION
    | typeof PREVIOUS_PROJECT_SNAPSHOT_SCHEMA_VERSION
    | typeof LEGACY_PROJECT_SNAPSHOT_SCHEMA_VERSION
    | typeof OLDEST_PROJECT_SNAPSHOT_SCHEMA_VERSION;
  scanId: `scan_${string}`;
  generatedAt: IsoDateTime;
  sourceSelection: SourceSelection;
  repository: RepositoryIdentity;
  timeWindow: TimeWindow;
  sessions: SessionSummary[];
  usage: UsageSummary;
  git: GitAggregateMetrics;
  milestones: Milestone[];
  evidence: EvidenceReference[];
  redaction: RedactionSummary;
  provenance: Provenance;
  quality: QualitySummary;
  /** Opt-in only; absent from every default scan. See NarrativeEvidenceBundle. */
  narrativeEvidence?: NarrativeEvidenceBundle;
  /** Generated locally by the scanner; cloud narratives never enter the upload. */
  generatedNarrative?: GeneratedNarrative;
}

export type StoryPackPhase = "discover" | "decide" | "deliver";
export type StoryPackMomentKind = "discovery" | "decision" | "breakthrough" | "delivery";

export type StoryPackSource = {
  ref: string;
  provider: ProviderId | "git";
  sessionRef?: string;
  occurredAt: IsoDateTime;
  evidenceRefs: string[];
  excerptRef?: string;
  metrics: { turns: number; assistantMessages: number; toolCalls: number };
};

export type ReportStoryPackV2 = {
  version: "2.0.0";
  sources: StoryPackSource[];
  hero: { headline: string; summary: string };
  buildArc: Array<{ phase: StoryPackPhase; headline: string; summary: string; sourceRefs: string[] }>;
  moments: Array<{
    phase: StoryPackPhase;
    kind: StoryPackMomentKind;
    title: string;
    whatHappened: string;
    whyItMattered: string;
    sourceRefs: string[];
  }>;
  turningPoint: { quote: string; sourceRefs: string[] };
  decisions: Array<{ title: string; rationale: string; outcome: string; sourceRefs: string[] }>;
  learnings: Array<{ title: string; detail: string; sourceRefs: string[] }>;
  standoutTraits: Array<{ title: string; detail: string; sourceRefs: string[] }>;
  growthEdge: { title: string; observation: string; nextStep: string; sourceRefs: string[] };
};

export type NarrativeExcerptRole =
  | "session-title"
  | "user-intent"
  | "plan-transition"
  | "assistant-decision"
  | "outcome";

export interface NarrativeExcerpt {
  excerptId: string;
  sessionRef: string;
  occurredAt: IsoDateTime;
  role: NarrativeExcerptRole;
  text: string;
}

export type NarrativeEvidenceEmptyReason =
  | "no-supported-provider-evidence"
  | "no-candidates-in-window"
  | "all-candidates-rejected";

export interface NarrativeEvidenceBundle {
  bundleVersion: typeof NARRATIVE_EVIDENCE_BUNDLE_VERSION;
  generatedAt: IsoDateTime;
  policy: {
    maxExcerpts: number;
    maxCharsPerExcerpt: number;
    maxTotalChars: number;
    excerptSelection: "deterministic-heuristic-v1";
  };
  consent: {
    mode: "explicit-cli-review";
    statementVersion: typeof NARRATIVE_EVIDENCE_CONSENT_VERSION;
    approvedActions: ["send-redacted-excerpts-to-configured-cloud-model"];
  };
  excerpts: NarrativeExcerpt[];
  discarded: {
    candidates: number;
    rejectedByRedaction: number;
    rejectedByBudget: number;
  };
  emptyReason?: NarrativeEvidenceEmptyReason;
}

export type GeneratedNarrativeSections = {
  headline: string;
  narrative: string;
  turningPoint: string;
  learnings: string[];
  decisionPatterns: string[];
  standoutTraits: string[];
  growthEdge: string;
};

export type GeneratedNarrative = {
  version: "1.0.0" | "2.0.0";
  generatedAt: IsoDateTime;
  mode: "local";
  provider: string;
  model: string;
  sections: GeneratedNarrativeSections;
  storyPack?: ReportStoryPackV2;
  fallbacksUsed: string[];
};

export interface SourceSelection {
  providers: ProviderSelection[];
  consent: {
    mode: "explicit-cli";
    statementVersion: "1.0";
    approvedActions: [
      "read-repository-metadata",
      "read-selected-local-session-metadata",
      "write-local-snapshot",
    ];
    deniedActions: ["network-upload"];
  };
}

export type ProviderDiagnosticCode = "not-installed" | "no-project-directory" | "no-matching-sessions" | "format-unsupported" | "scope-unknown" | "scanned";

export interface ProviderSelection {
  provider: ProviderId;
  selected: true;
  repositoryScoped: true;
  rootsConsidered: number;
  filesDiscovered: number;
  sessionsMatched: number;
  sessionsIncluded: number;
  warnings?: number;
  diagnostic?: ProviderDiagnosticCode;
}

export interface RepositoryIdentity {
  fingerprint: Sha256Digest;
  fingerprintBasis: "canonical-remote" | "local-path";
  displayName: string;
  vcs: "git";
  rootPathIncluded: false;
  headCommit: string | null;
  branch: string | null;
  detachedHead: boolean;
  remote: {
    repositoryPathHash: Sha256Digest;
  } | null;
  bare: boolean;
}

export interface TimeWindow {
  start: IsoDateTime;
  end: IsoDateTime;
  timezone: "UTC";
  startBasis: "explicit" | "full-history" | "default-lookback" | "empty-repository";
  endBasis: "explicit" | "latest-session" | "head-commit" | "unix-epoch";
  utcOffsetMinutes?: number;
}

export type SessionStatus = "completed" | "aborted" | "incomplete" | "unknown";

export interface SessionSummary {
  sessionRef: string;
  provider: ProviderId;
  sourceKind: "active" | "archived" | "custom";
  startedAt: IsoDateTime;
  endedAt: IsoDateTime;
  status: SessionStatus;
  workingDirectoryRelation: "repository-root" | "subdirectory";
  summary: string;
  turns: number;
  assistantMessages: number;
  toolCalls: number;
  modelRefs: string[];
  toolRefs: string[];
  tokenUsage: TokenUsage | null;
  planModeTurns?: number;
  subagentInvocations?: number;
}

export interface TokenUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
  cacheCreationInputTokens?: number;
  cacheCreation1hInputTokens?: number;
  cacheCreation5mInputTokens?: number;
  cacheReadInputTokens?: number;
}

export interface UsageSummary {
  tools: Array<{
    name: string;
    callCount: number;
    sessionCount: number;
  }>;
  models: Array<{
    provider: string;
    name: string;
    /** Legacy 1.6 wire key; scanner 0.6.4 normalizes this to model-response calls. */
    turnCount: number;
    sessionCount: number;
    /** Absent on a snapshot from a scanner older than 1.6.0 - treat the same as null. */
    tokenUsage?: TokenUsage | null;
    costMicroUsd?: number | null;
  }>;
  totalToolCalls: number;
  totalTurns: number;
  tokenUsage: TokenUsage | null;
  /** Absent on a snapshot from a scanner older than 1.6.0 - treat the same as "no cost data". */
  cost?: UsageCostSummary;
  /** Absent on a snapshot from a scanner older than 1.7.0 - coverage is unknown, not zero. */
  coverage?: UsageCoverage;
}

export interface UsageCostSummary {
  totalMicroUsd: number | null;
  pricedTokens: number;
  unpricedTokens: number;
  pricingTableVersion: string;
}

export interface UsageCoverage {
  sessionsDiscovered: number;
  sessionsIncluded: number;
  sessionsSkipped: number;
  skipped: Array<{
    reason: "outside-window" | "no-timestamp" | "duplicate-session-id" | "parse-failed" | "file-unreadable";
    count: number;
  }>;
  partiallyPricedModels: number;
}

export interface GitAggregateMetrics {
  commits: number;
  mergeCommits: number;
  contributors: number;
  fileTouches: number;
  insertions: number;
  deletions: number;
  workingTree: {
    isDirty: boolean;
    stagedEntries: number;
    modifiedEntries: number;
    untrackedEntries: number;
    conflictedEntries: number;
  };
}

export interface Milestone {
  milestoneId: string;
  kind: "session-activity" | "repository-activity";
  title: string;
  summary: string;
  occurredAt: IsoDateTime;
  evidenceRefs: string[];
}

export interface EvidenceReference {
  evidenceId: string;
  source: ProviderId | "git";
  kind: "session-boundary" | "tool-activity" | "git-aggregate";
  observedAt: IsoDateTime;
  digest: Sha256Digest;
  sessionRef?: string;
  eventOrdinal?: number;
}

export type RedactionCategory =
  | "private-key"
  | "anthropic-key"
  | "aws-access-key"
  | "github-token"
  | "gitlab-token"
  | "slack-token"
  | "stripe-key"
  | "twilio-key"
  | "openai-key"
  | "huggingface-token"
  | "npm-token"
  | "pypi-token"
  | "google-api-key"
  | "oauth-token"
  | "azure-storage-key"
  | "cloudflare-token"
  | "jwt"
  | "authorization"
  | "credential-url"
  | "sensitive-assignment"
  | "high-entropy"
  | "control-character";

export interface RedactionSummary {
  applied: true;
  findings: number;
  categories: Array<{ category: RedactionCategory; count: number }>;
  metadataValuesScanned: number;
  metadataValuesTruncated: number;
  transcriptBodiesDiscarded: number;
  toolPayloadsDiscarded: number;
  finalLeakCheckPassed: true;
  limitations: string[];
}

export interface Provenance {
  scanner: {
    name: "buildstory" | "story-scanner";
    version: string;
  };
  collectionMode: "local-read-only";
  sessionFormats: Array<"codex-jsonl" | "claude-code-jsonl" | "gemini-antigravity-jsonl" | "cursor-sqlite">;
  deterministicSerialization: "lexicographic-json";
  repositoryCommands: Array<
    | "git-config"
    | "git-log-shortstat"
    | "git-rev-list"
    | "git-rev-parse"
    | "git-show"
    | "git-status"
  >;
  sourceFilesConsidered: number;
  sourceFilesParsed: number;
  sourceFilesSkipped: number;
}

export type QualityWarningCode =
  | "CODEX_ROOT_UNAVAILABLE"
  | "CLAUDE_CODE_ROOT_UNAVAILABLE"
  | "GEMINI_ANTIGRAVITY_ROOT_UNAVAILABLE"
  | "CURSOR_ROOT_UNAVAILABLE"
  | "PROVIDER_FORMAT_UNVERIFIED"
  | "PROVIDER_SCOPE_UNKNOWN"
  | "SESSION_FILE_LIMIT_REACHED"
  | "SESSION_FILE_TOO_LARGE"
  | "SESSION_LINE_TOO_LARGE"
  | "SESSION_LINE_INVALID_JSON"
  | "SESSION_MISSING_METADATA"
  | "SESSION_TIMESTAMP_INVALID"
  | "SESSION_MODEL_UNKNOWN"
  | "SESSION_ACTIVE_AT_SCAN_END"
  | "GIT_HISTORY_UNAVAILABLE"
  | "GIT_STATUS_UNAVAILABLE"
  | "NO_MATCHING_SESSIONS";

export interface QualityWarning {
  code: QualityWarningCode;
  severity: "info" | "warning";
  message: string;
  sessionRef?: string;
}

export interface QualitySummary {
  level: "high" | "medium" | "low";
  warningCount: number;
  warnings: QualityWarning[];
  assumptions: string[];
}
