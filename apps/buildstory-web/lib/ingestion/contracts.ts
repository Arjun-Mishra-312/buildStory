import type { ProjectSnapshot } from "@/lib/project-snapshot";
import type { PROJECT_SNAPSHOT_SCHEMA_VERSION, ScannerProjectSnapshot, NarrativeMode, ReportStoryPackV2 } from "./scanner-project-snapshot";

export type UploadSessionStatus =
  | "awaiting_scanner"
  | "scanner_authorized"
  | "snapshot_received"
  | "queued"
  | "generating"
  | "report_ready"
  | "expired"
  | "failed";

export type ReportStatus = "queued" | "generating" | "ready" | "failed";
export type PublicationStatus =
  | "not_published"
  | "draft_changes"
  | "published";

export type PublicFieldKey =
  | "tagline"
  | "description"
  | "timeWindow"
  | "sessionSummary"
  | "milestones"
  | "modelMix"
  | "costEstimate"
  | "toolUsage"
  | "gitAggregates"
  | "redactionSummary"
  | "archetype"
  | "profileScores"
  | "workPatterns"
  | "narrative"
  | "storyBuildArc"
  | "storyMoments"
  | "storyTurningPoint"
  | "storyDecisions"
  | "storyLearnings"
  | "storyTraits"
  | "storyGrowthEdge"
  | "decisionPatterns"
  | "standoutTraits"
  | "growthEdge";

export type BuilderProfileDimension = "planning" | "steering" | "execution" | "engineering" | "productInstinct";

export type UserRecord = {
  id: string;
  authSubject: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  role: "member" | "moderator" | "admin";
};

export type ProjectRecord = {
  id: string;
  ownerUserId: string;
  slug: string;
  name: string;
  repositoryFingerprint: string;
};

export type NarrativeStatus = "queued" | "generating" | "ready" | "failed";

export type NarrativeObservability = {
  providerCounts: Record<string, number>;
  promptVersion: string;
  schemaVersion: string;
  generationLatencyMs: number;
  inputTokens: number;
  outputTokens: number;
  costMicroUsd: number;
  invalidReferenceCount: number;
  fallbackCount: number;
};

export type NarrativeRecord = {
  id: string;
  reportId: string;
  mode: "cloud" | "local";
  provider: string;
  model: string;
  status: NarrativeStatus;
  sections: {
    headline: string;
    narrative: string;
    turningPoint: string;
    learnings: string[];
    decisionPatterns?: string[];
    standoutTraits?: string[];
    growthEdge?: string;
  } | null;
  storyPack?: ReportStoryPackV2 | null;
  observability?: NarrativeObservability | null;
  fallbacksUsed?: string[];
  costMicroUsd: number;
};

/** Facts about one scan, used to create or refresh a project's rollup fields. */
export type ProjectScanStats = {
  displayName: string;
  fingerprintBasis: string;
  scannedAt: string;
  sessionCount: number;
  commitCount: number;
  activeDays: number;
};

export type DeviceAuthorization = {
  sessionId: string;
  userCode: string;
  apiBaseUrl: string;
  connectEndpoint: string;
  claimEndpoint: string;
  expiresAt: string;
  commandHint: string;
  scanUploadCommandHint: string;
};

export type UploadSessionView = {
  id: string;
  creatorId: string;
  projectLabel: string;
  narrativeModel: string | null;
  narrativeMode: NarrativeMode;
  status: UploadSessionStatus;
  createdAt: string;
  expiresAt: string;
  scannerAuthorizedAt: string | null;
  snapshotReceivedAt: string | null;
  reportId: string | null;
  statusDetail: string;
};

export type ScannerClaimResponse = {
  sessionId: string;
  connectionId: string;
  uploadGrant: LocalUploadGrant;
  narrative?: { mode: NarrativeMode; model: string | null };
};

export type SnapshotUploadReceipt = {
  sessionId: string;
  receiptId: string;
  scanId: string;
  snapshotDigest: string;
  acceptedAt: string;
  status: "queued";
  statusEndpoint: string;
  reportEndpoint: string | null;
};

export type LocalConnectRequest = {
  protocolVersion: "1.0";
  uploadSessionId: string;
  deviceCode: string;
  client: {
    command: "buildstory";
    version: string;
  };
  capabilities: {
    projectSnapshotSchemaVersions: string[];
    snapshotUpload: boolean;
    narrativeModes?: NarrativeMode[];
  };
};

export type LocalUploadGrant = {
  bearerToken: string;
  snapshotEndpoint: string;
  expiresAt: string;
  schemaVersion: typeof PROJECT_SNAPSHOT_SCHEMA_VERSION;
  maxBytes: number;
};

export type LocalConnectResponse = {
  protocolVersion: "1.0";
  status: "connected";
  uploadSessionId: string;
  connectionId: string;
  uploadGrant: LocalUploadGrant;
  narrative?: { mode: NarrativeMode; model: string | null };
};

export type LocalSnapshotAcceptedResponse = {
  protocolVersion: "1.0";
  status: "accepted";
  receipt: {
    receiptId: string;
    scanId: string;
    snapshotDigest: string;
    acceptedAt: string;
  };
  statusUrl: string;
  reportUrl: string | null;
};

export type LocalReportSummary = {
  summary: string;
  sessionCount: number;
  commitCount: number;
  milestoneCount: number;
  warningCount: number;
};

export type GeneratedReport = {
  id: string;
  creatorId: string;
  projectId: string;
  uploadSessionId: string;
  status: ReportStatus;
  createdAt: string;
  readyAt: string | null;
  sourceSnapshot: ScannerProjectSnapshot | null;
  snapshot: ProjectSnapshot;
  selectedPublicFields: PublicFieldKey[];
  editorial: {
    tagline: string;
    description: string;
    reflection: string;
  };
  publication: {
    status: PublicationStatus;
    slug: string;
    publishedAt: string | null;
    publicUrl: string | null;
  };
  /** Null when the source scan never opted into the narrative-evidence flow - a normal state, not an error. */
  narrative: NarrativeRecord | null;
};

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    details?: string[];
  };
};

export type SnapshotValidationResult =
  | { ok: true; snapshot: ScannerProjectSnapshot }
  | { ok: false; errors: string[] };
