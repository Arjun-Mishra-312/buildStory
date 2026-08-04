/**
 * Portable mirror of @buildstory/scanner's ProjectSnapshot 1.1.0 contract.
 *
 * This is the only snapshot shape accepted at the scanner HTTP boundary. The
 * product-facing report model in lib/project-snapshot.ts is derived from this
 * transport object after validation; it is never accepted as upload input.
 */

export const PROJECT_SNAPSHOT_SCHEMA_VERSION = "1.1.0" as const;
export const CONNECT_PROTOCOL_VERSION = "1.0" as const;

export type IsoDateTime = string;
export type Sha256Digest = `sha256:${string}`;

/** Every AI coding-session source the scanner can read. */
export type ProviderId = "codex" | "claude-code";

export interface ScannerProjectSnapshot {
  schemaVersion: typeof PROJECT_SNAPSHOT_SCHEMA_VERSION;
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
}

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

export interface ProviderSelection {
  provider: ProviderId;
  selected: true;
  repositoryScoped: true;
  rootsConsidered: number;
  filesDiscovered: number;
  sessionsMatched: number;
  sessionsIncluded: number;
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
  startBasis: "explicit" | "default-lookback" | "empty-repository";
  endBasis: "explicit" | "latest-session" | "head-commit" | "unix-epoch";
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
    turnCount: number;
    sessionCount: number;
  }>;
  totalToolCalls: number;
  totalTurns: number;
  tokenUsage: TokenUsage | null;
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
  sessionFormats: Array<"codex-jsonl" | "claude-code-jsonl">;
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
