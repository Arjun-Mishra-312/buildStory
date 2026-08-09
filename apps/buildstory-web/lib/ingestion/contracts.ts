import type { ProjectSnapshot } from "@/lib/project-snapshot";
import type { AnalysisTier, NarrativeProvider, PROJECT_SNAPSHOT_SCHEMA_VERSION, ScannerProjectSnapshot, NarrativeMode, ReportStoryPack } from "./scanner-project-snapshot";
import type { StoryBackgroundId } from "@/lib/background-options";
import type { ChapterDelta } from "@/lib/story/chapter-delta";
import type { BuilderRole } from "@/lib/identity/builder-roles";

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

export const STORY_CATEGORIES = [
  "web-apps",
  "developer-tools",
  "saas",
  "ai-ml",
  "design-tools",
  "automation",
  "data-analytics",
  "productivity",
  "games",
  "other",
] as const;

export type StoryCategory = (typeof STORY_CATEGORIES)[number];

export function isStoryCategory(value: unknown): value is StoryCategory {
  return typeof value === "string" && (STORY_CATEGORIES as readonly string[]).includes(value);
}

export const PUBLIC_FIELD_KEYS = [
  "tagline",
  "description",
  "timeWindow",
  "sessionSummary",
  "milestones",
  "modelMix",
  "costEstimate",
  "toolUsage",
  "gitAggregates",
  "redactionSummary",
  "archetype",
  "profileScores",
  "workPatterns",
  "narrative",
  "storyBuildArc",
  "storyMoments",
  "storyTurningPoint",
  "storyDecisions",
  "storyLearnings",
  "storyTraits",
  "storyGrowthEdge",
  "deepExecutiveSynthesis",
  "deepDecisionReview",
  "deepFrictionAndRecovery",
  "deepEngineeringPatterns",
  "deepRisksAndEvidenceGaps",
  "deepNextBuildActions",
  "deepChapterChanges",
  "decisionPatterns",
  "standoutTraits",
  "growthEdge",
  "artifactLinks",
  "artifactMedia",
] as const;

export type PublicFieldKey = (typeof PUBLIC_FIELD_KEYS)[number];

export type BuilderProfileDimension = "planning" | "steering" | "execution" | "engineering" | "productInstinct";

export type UserRecord = {
  id: string;
  authSubject: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  role: "member" | "moderator" | "admin";
  /** Null until the user spends their one allowed handle change. */
  handleChangedAt: string | null;
  builderRole: BuilderRole | null;
  onboardingCompletedAt: string | null;
  /** The account's real, durable plan - see effectivePlan() for how a launch-wide promotion can grant Pro benefits without changing this. */
  plan: "free" | "pro";
};

export type ProjectRecord = {
  id: string;
  ownerUserId: string;
  slug: string;
  name: string;
  repositoryFingerprint: string;
};

/** One row of a creator's /studio/projects list - a project, not a single scan. */
export type ProjectSummary = {
  id: string;
  slug: string;
  name: string;
  chapterCount: number;
  latestChapterIndex: number | null;
  latestPublicationStatus: PublicationStatus;
  /** The most recently created report for this project - "Continue" / "Review" links target it. */
  latestReportId: string;
  latestReportStatus: ReportStatus;
  lastScanAt: string;
  publicUrl: string | null;
};

/** One report row within a project's history, for the project detail page. */
export type ProjectReportSummary = {
  reportId: string;
  status: ReportStatus;
  chapterIndex: number | null;
  publicationStatus: PublicationStatus;
  createdAt: string;
  publishedAt: string | null;
  editorialTagline: string;
  /** The full (ungated) delta against the previous chapter - safe here since this is a creator-only view, never the public projection. */
  chapterDelta: ChapterDelta | null;
};

export type ProjectDetail = {
  id: string;
  slug: string;
  name: string;
  publicUrl: string | null;
  reports: ProjectReportSummary[];
};

export type NarrativeStatus = "queued" | "generating" | "ready" | "failed";

export type NarrativeObservability = {
  providerCounts: Record<string, number>;
  promptVersion: string;
  schemaVersion: string;
  generationLatencyMs: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedTokens: number;
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
  storyPack?: ReportStoryPack | null;
  analysisTierRequested: AnalysisTier;
  analysisTierDelivered: AnalysisTier | null;
  evidenceScrubbedAt: string | null;
  evidenceReceipt?: {
    excerptCount: number;
    sessionCount: number;
    byteSize: number;
    selectionPolicyVersion: string;
    consentVersion: string;
    scrubbedAt: string;
  } | null;
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
  narrativeProvider: NarrativeProvider | null;
  analysisTier: AnalysisTier;
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
  narrative?: { mode: NarrativeMode; provider: NarrativeProvider | null; model: string | null; analysisTier: AnalysisTier };
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
  narrative?: { mode: NarrativeMode; provider: NarrativeProvider | null; model: string | null; analysisTier: AnalysisTier };
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

export type ReportMediaKind = "cover" | "screenshot";
export type ReportMediaRecord = {
  id: string;
  reportId: string;
  ownerUserId: string;
  r2Key: string;
  contentType: string;
  byteSize: number;
  kind: ReportMediaKind;
  sortOrder: number;
  url: string;
};

/** Per-report cap on uploaded cover/screenshot images, enforced identically by both store backends. */
export const MAX_MEDIA_PER_REPORT = 5;

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
  category: StoryCategory | null;
  storyBackgroundId: StoryBackgroundId;
  /** Creator-supplied links to the actual artifact, gated by the artifactLinks PublicFieldKey when published. */
  artifact: {
    projectUrl: string | null;
    repoUrl: string | null;
    videoUrl: string | null;
  };
  publication: {
    status: PublicationStatus;
    slug: string;
    publishedAt: string | null;
    publicUrl: string | null;
    /** Null until this report is first published; see db/schema.ts's chapterIndex comment. */
    chapterIndex: number | null;
  };
  /** Null when the source scan never opted into the narrative-evidence flow - a normal state, not an error. */
  narrative: NarrativeRecord | null;
  /** Null for a project's first chapter, or before this report has ever been published. Frozen at publish time. */
  chapterDelta: ChapterDelta | null;
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
