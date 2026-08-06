/**
 * Private report/UI projection used after ingestion. The scanner wire contract
 * and strict JSON Schema live under lib/ingestion/scanner-project-snapshot.ts
 * and lib/ingestion/project-snapshot.schema.json.
 */
import type { ReportStoryPackV2, SourceSelection } from "./ingestion/scanner-project-snapshot";
export type SnapshotVisibility = "private" | "unlisted" | "public";

export type ProjectIdentity = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  status: "prototype" | "building" | "shipped";
  visibility: SnapshotVisibility;
  owner: {
    id: string;
    name: string;
    handle: string;
    role: string;
  };
};

export type RepositoryMetadata = {
  provider: "github" | "gitlab" | "local";
  repositoryName: string;
  remotePath: string | null;
  defaultBranch: string;
  primaryLanguage: string;
  languages: Array<{ name: string; percentage: number }>;
  framework: string | null;
  packageManager: string | null;
  /** null when the source provider does not collect a file inventory. */
  fileCount: number | null;
  initialCommitAt: string;
  currentRevision: string;
  isPrivate: boolean;
};

export type SnapshotTimeWindow = {
  startedAt: string;
  endedAt: string;
  activeDays: number;
  timezone: string;
};

export type SessionSummary = {
  id: string;
  startedAt: string;
  endedAt: string;
  durationMinutes: number;
  intent: string;
  outcome: string;
  modelIds: string[];
  toolIds: string[];
  touchedAreas: string[];
};

/** Real, aggregate token accounting for the whole build window (or one model within it). */
export type AggregateTokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
};

/**
 * Estimated $ cost, priced from a static, versioned table of known model
 * families (see @buildstory/scanner's session-pricing.ts). totalMicroUsd is
 * null only when zero models in the window are in that table - tokens are
 * still shown, a price is never guessed.
 */
export type AggregateCost = {
  totalMicroUsd: number | null;
  pricedTokens: number;
  unpricedTokens: number;
  pricingTableVersion: string;
};

export type ToolModelUsage = {
  models: Array<{
    id: string;
    label: string;
    provider: string;
    requests: number;
    /**
     * Exact for Claude Code; a session-level approximation for Codex
     * (attributed to the session's dominant model). Null when this model's
     * sessions predate per-model token attribution or reported no usage.
     */
    tokenUsage: AggregateTokenUsage | null;
    /** Null when `label` isn't in the static pricing table - never a fabricated price. */
    costMicroUsd: number | null;
  }>;
  tools: Array<{
    id: string;
    label: string;
    category: "agent" | "editor" | "terminal" | "automation";
    sessions: number;
  }>;
  /** null when no session in the window reported token usage. */
  tokenUsage: AggregateTokenUsage | null;
  /** null on a report sourced from a scanner older than 1.6.0 - treat the same as "no cost data". */
  cost: AggregateCost | null;
};

export type GitAggregates = {
  commits: number;
  additions: number;
  deletions: number;
  filesTouched: number;
  branches: number;
  contributors: number;
  firstCommitSha: string;
  lastCommitSha: string;
};

export type ProjectMilestone = {
  id: string;
  occurredAt: string;
  title: string;
  description: string;
  kind: "decision" | "breakthrough" | "feedback" | "ship";
  evidenceRefs: string[];
};

export type ReportNarrative = {
  headline: string;
  narrative: string;
  turningPoint: string;
  learnings: string[];
  decisionPatterns: string[];
  standoutTraits: string[];
  growthEdge: string;
  storyPack?: ReportStoryPackV2;
};

export type RedactionSummary = {
  policyVersion: string;
  redactedFiles: number;
  generalizedPaths: number;
  secretMatchesRemoved: number;
  tokensRemoved: number;
  notes: string[];
};

export type ScanProvenance = {
  scannerVersion: string;
  scannedAt: string;
  source: "local-cli" | "desktop-app" | "api";
  machineScope: "repository-only" | "workspace";
  snapshotHash: string;
  consentVersion: string;
};

/**
 * Transport-safe contract emitted by the future local scanner.
 * Dates remain ISO strings so snapshots can cross a JSON boundary unchanged.
 */
export type ProjectSnapshot = {
  schemaVersion: "1.0";
  identity: ProjectIdentity;
  repository: RepositoryMetadata;
  timeWindow: SnapshotTimeWindow;
  sessions: SessionSummary[];
  usage: ToolModelUsage;
  git: GitAggregates;
  milestones: ProjectMilestone[];
  redaction: RedactionSummary;
  provenance: ScanProvenance;
  /** Provider coverage is private creator metadata from the scanner transport. */
  sourceSelection?: SourceSelection;
  builderProfile?: BuilderProfile;
  narrative?: ReportNarrative;
};

/** Swap this source for an upload/API implementation when ingestion lands. */
export interface ProjectSnapshotSource {
  getBySlug(slug: string): Promise<ProjectSnapshot | null>;
}

export function isProjectSnapshot(value: unknown): value is ProjectSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ProjectSnapshot>;
  return (
    candidate.schemaVersion === "1.0" &&
    typeof candidate.identity?.slug === "string" &&
    typeof candidate.repository?.currentRevision === "string" &&
    Array.isArray(candidate.sessions) &&
    Array.isArray(candidate.milestones) &&
    typeof candidate.provenance?.snapshotHash === "string"
  );
}
import type { BuilderProfile } from "./ingestion/profile";
