import type { ProjectSnapshot } from "@/lib/project-snapshot";
import type { AnalysisTier, NarrativeProvider, PROJECT_SNAPSHOT_SCHEMA_VERSION, ScannerProjectSnapshot, NarrativeMode, ReportStoryPack } from "./scanner-project-snapshot";
import type { StoryBackgroundId } from "@/lib/background-options";
import type { ChapterDelta } from "@/lib/story/chapter-delta";
import type { BuilderRole } from "@/lib/identity/builder-roles";
import type { ReportIntelligence } from "@/lib/narrative/v4";

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
  /** Deterministic, computed facts (see lib/ingestion/signals.ts) - the one story-pack section that is never model-written. */
  "storySignals",
  /** Recap overlay and save-cards on the public story. Private recap does not depend on this. */
  "storyRecap",
  "deepOpeningLine",
  "deepSignatureMoves",
  "deepByTheNumbers",
  "deepWhereItGotHard",
  "deepChapterChanges",
  /** The top-ranked public signal, surfaced on the share card / OG image. */
  "signalHeadline",
  "decisionPatterns",
  "standoutTraits",
  "growthEdge",
  "artifactLinks",
  "artifactMedia",
  // Deprecated: renamed or cut in the report-redesign sprint. Kept only so a
  // selectedPublicFields array stored before that change still typechecks
  // and validates - they are no-ops in the publication projection. A
  // creator who wants the equivalent new content public must re-select the
  // renamed key above (e.g. deepOpeningLine).
  /** @deprecated Renamed to deepOpeningLine. */
  "deepExecutiveSynthesis",
  /** @deprecated Cut from generation. */
  "deepDecisionReview",
  /** @deprecated Renamed to deepWhereItGotHard. */
  "deepFrictionAndRecovery",
  /** @deprecated Renamed to deepSignatureMoves. */
  "deepEngineeringPatterns",
  /** @deprecated Cut from generation. */
  "deepRisksAndEvidenceGaps",
  /** @deprecated Cut from generation - advice/recommendations are off-vision for this product. */
  "deepNextBuildActions",
] as const;

export type PublicFieldKey = (typeof PUBLIC_FIELD_KEYS)[number];

/**
 * Default public selection for a first chapter. Keep this in one place so the
 * D1 and memory stores cannot drift — a memory-mode preview that hides recap
 * while production shows it is a publication-boundary bug.
 */
export const DEFAULT_PUBLIC_FIELDS: PublicFieldKey[] = [
  "tagline",
  "description",
  "timeWindow",
  "sessionSummary",
  "milestones",
  "modelMix",
  "costEstimate",
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
  "standoutTraits",
  "storySignals",
  "signalHeadline",
  "storyRecap",
];

/**
 * Fields introduced after reports were already published. Unioned onto a
 * carried-forward chapter selection and onto the one-shot UI port job so an
 * older project is not stuck without recap/signals just because the creator
 * customized the previous chapter before these keys existed.
 */
export const UI_PORT_PUBLIC_FIELDS = ["storySignals", "signalHeadline", "storyRecap"] as const satisfies readonly PublicFieldKey[];

export function withUiPortPublicFields(fields: readonly PublicFieldKey[]): PublicFieldKey[] {
  const selected = new Set<PublicFieldKey>(fields);
  for (const field of UI_PORT_PUBLIC_FIELDS) selected.add(field);
  return PUBLIC_FIELD_KEYS.filter((field) => selected.has(field));
}

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

/**
 * Stripe subscription state for one user. Kept separate from UserRecord,
 * which is read on every request across the app - these fields are only
 * needed on the billing settings surface and in the checkout/portal/webhook
 * routes.
 */
export type BillingProfile = {
  plan: "free" | "pro";
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  /** Mirrors the Stripe subscription status string verbatim (active, trialing, past_due, canceled, ...). Null until a subscription exists. */
  subscriptionStatus: string | null;
  billingInterval: "month" | "year" | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

export type BillingUpdate = Partial<Omit<BillingProfile, "plan">> & { plan?: "free" | "pro" };

/** A monthly-capped Pro perk tracked in buildstory_feature_budgets. */
export type FeatureBudgetName = "rescan" | "highlight";

/** One active spotlight on Explore's additive "Pro Picks" rail - see buildstory_report_highlights. */
export type ActiveHighlight = {
  reportId: string;
  ownerHandle: string;
  ownerDisplayName: string;
  tagline: string;
  publicUrl: string;
  coverUrl: string | null;
  expiresAt: string;
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
  pipelineVersion?: string;
  pipelineMode?: "dark" | "on";
  complexityScore?: number;
  complexityBand?: "compact" | "standard" | "complex";
  reasoningEffort?: "low" | "medium" | "high";
  citationCoverage?: number;
  verificationStatus?: "pass" | "warning" | "fail";
  verificationIssueCount?: number;
};

export type NarrativeRecord = {
  id: string;
  reportId: string;
  mode: "cloud" | "local";
  provider: string;
  model: string;
  status: NarrativeStatus;
  /** Content-free terminal code only; provider response bodies are never retained. */
  failureCode?: string | null;
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
  reportIntelligence?: ReportIntelligence | null;
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
  /** Content-free {stage, issues} diagnostic for a failed generation. `issues` are `path:rule` pairs only - never model output or source IDs. */
  validationFailure?: { stage: "analysis" | "synthesis" | "composition" | "standard"; issues: string[] } | null;
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
  /** Separate from report readiness: Cloud narrative generation continues on its own queue. */
  narrativeStatus: NarrativeStatus | null;
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
