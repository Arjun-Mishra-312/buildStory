import { orbitNotesSnapshot, vibeSocialSnapshot } from "@/lib/mock-projects";
import { publicBuildStoryFromSnapshot, type PublicBuildStoryViewModel } from "@/lib/build-story";
import { baseHandleFrom, baseSlugFrom, candidateHandles, candidateSlugs, isReservedHandle } from "@/lib/identity/handles";
import { normalizeArtifactUrl, type ArtifactLinksUpdate } from "@/lib/ingestion/artifact-links";
import { isLoopbackHostname } from "@/lib/ingestion/local-api";
import { mediaPublicUrl } from "@/lib/media/url";
import { configuredCloudNarrativeModel, configuredCloudNarrativeProvider, generateNarrative, narrativeProviderConfigured, NarrativeProviderError } from "@/lib/narrative/provider";
import { canUseCloudNarrative, effectivePlan } from "@/lib/narrative/entitlement";
import { estimateCostMicroUsd } from "@/lib/narrative/pricing";
import { NARRATIVE_FIELD_LIMITS, NARRATIVE_PROMPT_VERSION } from "@/lib/narrative/schema";
import { sanitizePublicText } from "@/lib/publication/sanitization";
import { computeChapterDelta, publicChapterDelta, type ChapterDelta } from "@/lib/story/chapter-delta";
import { notifyFollowersOfStoryUpdate } from "@/lib/social/store";
import { getTrendingScoreForReport, registerProfile as registerSocialProfileRecord, registerReport as registerSocialReportRecord } from "@/lib/social/mock-store";
import { archetypeFacetKey } from "./profile";
import type { PublicArchetypeCounts } from "@/lib/report/archetype-catalog";
import { hydrateGeneratedReport, planReportUiPort } from "@/lib/report/hydrate-report";
import { DEFAULT_PUBLIC_FIELDS, MAX_MEDIA_PER_REPORT, PUBLIC_FIELD_KEYS, withUiPortPublicFields } from "./contracts";
import { DEFAULT_STORY_BACKGROUND_ID, isStoryBackgroundId } from "@/lib/background-options";
import { builderRoleLabel, isBuilderRole, type BuilderRole } from "@/lib/identity/builder-roles";
import { GUIDE_VERSION, isGuideKey, isGuideState, type GuideKey, type GuideState, type GuidanceRecord } from "@/lib/guidance/contracts";
import { compareExploreRows, decodeExploreCursor, encodeExploreCursor, isAfterExploreCursor } from "./explore-cursor";
import type {
  ActiveHighlight,
  BillingProfile,
  BillingUpdate,
  CliPairingPreview,
  DeviceAuthorization,
  FeatureBudgetName,
  GeneratedReport,
  LocalConnectResponse,
  LocalPairStartResponse,
  LocalReportSummary,
  NarrativeRecord,
  NarrativeStatus,
  ProjectDetail,
  ProjectRecord,
  ProjectScanStats,
  ProjectSummary,
  PublicFieldKey,
  ReportMediaKind,
  ReportMediaRecord,
  ScannerClaimResponse,
  SnapshotUploadReceipt,
  UploadSessionStatus,
  UploadSessionView,
  UserRecord,
} from "./contracts";
import { reportSnapshotFromScanner } from "./report-adapter";
import type { ScannerProjectSnapshot } from "./scanner-project-snapshot";
import { PROJECT_SNAPSHOT_SCHEMA_VERSION } from "./scanner-project-snapshot";
import {
  MAX_SNAPSHOT_BYTES,
  validateProjectSnapshot,
} from "./validation";

type StoredUploadSession = UploadSessionView & {
  ownerUserId: string | null;
  /** Set when this session was started from an existing project's "Scan for updates" flow. See acceptSnapshot's fingerprint check. */
  targetProjectId: string | null;
  deviceCodeHash: string;
  deviceCodeAttempts: number;
  deviceCodeClaimedAt: string | null;
  connectionId: string | null;
  uploadTokenHash: string | null;
  uploadTokenExpiresAt: string | null;
  uploadTokenConsumedAt: string | null;
  uploadReceiptId: string | null;
  snapshotDigest: string | null;
  snapshot: ScannerProjectSnapshot | null;
  queuedAt: string | null;
};

type StoredUser = UserRecord & {
  email: string;
  handleLower: string;
  bio: string | null;
  status: "active" | "suspended";
  handleChangedAt: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  subscriptionStatus?: string | null;
  billingInterval?: "month" | "year" | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
};

type StoredProject = ProjectRecord & {
  fingerprintBasis: string;
  storyCount: number;
  latestSessionCount: number;
  latestCommitCount: number;
  latestActiveDays: number;
  verifiedRepoAt: string | null;
};

/** Keyed by reportId - a 1:1 relationship, same as the real store's unique index on report_id. */
type StoredNarrative = {
  id: string;
  reportId: string;
  ownerUserId: string;
  mode: "cloud" | "local";
  provider: string;
  model: string;
  status: NarrativeStatus;
  sections: NarrativeRecord["sections"];
  storyPack: NarrativeRecord["storyPack"];
  reportIntelligence?: NarrativeRecord["reportIntelligence"];
  analysisTierRequested: NarrativeRecord["analysisTierRequested"];
  analysisTierDelivered: NarrativeRecord["analysisTierDelivered"];
  evidenceScrubbedAt: string | null;
  observability: NarrativeRecord["observability"];
  fallbacksUsed: string[];
  inputTokens: number;
  outputTokens: number;
  costMicroUsd: number;
  attempts: number;
};

function narrativeConfig(mode: UploadSessionView["narrativeMode"], provider: UploadSessionView["narrativeProvider"] = null, pro = true): Pick<UploadSessionView, "narrativeProvider" | "analysisTier"> {
  if (mode === "local") return { narrativeProvider: "ollama", analysisTier: "standard" };
  if (mode === "byok") return { narrativeProvider: provider === "openai" ? "openai" : "openrouter", analysisTier: pro ? "deep" : "standard" };
  if (mode === "cloud") return { narrativeProvider: configuredCloudNarrativeProvider(), analysisTier: pro ? "deep" : "standard" };
  return { narrativeProvider: null, analysisTier: "standard" };
}

type StoredBudget = {
  spentMicroUsd: number;
  capMicroUsd: number;
};

type StoredIdentity = {
  id: string;
  userId: string;
  provider: string;
  subject: string;
  email: string;
  createdAt: string;
};

type StoredHighlight = {
  id: string;
  reportId: string;
  ownerUserId: string;
  createdAt: string;
  expiresAt: string;
};

type StoredPairing = {
  id: string;
  userCode: string;
  userCodeHash: string;
  projectLabel: string;
  narrativeMode: "local" | "byok" | "off";
  createdAt: string;
  expiresAt: string;
  approvedAt: string | null;
  consumedAt: string | null;
  grant: LocalConnectResponse | null;
};

type MockStore = {
  sessions: Map<string, StoredUploadSession>;
  reports: Map<string, GeneratedReport>;
  users: Map<string, StoredUser>;
  projects: Map<string, StoredProject>;
  narratives: Map<string, StoredNarrative>;
  llmBudgets: Map<string, StoredBudget>;
  reportMedia: Map<string, ReportMediaRecord>;
  /** Keyed by `${provider}:${subject}`. */
  identities: Map<string, StoredIdentity>;
  publicStoryIndex: Map<string, { story: PublicBuildStoryViewModel & { chapterDelta: ChapterDelta | null }; category: string; searchText: string; hasLiveDemo: boolean; updatedAt: string }>;
  guidance: Map<string, GuidanceRecord>;
  /** Keyed by `${userId}:${periodKey}:${feature}`. */
  featureBudgets: Map<string, number>;
  reportHighlights: Map<string, StoredHighlight>;
  pairings: Map<string, StoredPairing>;
};

type StoreGlobal = typeof globalThis & {
  __buildstoryMockIngestion?: MockStore;
};

const storeGlobal = globalThis as StoreGlobal;

function createSeedStore(): MockStore {
  const now = new Date().toISOString();
  const reportId = "rpt_orbit_notes_ready";
  const sessionId = "upl_orbit_notes_seed";
  const creatorId = "dev:mina-park";
  const userId = "usr_mina_park_seed";
  const projectId = orbitNotesSnapshot.identity.id;
  const seedNarrative: StoredNarrative & NarrativeRecord = {
    id: "nar_orbit_notes_seed",
    reportId,
    ownerUserId: userId,
    mode: "cloud",
    provider: "openai",
    model: "gpt-5.4",
    status: "ready",
    sections: {
      headline: orbitNotesSnapshot.narrative.headline,
      narrative: orbitNotesSnapshot.narrative.narrative,
      turningPoint: orbitNotesSnapshot.narrative.turningPoint,
      learnings: orbitNotesSnapshot.narrative.learnings,
      decisionPatterns: orbitNotesSnapshot.narrative.decisionPatterns,
      standoutTraits: orbitNotesSnapshot.narrative.standoutTraits,
      growthEdge: orbitNotesSnapshot.narrative.growthEdge,
    },
    storyPack: orbitNotesSnapshot.narrative.storyPack,
    reportIntelligence: orbitNotesSnapshot.narrative.reportIntelligence,
    analysisTierRequested: "deep",
    analysisTierDelivered: "deep",
    evidenceScrubbedAt: orbitNotesSnapshot.provenance.scannedAt,
    evidenceReceipt: {
      excerptCount: 9,
      sessionCount: 7,
      byteSize: 6842,
      selectionPolicyVersion: "narrative-selection-v1",
      consentVersion: orbitNotesSnapshot.provenance.consentVersion,
      scrubbedAt: orbitNotesSnapshot.provenance.scannedAt,
    },
    observability: {
      providerCounts: { codex: 5, cursor: 1, "claude-code": 1 }, promptVersion: NARRATIVE_PROMPT_VERSION, schemaVersion: "1.7.0", generationLatencyMs: 18420,
      inputTokens: 11840, outputTokens: 2940, reasoningTokens: 910, cachedTokens: 3640, costMicroUsd: 14820, invalidReferenceCount: 0, fallbackCount: 0,
      pipelineVersion: "4.0.0", pipelineMode: "on", complexityScore: 72, complexityBand: "complex", reasoningEffort: "high", citationCoverage: 100, verificationStatus: "pass", verificationIssueCount: 0,
    },
    fallbacksUsed: [],
    inputTokens: 11840,
    outputTokens: 2940,
    costMicroUsd: 14820,
    attempts: 1,
  };
  const user: StoredUser = {
    id: userId,
    authSubject: creatorId,
    email: "dev@buildstory.local",
    handle: "minabuilds",
    handleLower: "minabuilds",
    displayName: "Mina Park",
    avatarUrl: null,
    bio: "Independent product engineer",
    builderRole: "independent-builder",
    role: "member",
    status: "active",
    handleChangedAt: null,
    onboardingCompletedAt: now,
    // Pro, not free: this seed identity doubles as the BUILDSTORY_DEV_AUTH_BYPASS
    // session (see auth.ts) and is reused across many unrelated test files that
    // rescan/re-upload against it repeatedly - a free-tier cap on it would make
    // those tests (and local dev under the bypass) trip a limit they aren't
    // testing. Plan-specific behavior (free vs pro) has its own dedicated
    // fixtures via ensureUser() elsewhere; this seed account isn't one of them.
    plan: "pro",
  };
  const project: StoredProject = {
    id: projectId,
    ownerUserId: userId,
    slug: orbitNotesSnapshot.identity.slug,
    name: orbitNotesSnapshot.identity.name,
    repositoryFingerprint: orbitNotesSnapshot.provenance.snapshotHash,
    fingerprintBasis: "local-path",
    storyCount: 1,
    latestSessionCount: orbitNotesSnapshot.sessions.length,
    latestCommitCount: orbitNotesSnapshot.git.commits,
    latestActiveDays: orbitNotesSnapshot.timeWindow.activeDays,
    verifiedRepoAt: null,
  };
  // Orbit Notes is the visual report showcase. Model a compact first chapter so
  // the seeded current report can demonstrate the comparison press without
  // adding a second mutable fixture report to the store.
  const previousOrbitChapter = structuredClone(orbitNotesSnapshot);
  previousOrbitChapter.timeWindow.activeDays = 8;
  previousOrbitChapter.sessions = previousOrbitChapter.sessions.slice(0, 4);
  previousOrbitChapter.git.commits = 42;
  previousOrbitChapter.git.additions = 9_860;
  previousOrbitChapter.git.deletions = 3_104;
  previousOrbitChapter.git.filesTouched = 91;
  previousOrbitChapter.git.branches = 5;
  previousOrbitChapter.milestones = previousOrbitChapter.milestones.slice(0, 2);
  previousOrbitChapter.usage.tokenUsage.inputTokens = 438_000;
  previousOrbitChapter.usage.tokenUsage.outputTokens = 88_000;
  previousOrbitChapter.usage.tokenUsage.totalTokens = 526_000;
  previousOrbitChapter.usage.cost.totalMicroUsd = 1_694_000;
  previousOrbitChapter.usage.cost.pricedTokens = 526_000;
  previousOrbitChapter.usage.models[0]!.requests = 112;
  previousOrbitChapter.usage.models[1]!.requests = 28;
  previousOrbitChapter.usage.tools = previousOrbitChapter.usage.tools.filter((tool) => tool.id !== "github-actions");
  const seedChapterDelta = computeChapterDelta(previousOrbitChapter, orbitNotesSnapshot, 1, 2);
  const report: GeneratedReport = {
    id: reportId,
    creatorId,
    projectId,
    uploadSessionId: sessionId,
    status: "ready",
    createdAt: orbitNotesSnapshot.provenance.scannedAt,
    readyAt: now,
    sourceSnapshot: null,
    snapshot: orbitNotesSnapshot,
    selectedPublicFields: [
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
      "storySignals",
      "signalHeadline",
      "deepOpeningLine",
      "deepSignatureMoves",
      "deepByTheNumbers",
      "deepWhereItGotHard",
      "deepChapterChanges",
      "decisionPatterns",
      "standoutTraits",
      "growthEdge",
      "artifactLinks",
      "storyRecap",
    ],
    editorial: {
      tagline: orbitNotesSnapshot.identity.tagline,
      description: orbitNotesSnapshot.identity.description,
      reflection:
        "AI made it cheap to explore three architectures. Tester feedback made it obvious which one deserved to survive.",
    },
    category: "productivity",
    storyBackgroundId: DEFAULT_STORY_BACKGROUND_ID,
    artifact: {
      projectUrl: "https://example.com/orbit-notes",
      repoUrl: "https://github.com/example/orbit-notes",
      videoUrl: null,
    },
    publication: {
      status: "published",
      slug: orbitNotesSnapshot.identity.slug,
      publishedAt: orbitNotesSnapshot.timeWindow.endedAt,
      publicUrl: `/p/${orbitNotesSnapshot.identity.slug}`,
      chapterIndex: 2,
    },
    narrative: seedNarrative,
    chapterDelta: seedChapterDelta,
  };
  const session: StoredUploadSession = {
    id: sessionId,
    creatorId,
    ownerUserId: userId,
    targetProjectId: null,
    projectLabel: orbitNotesSnapshot.identity.name,
    narrativeModel: null,
    narrativeMode: "cloud",
    ...narrativeConfig("cloud"),
    status: "report_ready",
    createdAt: orbitNotesSnapshot.provenance.scannedAt,
    expiresAt: orbitNotesSnapshot.provenance.scannedAt,
    scannerAuthorizedAt: orbitNotesSnapshot.provenance.scannedAt,
    snapshotReceivedAt: orbitNotesSnapshot.provenance.scannedAt,
    reportId,
    statusDetail: "Private report ready for review.",
    narrativeStatus: null,
    deviceCodeHash: "used-seed",
    deviceCodeAttempts: 0,
    deviceCodeClaimedAt: orbitNotesSnapshot.provenance.scannedAt,
    connectionId: "conn_orbit_notes_seed",
    uploadTokenHash: null,
    uploadTokenExpiresAt: null,
    uploadTokenConsumedAt: orbitNotesSnapshot.provenance.scannedAt,
    uploadReceiptId: "rcpt_orbit_notes_seed",
    snapshotDigest: orbitNotesSnapshot.provenance.snapshotHash,
    snapshot: null,
    queuedAt: orbitNotesSnapshot.provenance.scannedAt,
  };
  const publicStory = publicBuildStoryFromSnapshot(report.snapshot, report.selectedPublicFields, { tagline: report.editorial.tagline, description: report.editorial.description, reflection: report.editorial.reflection, category: report.category }, report.artifact, { storyBackgroundId: report.storyBackgroundId });
  const vibeReportId = "rpt_vibe_social_showcase";
  const vibeSessionId = "upl_vibe_social_showcase";
  const vibeCreatorId = "dev:arjun-mishra";
  const vibeUserId = "usr_arjun_mishra_seed";
  const vibeNarrative: StoredNarrative & NarrativeRecord = {
    id: "nar_vibe_social_showcase",
    reportId: vibeReportId,
    ownerUserId: vibeUserId,
    mode: "cloud",
    provider: "openai",
    model: "gpt-5.4",
    status: "ready",
    sections: {
      headline: vibeSocialSnapshot.narrative!.headline,
      narrative: vibeSocialSnapshot.narrative!.narrative,
      turningPoint: vibeSocialSnapshot.narrative!.turningPoint,
      learnings: vibeSocialSnapshot.narrative!.learnings,
      decisionPatterns: vibeSocialSnapshot.narrative!.decisionPatterns,
      standoutTraits: vibeSocialSnapshot.narrative!.standoutTraits,
      growthEdge: vibeSocialSnapshot.narrative!.growthEdge,
    },
    storyPack: vibeSocialSnapshot.narrative!.storyPack,
    analysisTierRequested: "deep",
    analysisTierDelivered: "deep",
    evidenceScrubbedAt: vibeSocialSnapshot.provenance.scannedAt,
    evidenceReceipt: { excerptCount: 240, sessionCount: 51, byteSize: 72877, selectionPolicyVersion: "narrative-selection-v1", consentVersion: vibeSocialSnapshot.provenance.consentVersion, scrubbedAt: vibeSocialSnapshot.provenance.scannedAt },
    observability: null,
    fallbacksUsed: [],
    inputTokens: 118400,
    outputTokens: 22140,
    costMicroUsd: 91240,
    attempts: 1,
  };
  const vibeUser: StoredUser = {
    id: vibeUserId,
    authSubject: vibeCreatorId,
    email: "arjun@example.com",
    handle: "arjun-mishra",
    handleLower: "arjun-mishra",
    displayName: "Arjun Mishra",
    avatarUrl: null,
    bio: "Independent builder",
    builderRole: "independent-builder",
    role: "member",
    status: "active",
    handleChangedAt: null,
    onboardingCompletedAt: now,
    plan: "pro",
  };
  const vibeProject: StoredProject = {
    id: vibeSocialSnapshot.identity.id,
    ownerUserId: vibeUserId,
    slug: vibeSocialSnapshot.identity.slug,
    name: vibeSocialSnapshot.identity.name,
    repositoryFingerprint: vibeSocialSnapshot.provenance.snapshotHash,
    fingerprintBasis: "local-path",
    storyCount: 3,
    latestSessionCount: vibeSocialSnapshot.sessions.length,
    latestCommitCount: vibeSocialSnapshot.git.commits,
    latestActiveDays: vibeSocialSnapshot.timeWindow.activeDays,
    verifiedRepoAt: null,
  };
  const previousVibeChapter = structuredClone(vibeSocialSnapshot);
  previousVibeChapter.timeWindow.activeDays = 6;
  previousVibeChapter.sessions = previousVibeChapter.sessions.slice(0, 36);
  previousVibeChapter.git.commits = 57;
  previousVibeChapter.git.additions = 115_182;
  previousVibeChapter.git.deletions = 20_091;
  previousVibeChapter.usage.cost!.totalMicroUsd = 1_098_630_000;
  const vibeChapterDelta = computeChapterDelta(previousVibeChapter, vibeSocialSnapshot, 2, 3);
  const vibeReport: GeneratedReport = {
    id: vibeReportId,
    creatorId: vibeCreatorId,
    projectId: vibeSocialSnapshot.identity.id,
    uploadSessionId: vibeSessionId,
    status: "ready",
    createdAt: vibeSocialSnapshot.provenance.scannedAt,
    readyAt: now,
    sourceSnapshot: null,
    snapshot: vibeSocialSnapshot,
    selectedPublicFields: [...report.selectedPublicFields],
    editorial: { tagline: vibeSocialSnapshot.identity.tagline, description: vibeSocialSnapshot.identity.description, reflection: "The release became credible when privacy review stopped being copy and became a shared product boundary." },
    category: "web-apps",
    storyBackgroundId: DEFAULT_STORY_BACKGROUND_ID,
    artifact: { projectUrl: null, repoUrl: null, videoUrl: null },
    publication: { status: "published", slug: "vibe-social", publishedAt: vibeSocialSnapshot.timeWindow.endedAt, publicUrl: "/u/arjun-mishra/vibe-social", chapterIndex: 3 },
    narrative: vibeNarrative,
    chapterDelta: vibeChapterDelta,
  };
  const vibeUploadSession: StoredUploadSession = {
    ...session,
    id: vibeSessionId,
    creatorId: vibeCreatorId,
    ownerUserId: vibeUserId,
    projectLabel: vibeSocialSnapshot.identity.name,
    reportId: vibeReportId,
    connectionId: "conn_vibe_social_showcase",
    uploadReceiptId: "rcpt_vibe_social_showcase",
    snapshotDigest: vibeSocialSnapshot.provenance.snapshotHash,
  };
  const vibePublicStory = publicBuildStoryFromSnapshot(vibeReport.snapshot, vibeReport.selectedPublicFields, { tagline: vibeReport.editorial.tagline, description: vibeReport.editorial.description, reflection: vibeReport.editorial.reflection, category: vibeReport.category }, vibeReport.artifact, { storyBackgroundId: vibeReport.storyBackgroundId });
  return {
    sessions: new Map([[sessionId, session], [vibeSessionId, vibeUploadSession]]),
    reports: new Map([[reportId, report], [vibeReportId, vibeReport]]),
    users: new Map([[userId, user], [vibeUserId, vibeUser]]),
    projects: new Map([[projectId, project], [vibeSocialSnapshot.identity.id, vibeProject]]),
    narratives: new Map([[reportId, seedNarrative], [vibeReportId, vibeNarrative]]),
    llmBudgets: new Map(),
    reportMedia: new Map(),
    publicStoryIndex: new Map([[reportId, {
      story: { ...publicStory, chapterDelta: publicChapterDelta(seedChapterDelta, report.selectedPublicFields) },
      category: publicStory.category,
      searchText: [publicStory.name, publicStory.tagline, publicStory.description, publicStory.owner.name, publicStory.owner.handle, publicStory.category, ...publicStory.stack, ...publicStory.tools.map((tool) => tool.label), ...publicStory.models.flatMap((model) => [model.id, model.label])].join(" ").slice(0, 12_000),
      hasLiveDemo: Boolean(publicStory.artifactLinks.projectUrl),
      updatedAt: now,
    }], [vibeReportId, {
      story: { ...vibePublicStory, chapterDelta: publicChapterDelta(vibeChapterDelta, vibeReport.selectedPublicFields) },
      category: vibePublicStory.category,
      searchText: [vibePublicStory.name, vibePublicStory.tagline, vibePublicStory.description, vibePublicStory.owner.name, vibePublicStory.owner.handle, vibePublicStory.category, ...vibePublicStory.stack, ...vibePublicStory.tools.map((tool) => tool.label), ...vibePublicStory.models.flatMap((model) => [model.id, model.label])].join(" ").slice(0, 12_000),
      hasLiveDemo: false,
      updatedAt: now,
    }]]),
    guidance: new Map(),
    featureBudgets: new Map(),
    reportHighlights: new Map(),
    pairings: new Map(),
    identities: new Map([[identityKey("dev", "mina-park"), {
      id: "idn_mina_park_seed",
      userId,
      provider: "dev",
      subject: "mina-park",
      email: user.email,
      createdAt: now,
    }], [identityKey("dev", "arjun-mishra"), {
      id: "idn_arjun_mishra_seed",
      userId: vibeUserId,
      provider: "dev",
      subject: "arjun-mishra",
      email: vibeUser.email,
      createdAt: now,
    }]]),
  };
}

function identityKey(provider: string, subject: string) {
  return `${provider}:${subject}`;
}

const isFreshStore = !storeGlobal.__buildstoryMockIngestion;
const store =
  storeGlobal.__buildstoryMockIngestion ??
  (storeGlobal.__buildstoryMockIngestion = createSeedStore());

if (isFreshStore) {
  for (const user of store.users.values()) registerSocialProfile(user);
  for (const [reportId, report] of store.reports) {
    registerSocialReport(reportId, userIdForCreator(report.creatorId), report);
  }
}

export class MockIngestionError extends Error {
  readonly isBuildstoryIngestionError = true;

  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: string[],
  ) {
    super(message);
  }
}

function publicOrigin() {
  return (process.env.BUILDSTORY_PUBLIC_ORIGIN ?? "http://localhost:3000").replace(/\/$/, "");
}

function cleanSession(session: StoredUploadSession): UploadSessionView {
  const narrative = session.reportId ? store.narratives.get(session.reportId) : null;
  return {
    id: session.id,
    creatorId: session.creatorId,
    projectLabel: session.projectLabel,
    narrativeModel: session.narrativeModel,
    narrativeMode: session.narrativeMode,
    narrativeProvider: session.narrativeProvider,
    analysisTier: session.analysisTier,
    status: session.status,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    scannerAuthorizedAt: session.scannerAuthorizedAt,
    snapshotReceivedAt: session.snapshotReceivedAt,
    reportId: session.reportId,
    statusDetail: session.statusDetail,
    narrativeStatus: narrative?.status ?? null,
  };
}

function makeId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

/** Keeps the (separately module-scoped) social mock store's shadow user record in sync. */
function registerSocialProfile(user: StoredUser) {
  registerSocialProfileRecord({
    id: user.id,
    handle: user.handle,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    builderRole: user.builderRole,
    role: user.role,
    plan: user.plan,
  });
}

function userIdForCreator(creatorId: string): string | null {
  return Array.from(store.users.values()).find((candidate) => candidate.authSubject === creatorId)?.id ?? null;
}

/**
 * Keeps the (separately module-scoped) social mock store's shadow report record in sync.
 * `story` is only passed at the publish call site, where a freshly computed public
 * view-model is in scope; omit it (undefined) elsewhere to leave a report's previously
 * stored story untouched, or pass `null` explicitly (unpublish) to clear it.
 */
function registerSocialReport(
  reportId: string,
  ownerUserId: string | null,
  report: GeneratedReport,
  story?: PublicBuildStoryViewModel | null,
) {
  registerSocialReportRecord({
    id: reportId,
    ownerUserId,
    projectId: report.projectId,
    publicationStatus: report.publication.status,
    publicationSlug: report.publication.slug,
    editorialTagline: report.editorial.tagline,
    publishedAt: report.publication.publishedAt,
    chapterIndex: report.publication.chapterIndex,
    story,
  });
}

function makeDeviceCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const raw = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

function makeUploadToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const encoded = btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  return `bsu_${encoded}`;
}

async function hashToken(token: string) {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function refreshLifecycle(session: StoredUploadSession) {
  if (!session.queuedAt || !session.reportId) return;
  const elapsed = Date.now() - Date.parse(session.queuedAt);
  const report = store.reports.get(session.reportId);
  if (!report || report.status === "ready" || report.status === "failed") return;
  const configuredDelay = Number(
    process.env.BUILDSTORY_REPORT_READY_DELAY_MS ?? 5_000,
  );
  const readyDelay =
    Number.isFinite(configuredDelay) && configuredDelay >= 0
      ? Math.min(configuredDelay, 60_000)
      : 5_000;
  const generatingDelay = Math.min(1_500, Math.max(0, readyDelay / 3));

  if (elapsed >= readyDelay) {
    session.status = "report_ready";
    session.statusDetail = "Private report ready for review.";
    report.status = "ready";
    report.readyAt = new Date().toISOString();
  } else if (elapsed >= generatingDelay) {
    session.status = "generating";
    session.statusDetail = "Generating the private report and candidate milestones.";
    report.status = "generating";
  } else {
    session.status = "queued";
    session.statusDetail = "Snapshot validated and queued for report generation.";
  }
}

export function ensureUser(session: {
  creatorId: string;
  name: string;
  email: string;
  image: string | null;
}): UserRecord {
  const existing = Array.from(store.users.values()).find(
    (candidate) => candidate.authSubject === session.creatorId,
  );
  if (existing) {
    if (existing.status !== "active") throw new MockIngestionError("account_suspended", "This creator account is suspended.", 403);
    // Display name/avatar are seeded from the provider only at creation - never
    // overwritten here, so a user's own profile edits survive their next sign-in.
    return existing;
  }

  const takenHandles = new Set(Array.from(store.users.values()).map((user) => user.handleLower));
  const base = baseHandleFrom(session.name, session.email);
  for (const candidate of candidateHandles(base)) {
    const handleLower = candidate.toLocaleLowerCase("en-US");
    if (takenHandles.has(handleLower)) continue;
    const user: StoredUser = {
      id: makeId("usr"),
      authSubject: session.creatorId,
      email: session.email,
      handle: candidate,
      handleLower,
      displayName: session.name,
      avatarUrl: session.image,
      bio: null,
      builderRole: null,
      role: "member",
      status: "active",
      handleChangedAt: null,
      onboardingCompletedAt: null,
      plan: "free",
    };
    store.users.set(user.id, user);
    registerSocialProfile(user);
    return user;
  }
  throw new MockIngestionError("handle_generation_failed", "Could not allocate a handle for this account.", 500);
}

export type LinkedIdentity = { userId: string; authSubject: string };

export function findUserByIdentity(provider: string, subject: string): LinkedIdentity | null {
  const identity = store.identities.get(identityKey(provider, subject));
  if (!identity) return null;
  const user = store.users.get(identity.userId);
  if (!user || user.status !== "active") return null;
  return { userId: user.id, authSubject: user.authSubject };
}

export function findUserByVerifiedEmail(email: string): LinkedIdentity | null {
  const lower = email.toLocaleLowerCase("en-US");
  const user = Array.from(store.users.values()).find(
    (candidate) => candidate.status === "active" && candidate.email.toLocaleLowerCase("en-US") === lower,
  );
  return user ? { userId: user.id, authSubject: user.authSubject } : null;
}

export function getIdentityForUser(userId: string, provider: string): { subject: string } | null {
  const identity = Array.from(store.identities.values()).find(
    (candidate) => candidate.userId === userId && candidate.provider === provider,
  );
  return identity ? { subject: identity.subject } : null;
}

export function linkIdentity(userId: string, provider: string, subject: string, email: string): void {
  const key = identityKey(provider, subject);
  if (store.identities.has(key)) return;
  store.identities.set(key, {
    id: makeId("idn"),
    userId,
    provider,
    subject,
    email,
    createdAt: new Date().toISOString(),
  });
}

export function markEmailVerified(userId: string): void {
  void userId;
  // Hygiene only in the real store (buildstory_users.email_verified_at); nothing reads
  // this in the mock store, so there's no field to update here.
}

/** Stripe subscription state for a user, read by the Settings billing section and the checkout/portal routes. */
export function getBillingProfile(userId: string): BillingProfile | null {
  const user = store.users.get(userId);
  if (!user) return null;
  return {
    plan: user.plan === "pro" ? "pro" : "free",
    stripeCustomerId: user.stripeCustomerId ?? null,
    stripeSubscriptionId: user.stripeSubscriptionId ?? null,
    subscriptionStatus: user.subscriptionStatus ?? null,
    billingInterval: user.billingInterval ?? null,
    currentPeriodEnd: user.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: user.cancelAtPeriodEnd ?? false,
  };
}

/** Resolves a Stripe customer id back to the owning user - the webhook's fallback path when an event carries no buildstoryUserId metadata. */
export function findUserIdByStripeCustomerId(stripeCustomerId: string): string | null {
  const user = Array.from(store.users.values()).find((candidate) => candidate.stripeCustomerId === stripeCustomerId);
  return user?.id ?? null;
}

/** Writes Stripe subscription state onto a user row - the only place billing fields are mutated, called from the checkout route and the webhook handler. */
export function applyBillingUpdate(userId: string, update: BillingUpdate): void {
  const user = store.users.get(userId);
  if (!user) throw new MockIngestionError("not_found", "Account not found.", 404);

  if (update.stripeCustomerId !== undefined) user.stripeCustomerId = update.stripeCustomerId;
  if (update.stripeSubscriptionId !== undefined) user.stripeSubscriptionId = update.stripeSubscriptionId;
  if (update.subscriptionStatus !== undefined) user.subscriptionStatus = update.subscriptionStatus;
  if (update.billingInterval !== undefined) user.billingInterval = update.billingInterval;
  if (update.currentPeriodEnd !== undefined) user.currentPeriodEnd = update.currentPeriodEnd;
  if (update.cancelAtPeriodEnd !== undefined) user.cancelAtPeriodEnd = update.cancelAtPeriodEnd;
  if (update.plan !== undefined) user.plan = update.plan;
}

/** Current count for a monthly-capped feature, for the current UTC period. Zero if the user hasn't used it this period. */
export function getFeatureBudgetCount(userId: string, feature: FeatureBudgetName): number {
  return store.featureBudgets.get(`${userId}:${currentBudgetPeriodKey()}:${feature}`) ?? 0;
}

export function incrementFeatureBudget(userId: string, feature: FeatureBudgetName): void {
  const key = `${userId}:${currentBudgetPeriodKey()}:${feature}`;
  store.featureBudgets.set(key, (store.featureBudgets.get(key) ?? 0) + 1);
}

/**
 * Spotlights a report on Explore's additive "Pro Picks" rail for
 * HIGHLIGHT_DURATION_MS - never reorders the real organic ranking. Pro-only,
 * capped at MONTHLY_HIGHLIGHT_CAP_PRO per month.
 */
export function createHighlight(userId: string, reportId: string): void {
  const user = store.users.get(userId);
  if (!user || effectivePlan(user.plan) !== "pro") {
    throw new MockIngestionError("highlight_requires_pro", "Highlighting a story is a Pro benefit.", 403);
  }
  const report = store.reports.get(reportId);
  if (!report || report.creatorId !== user.authSubject || !isPubliclyVisible(report.publication.status)) {
    throw new MockIngestionError("not_found", "Published report not found.", 404);
  }
  const used = getFeatureBudgetCount(userId, "highlight");
  if (used >= MONTHLY_HIGHLIGHT_CAP_PRO) {
    throw new MockIngestionError("highlight_limit_reached", `You've used all ${MONTHLY_HIGHLIGHT_CAP_PRO} highlights for this month.`, 403);
  }
  const now = new Date();
  const id = makeId("hlt");
  store.reportHighlights.set(id, {
    id,
    reportId,
    ownerUserId: userId,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + HIGHLIGHT_DURATION_MS).toISOString(),
  });
  incrementFeatureBudget(userId, "highlight");
}

/** Currently-active highlights for the Pro Picks rail, newest first. Read-time expiry (no cron sweep needed). */
export function getActiveHighlights(limit = 6): ActiveHighlight[] {
  const now = Date.now();
  return Array.from(store.reportHighlights.values())
    .filter((highlight) => Date.parse(highlight.expiresAt) > now)
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .map((highlight): ActiveHighlight | null => {
      const report = store.reports.get(highlight.reportId);
      const owner = store.users.get(highlight.ownerUserId);
      if (!report || !owner || !isPubliclyVisible(report.publication.status) || !report.publication.publicUrl) return null;
      return {
        reportId: highlight.reportId,
        ownerHandle: owner.handle,
        ownerDisplayName: owner.displayName,
        tagline: report.editorial.tagline,
        publicUrl: report.publication.publicUrl,
        // The mock store's explore index does not model cover images separately from report media.
        coverUrl: null,
        expiresAt: highlight.expiresAt,
      };
    })
    .filter((highlight): highlight is ActiveHighlight => highlight !== null)
    .slice(0, limit);
}

const HANDLE_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_BIO_LENGTH = 280;
const MAX_DISPLAY_NAME_LENGTH = 80;

export type ProfileUpdateResult = {
  id: string;
  handle: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  handleChangedAt: string | null;
  builderRole: BuilderRole | null;
  onboardingCompletedAt: string | null;
};

/**
 * Self-service profile edits: bio and display name are always editable;
 * the handle may be changed exactly once (handleChangedAt is null until
 * spent). Google sign-in never touches these fields once the row exists -
 * see ensureUser.
 */
export function updateProfile(
  userId: string,
  update: { bio?: string; displayName?: string; handle?: string; builderRole?: BuilderRole | null },
): ProfileUpdateResult {
  const user = store.users.get(userId);
  if (!user) throw new MockIngestionError("not_found", "Account not found.", 404);

  if (update.bio !== undefined) {
    user.bio = update.bio.trim().slice(0, MAX_BIO_LENGTH) || null;
  }

  if (update.displayName !== undefined) {
    const displayName = update.displayName.trim().slice(0, MAX_DISPLAY_NAME_LENGTH);
    if (!displayName) throw new MockIngestionError("invalid_display_name", "Display name cannot be empty.", 422);
    user.displayName = displayName;
  }

  if (update.builderRole !== undefined) {
    if (update.builderRole !== null && !isBuilderRole(update.builderRole)) {
      throw new MockIngestionError("invalid_builder_role", "Choose one of the available builder roles.", 422);
    }
    user.builderRole = update.builderRole;
  }

  if (update.handle !== undefined && update.handle.trim().toLocaleLowerCase("en-US") !== user.handleLower) {
    if (user.handleChangedAt) {
      throw new MockIngestionError("handle_already_changed", "You've already used your one handle change.", 422);
    }
    const handle = update.handle.trim().toLocaleLowerCase("en-US");
    if (handle.length < 3 || handle.length > 32 || !HANDLE_PATTERN.test(handle)) {
      throw new MockIngestionError(
        "invalid_handle",
        "Handles must be 3-32 characters: lowercase letters, numbers, and single hyphens between them.",
        422,
      );
    }
    if (isReservedHandle(handle)) {
      throw new MockIngestionError("handle_reserved", "That handle is reserved.", 422);
    }
    const taken = Array.from(store.users.values()).some((candidate) => candidate.id !== userId && candidate.handleLower === handle);
    if (taken) throw new MockIngestionError("handle_taken", "That handle is already taken.", 422);
    user.handle = handle;
    user.handleLower = handle;
    user.handleChangedAt = new Date().toISOString();
  }

  registerSocialProfile(user);
  return {
    id: user.id,
    handle: user.handle,
    displayName: user.displayName,
    bio: user.bio,
    avatarUrl: user.avatarUrl,
    handleChangedAt: user.handleChangedAt,
    builderRole: user.builderRole,
    onboardingCompletedAt: user.onboardingCompletedAt,
  };
}

export function getUserRecord(userId: string): UserRecord {
  const user = store.users.get(userId);
  if (!user) throw new MockIngestionError("not_found", "Account not found.", 404);
  return user;
}

export function completeOnboarding(
  userId: string,
  update: { displayName: string; handle: string; bio?: string | null; builderRole?: BuilderRole | null },
): ProfileUpdateResult {
  const user = store.users.get(userId);
  if (!user) throw new MockIngestionError("not_found", "Account not found.", 404);
  const displayName = update.displayName.trim().slice(0, MAX_DISPLAY_NAME_LENGTH);
  if (!displayName) throw new MockIngestionError("invalid_display_name", "Display name cannot be empty.", 422);
  const handle = update.handle.trim().toLocaleLowerCase("en-US");
  if (handle.length < 3 || handle.length > 32 || !HANDLE_PATTERN.test(handle)) {
    throw new MockIngestionError("invalid_handle", "Handles must be 3-32 characters: lowercase letters, numbers, and single hyphens between them.", 422);
  }
  if (isReservedHandle(handle)) throw new MockIngestionError("handle_reserved", "That handle is reserved.", 422);
  if (update.builderRole !== undefined && update.builderRole !== null && !isBuilderRole(update.builderRole)) {
    throw new MockIngestionError("invalid_builder_role", "Choose one of the available builder roles.", 422);
  }
  const taken = Array.from(store.users.values()).some((candidate) => candidate.id !== userId && candidate.handleLower === handle);
  if (taken) throw new MockIngestionError("handle_taken", "That handle is already taken.", 422);

  const incomingBio = update.bio?.trim().slice(0, MAX_BIO_LENGTH) || null;
  const incomingRole = update.builderRole ?? null;
  if (user.onboardingCompletedAt) {
    const same = user.handleLower === handle && user.displayName === displayName && user.bio === incomingBio && user.builderRole === incomingRole;
    if (same) return { id: user.id, handle: user.handle, displayName: user.displayName, bio: user.bio, avatarUrl: user.avatarUrl, handleChangedAt: user.handleChangedAt, builderRole: user.builderRole, onboardingCompletedAt: user.onboardingCompletedAt };
    throw new MockIngestionError("onboarding_already_completed", "Onboarding is already complete. Update your profile from Settings.", 409);
  }
  user.displayName = displayName;
  user.handle = handle;
  user.handleLower = handle;
  user.bio = incomingBio;
  user.builderRole = incomingRole;
  user.onboardingCompletedAt = new Date().toISOString();
  registerSocialProfile(user);
  return { id: user.id, handle: user.handle, displayName: user.displayName, bio: user.bio, avatarUrl: user.avatarUrl, handleChangedAt: user.handleChangedAt, builderRole: user.builderRole, onboardingCompletedAt: user.onboardingCompletedAt };
}

function guidanceKey(userId: string, guideKey: GuideKey, guideVersion: number) {
  return `${userId}:${guideKey}:${guideVersion}`;
}

export function listGuidance(userId: string): GuidanceRecord[] {
  return Array.from(store.guidance.entries())
    .filter(([key]) => key.startsWith(`${userId}:`))
    .map(([, record]) => record);
}

export function setGuidance(userId: string, guideKey: GuideKey, guideVersion: number, state: GuideState): GuidanceRecord {
  if (!isGuideKey(guideKey) || !isGuideState(state) || guideVersion !== GUIDE_VERSION) {
    throw new MockIngestionError("invalid_guidance", "That guide is not available.", 422);
  }
  const record: GuidanceRecord = { guideKey, guideVersion, state, updatedAt: new Date().toISOString() };
  store.guidance.set(guidanceKey(userId, guideKey, guideVersion), record);
  return record;
}

/** isExisting distinguishes a rescan of an owner's existing project from that project's first-ever scan - see acceptSnapshot's rescan-budget check, which only applies to the former. */
function ensureProject(ownerUserId: string, fingerprint: string, fingerprintBasis: string, stats: ProjectScanStats): ProjectRecord & { isExisting: boolean } {
  const existing = Array.from(store.projects.values()).find(
    (candidate) => candidate.ownerUserId === ownerUserId && candidate.repositoryFingerprint === fingerprint,
  );
  if (existing) {
    existing.storyCount += 1;
    existing.latestSessionCount = stats.sessionCount;
    existing.latestCommitCount = stats.commitCount;
    existing.latestActiveDays = stats.activeDays;
    return { ...existing, isExisting: true };
  }

  const takenSlugs = new Set(
    Array.from(store.projects.values())
      .filter((candidate) => candidate.ownerUserId === ownerUserId)
      .map((candidate) => candidate.slug),
  );
  const base = baseSlugFrom(stats.displayName);
  for (const candidate of candidateSlugs(base)) {
    if (takenSlugs.has(candidate)) continue;
    const project: StoredProject = {
      id: makeId("prj"),
      ownerUserId,
      slug: candidate,
      name: stats.displayName,
      repositoryFingerprint: fingerprint,
      fingerprintBasis,
      storyCount: 1,
      latestSessionCount: stats.sessionCount,
      latestCommitCount: stats.commitCount,
      latestActiveDays: stats.activeDays,
      verifiedRepoAt: null,
    };
    store.projects.set(project.id, project);
    return { ...project, isExisting: false };
  }
  throw new MockIngestionError("project_slug_generation_failed", "Could not allocate a project slug for this repository.", 500);
}

const DEFAULT_MONTHLY_LLM_CAP_MICRO_USD = 1_000_000; // $1.00/month/user, subsidized default - mirrors d1-store.ts.
const PRO_MONTHLY_LLM_CAP_MICRO_USD = 5_000_000; // $5.00/month/user - mirrors d1-store.ts; revisit before Pro is a paid tier.
const MAX_STORED_REPORTS_PER_ACCOUNT = 500; // Mirrors d1-store.ts's anti-abuse ceiling.
const MONTHLY_RESCAN_CAP_FREE = 3; // Mirrors d1-store.ts's free-tier rescan cap.
const MONTHLY_HIGHLIGHT_CAP_PRO = 5; // Mirrors d1-store.ts's Pro highlight allowance.
const HIGHLIGHT_DURATION_MS = 24 * 60 * 60 * 1000;

function monthlyLlmCapMicroUsd(ownerUserId: string): number {
  const plan = store.users.get(ownerUserId)?.plan ?? "free";
  return effectivePlan(plan) === "pro" ? PRO_MONTHLY_LLM_CAP_MICRO_USD : DEFAULT_MONTHLY_LLM_CAP_MICRO_USD;
}

function currentBudgetPeriodKey(): string {
  return new Date().toISOString().slice(0, 7); // "YYYY-MM", UTC.
}

function hasNarrativeBudget(ownerUserId: string): boolean {
  const budget = store.llmBudgets.get(`${ownerUserId}:${currentBudgetPeriodKey()}`);
  if (!budget) return true;
  return budget.spentMicroUsd < budget.capMicroUsd;
}

/** The cap is captured once, at first spend of the period - see the matching note in d1-store.ts's recordNarrativeSpend. */
function recordNarrativeSpend(ownerUserId: string, costMicroUsd: number) {
  const key = `${ownerUserId}:${currentBudgetPeriodKey()}`;
  const existing = store.llmBudgets.get(key);
  if (existing) {
    existing.spentMicroUsd += costMicroUsd;
  } else {
    store.llmBudgets.set(key, { spentMicroUsd: costMicroUsd, capMicroUsd: monthlyLlmCapMicroUsd(ownerUserId) });
  }
}

function createNarrativeJob(reportId: string, ownerUserId: string, analysisTierRequested: NarrativeRecord["analysisTierRequested"]) {
  store.narratives.set(reportId, {
    id: makeId("nar"),
    reportId,
    ownerUserId,
    mode: "cloud",
    provider: "",
    model: "",
    status: "queued",
    sections: null,
    storyPack: null,
    analysisTierRequested,
    analysisTierDelivered: "standard",
    evidenceScrubbedAt: null,
    observability: null,
    fallbacksUsed: [],
    inputTokens: 0,
    outputTokens: 0,
    costMicroUsd: 0,
    attempts: 0,
  });
}

/** In-flight guard so two near-simultaneous getReport calls don't both dispatch a real LLM call for the same narrative. */
const narrativeInFlight = new Map<string, Promise<void>>();

/**
 * Never rejects - every failure path is caught internally and folded into
 * narrative.status, so processNarrativeJob's cleanup can rely on this
 * promise always settling to a resolved value.
 */
async function runNarrativeJob(narrative: StoredNarrative, reportId: string): Promise<void> {
  narrative.status = "generating";
  narrative.attempts += 1;
  try {
    if (!canUseCloudNarrative(narrative.ownerUserId)) {
      throw new NarrativeProviderError("llm_not_entitled", "Buildstory Cloud narrative generation is not enabled for this account.");
    }
    if (!narrativeProviderConfigured()) {
      throw new NarrativeProviderError("llm_not_configured", "No narrative provider is configured.");
    }
    if (!hasNarrativeBudget(narrative.ownerUserId)) {
      throw new NarrativeProviderError("llm_budget_exceeded", "Monthly narrative budget has been reached.");
    }
    const report = store.reports.get(reportId);
    if (!report || !report.sourceSnapshot) {
      throw new Error(`Report ${reportId} has no source snapshot for narrative generation.`);
    }
    const result = await generateNarrative(
      report.sourceSnapshot,
      store.sessions.get(report.uploadSessionId)?.narrativeModel,
      { analysisTier: narrative.analysisTierRequested },
    );
    narrative.provider = result.provider;
    narrative.model = result.model;
    narrative.sections = {
      headline: sanitizePublicText(result.sections.headline, NARRATIVE_FIELD_LIMITS.headline).value,
      narrative: sanitizePublicText(result.sections.narrative, NARRATIVE_FIELD_LIMITS.narrative).value,
      turningPoint: sanitizePublicText(result.sections.turningPoint, NARRATIVE_FIELD_LIMITS.turningPoint).value,
      learnings: result.sections.learnings.map(
        (line) => sanitizePublicText(line, NARRATIVE_FIELD_LIMITS.learningItem).value,
      ),
      decisionPatterns: result.sections.decisionPatterns.map(
        (line) => sanitizePublicText(line, NARRATIVE_FIELD_LIMITS.decisionPatternItem).value,
      ),
      standoutTraits: result.sections.standoutTraits.map(
        (line) => sanitizePublicText(line, NARRATIVE_FIELD_LIMITS.standoutTraitItem).value,
      ),
      growthEdge: sanitizePublicText(result.sections.growthEdge, NARRATIVE_FIELD_LIMITS.growthEdge).value,
    };
    narrative.storyPack = result.storyPack;
    narrative.analysisTierDelivered = result.storyPack.version === "3.0.0" ? "deep" : "standard";
    narrative.observability = {
      providerCounts: Object.fromEntries(report.sourceSnapshot?.sourceSelection.providers.map((item) => [item.provider, item.sessionsIncluded]) ?? []),
      promptVersion: NARRATIVE_PROMPT_VERSION,
      schemaVersion: report.sourceSnapshot?.schemaVersion ?? "1.5.0",
      generationLatencyMs: 0,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      reasoningTokens: result.reasoningTokens,
      cachedTokens: result.cachedTokens,
      costMicroUsd: result.actualCostMicroUsd ?? estimateCostMicroUsd(result.model, result.inputTokens, result.outputTokens),
      invalidReferenceCount: result.invalidReferenceCount,
      fallbackCount: result.fallbacksUsed.length,
      pipelineVersion: result.reportMap.version,
      pipelineMode: result.pipelineMode,
      complexityScore: result.reportMap.policy.complexityScore,
      complexityBand: result.reportMap.policy.complexityBand,
      reasoningEffort: result.reportMap.policy.reasoningEffort,
      citationCoverage: result.claimVerification.citationCoverage,
      verificationStatus: result.claimVerification.status,
      verificationIssueCount: result.claimVerification.issues.length,
    };
    narrative.reportIntelligence = {
      reportMap: result.reportMap,
      claimVerification: result.claimVerification,
      qualityComparison: result.qualityComparison,
      decisionAtlas: result.decisionAtlas,
      searchIndex: result.searchIndex,
      patterns: result.patterns,
      outcomeLab: result.outcomeLab,
      constellation: result.constellation,
      pipelineMode: result.pipelineMode,
    };
    narrative.fallbacksUsed = result.fallbacksUsed;
    narrative.inputTokens = result.inputTokens;
    narrative.outputTokens = result.outputTokens;
    narrative.costMicroUsd = result.actualCostMicroUsd ?? estimateCostMicroUsd(result.model, result.inputTokens, result.outputTokens);
    report.snapshot.narrative = narrative.sections
      ? {
          headline: narrative.sections.headline,
          narrative: narrative.sections.narrative,
          turningPoint: narrative.sections.turningPoint,
          learnings: narrative.sections.learnings,
          decisionPatterns: narrative.sections.decisionPatterns ?? [],
          standoutTraits: narrative.sections.standoutTraits ?? [],
          growthEdge: narrative.sections.growthEdge ?? "",
          storyPack: narrative.storyPack ?? undefined,
          reportIntelligence: narrative.reportIntelligence ?? undefined,
        }
      : undefined;
    narrative.status = "ready";
    if (report.sourceSnapshot.narrativeEvidence) {
      delete report.sourceSnapshot.narrativeEvidence;
      narrative.evidenceScrubbedAt = new Date().toISOString();
    }
    recordNarrativeSpend(narrative.ownerUserId, narrative.costMicroUsd);
  } catch {
    narrative.status = narrative.attempts >= 3 ? "failed" : "queued";
    if (narrative.status === "failed") {
      const report = store.reports.get(reportId);
      if (report?.sourceSnapshot?.narrativeEvidence) {
        delete report.sourceSnapshot.narrativeEvidence;
        narrative.evidenceScrubbedAt = new Date().toISOString();
      }
    }
  }
}

async function processNarrativeJob(reportId: string): Promise<void> {
  const narrative = store.narratives.get(reportId);
  if (!narrative || narrative.status === "ready" || narrative.status === "failed") return;
  const existingRun = narrativeInFlight.get(reportId);
  if (existingRun) return existingRun;

  // .finally's callback is always deferred to a microtask, even for an
  // already-settled promise, so this delete is guaranteed to run after the
  // synchronous `narrativeInFlight.set` below - not before it, which is
  // what actually happens if runNarrativeJob's failure path never reaches
  // an await (e.g. the not-configured/budget checks) and the cleanup were
  // attached inside that same function instead of out here.
  const run = runNarrativeJob(narrative, reportId).finally(() => {
    narrativeInFlight.delete(reportId);
  });
  narrativeInFlight.set(reportId, run);
  return run;
}

function narrativeRecordFor(reportId: string): NarrativeRecord | null {
  const narrative = store.narratives.get(reportId);
  if (!narrative) return null;
  return {
    id: narrative.id,
    reportId: narrative.reportId,
    mode: narrative.mode,
    provider: narrative.provider,
    model: narrative.model,
    status: narrative.status,
    failureCode: null,
    sections: narrative.sections,
    storyPack: narrative.storyPack,
    reportIntelligence: narrative.reportIntelligence ?? null,
    analysisTierRequested: narrative.analysisTierRequested,
    analysisTierDelivered: narrative.analysisTierDelivered,
    evidenceScrubbedAt: narrative.evidenceScrubbedAt,
    observability: narrative.observability,
    costMicroUsd: narrative.costMicroUsd,
    fallbacksUsed: narrative.fallbacksUsed,
  };
}

export function listUploadSessions(creatorId: string, limit = 100, cursor?: string): UploadSessionView[] {
  const bounded = Math.min(Math.max(1, Math.trunc(limit)), 100);
  return Array.from(store.sessions.values())
    .filter((session) => session.creatorId === creatorId)
    .filter((session) => !cursor || session.createdAt < cursor)
    .map((session) => {
      refreshLifecycle(session);
      return cleanSession(session);
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, bounded);
}

export async function createUploadSession(
  creatorId: string,
  projectLabel = "New local project",
  apiBaseUrl = "http://localhost:3000/",
  ownerUserId: string | null = null,
  narrativeModel: string | null = null,
  narrativeMode: "local" | "byok" | "cloud" | "off" = "local",
  targetProjectId: string | null = null,
  narrativeProvider: UploadSessionView["narrativeProvider"] = null,
): Promise<{ session: UploadSessionView; deviceAuthorization: DeviceAuthorization }> {
  if (targetProjectId) {
    const project = store.projects.get(targetProjectId);
    if (!project || project.ownerUserId !== ownerUserId) {
      throw new MockIngestionError("not_found", "Project not found.", 404);
    }
  }
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 15 * 60_000);
  const id = makeId("upl");
  const deviceCode = makeDeviceCode();
  const owner = ownerUserId ? store.users.get(ownerUserId) : null;
  const pro = effectivePlan(owner?.plan === "pro" ? "pro" : "free") === "pro";
  // Early, friendly check before a device-code session is even created - acceptSnapshot's
  // ensureProject call is the authoritative enforcement point, since targetProjectId here
  // is only a client-side hint, not the real project match.
  if (targetProjectId && ownerUserId && !pro && getFeatureBudgetCount(ownerUserId, "rescan") >= MONTHLY_RESCAN_CAP_FREE) {
    throw new MockIngestionError(
      "rescan_limit_reached",
      `Free accounts get ${MONTHLY_RESCAN_CAP_FREE} project updates a month. Upgrade to Pro for unlimited updates.`,
      403,
    );
  }
  const session: StoredUploadSession = {
    id,
    creatorId,
    ownerUserId,
    targetProjectId,
    projectLabel: projectLabel.trim().slice(0, 120) || "New local project",
    narrativeModel,
    narrativeMode,
    ...narrativeConfig(narrativeMode, narrativeProvider, pro),
    status: "awaiting_scanner",
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    scannerAuthorizedAt: null,
    snapshotReceivedAt: null,
    reportId: null,
    statusDetail: "Waiting for a scanner to claim the one-time connection code.",
    narrativeStatus: null,
    deviceCodeHash: await hashToken(deviceCode),
    deviceCodeAttempts: 0,
    deviceCodeClaimedAt: null,
    connectionId: null,
    uploadTokenHash: null,
    uploadTokenExpiresAt: null,
    uploadTokenConsumedAt: null,
    uploadReceiptId: null,
    snapshotDigest: null,
    snapshot: null,
    queuedAt: null,
  };
  store.sessions.set(id, session);
  const normalizedApiBaseUrl = `${apiBaseUrl.replace(/\/$/, "")}/`;
  const apiBaseHostname = new URL(normalizedApiBaseUrl).hostname;
  const allowHostFlag = isLoopbackHostname(apiBaseHostname) ? "" : ` --allow-host "${apiBaseHostname}"`;
  const commandHint = `buildstory-scan connect "${id}" --code "${deviceCode}" --api-base-url "${normalizedApiBaseUrl}"${allowHostFlag}`;
  return {
    session: cleanSession(session),
    deviceAuthorization: {
      sessionId: id,
      userCode: deviceCode,
      apiBaseUrl: normalizedApiBaseUrl,
      connectEndpoint: `${normalizedApiBaseUrl}api/v1/cli/connect`,
      claimEndpoint: `/api/scanner/upload-sessions/${id}/claim`,
      expiresAt: session.expiresAt,
      commandHint,
      scanUploadCommandHint:
        "buildstory-scan scan-upload --repo . --consent local-scan --upload-consent local-dashboard",
    },
  };
}

export function getUploadSession(
  creatorId: string,
  sessionId: string,
): UploadSessionView {
  const session = store.sessions.get(sessionId);
  if (!session || session.creatorId !== creatorId) {
    throw new MockIngestionError("not_found", "Upload session not found.", 404);
  }
  refreshLifecycle(session);
  return cleanSession(session);
}

export async function claimUploadSession(
  sessionId: string,
  userCode: string,
  narrativeModes?: Array<"local" | "byok" | "cloud" | "off">,
): Promise<ScannerClaimResponse> {
  const session = store.sessions.get(sessionId);
  const codeHash = await hashToken(userCode.trim().toUpperCase());
  if (!session || session.deviceCodeAttempts >= 5 || session.deviceCodeHash !== codeHash) {
    if (session && !session.deviceCodeClaimedAt && session.deviceCodeAttempts < 5 && session.deviceCodeHash !== codeHash) {
      session.deviceCodeAttempts += 1;
    }
    throw new MockIngestionError("connect_rejected", "Connection could not be authorized.", 401);
  }
  if (Date.parse(session.expiresAt) <= Date.now()) {
    session.status = "expired";
    session.statusDetail = "Connection code expired before the scanner claimed it.";
    throw new MockIngestionError("connect_rejected", "Connection could not be authorized.", 401);
  }
  if (session.deviceCodeClaimedAt) {
    throw new MockIngestionError("connect_rejected", "Connection could not be authorized.", 401);
  }

  const token = makeUploadToken();
  const tokenExpiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  const connectionId = makeId("conn");
  session.deviceCodeClaimedAt = new Date().toISOString();
  session.scannerAuthorizedAt = session.deviceCodeClaimedAt;
  session.connectionId = connectionId;
  session.uploadTokenHash = await hashToken(token);
  session.uploadTokenExpiresAt = tokenExpiresAt;
  session.status = "scanner_authorized";
  session.statusDetail = "Scanner authorized. Waiting for one validated snapshot upload.";

  return {
    sessionId,
    connectionId,
    uploadGrant: {
      bearerToken: token,
      snapshotEndpoint: `/api/v1/cli/upload-sessions/${sessionId}/snapshot`,
      expiresAt: tokenExpiresAt,
      schemaVersion: PROJECT_SNAPSHOT_SCHEMA_VERSION,
      maxBytes: MAX_SNAPSHOT_BYTES,
    },
    ...(narrativeModes ? { narrative: {
      mode: session.narrativeMode,
      provider: session.narrativeProvider,
      model: session.narrativeMode === "cloud" ? configuredCloudNarrativeModel() : session.narrativeModel,
      analysisTier: session.analysisTier,
    } } : {}),
  };
}

const PAIRING_TTL_MS = 10 * 60_000;
const PAIRING_POLL_INTERVAL_SECONDS = 2;

function pairingPreviewStatus(pairing: StoredPairing): CliPairingPreview["status"] {
  if (Date.parse(pairing.expiresAt) <= Date.now()) return "expired";
  if (pairing.consumedAt) return "consumed";
  if (pairing.approvedAt) return "approved";
  return "pending";
}

export async function startCliPairing(
  projectLabel: string,
  narrativeMode: "local" | "byok" | "off",
  apiBaseUrl: string,
): Promise<LocalPairStartResponse> {
  const createdAt = new Date();
  const id = makeId("pair");
  const userCode = makeDeviceCode();
  const pairing: StoredPairing = {
    id,
    userCode,
    userCodeHash: await hashToken(userCode),
    projectLabel: projectLabel.trim().slice(0, 120) || "Local generate",
    narrativeMode,
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + PAIRING_TTL_MS).toISOString(),
    approvedAt: null,
    consumedAt: null,
    grant: null,
  };
  store.pairings.set(id, pairing);
  const normalizedApiBaseUrl = `${apiBaseUrl.replace(/\/$/, "")}/`;
  return {
    protocolVersion: "1.0",
    pairingId: id,
    userCode,
    verificationUrl: `${normalizedApiBaseUrl}studio/cli-pair?code=${encodeURIComponent(userCode)}`,
    expiresAt: pairing.expiresAt,
    intervalSeconds: PAIRING_POLL_INTERVAL_SECONDS,
  };
}

export async function getCliPairingPreview(userCode: string): Promise<CliPairingPreview> {
  const codeHash = await hashToken(userCode.trim().toUpperCase());
  const pairing = Array.from(store.pairings.values()).find((candidate) => candidate.userCodeHash === codeHash);
  if (!pairing) {
    throw new MockIngestionError("not_found", "This pairing code was not found or has expired.", 404);
  }
  return {
    userCode: pairing.userCode,
    projectLabel: pairing.projectLabel,
    narrativeMode: pairing.narrativeMode,
    expiresAt: pairing.expiresAt,
    status: pairingPreviewStatus(pairing),
  };
}

export async function approveCliPairing(
  creatorId: string,
  ownerUserId: string,
  userCode: string,
  apiBaseUrl: string,
): Promise<CliPairingPreview> {
  const codeHash = await hashToken(userCode.trim().toUpperCase());
  const pairing = Array.from(store.pairings.values()).find((candidate) => candidate.userCodeHash === codeHash);
  if (!pairing) {
    throw new MockIngestionError("not_found", "This pairing code was not found or has expired.", 404);
  }
  if (pairingPreviewStatus(pairing) === "expired") {
    throw new MockIngestionError("pair_expired", "This pairing code expired before it was approved.", 410);
  }
  if (pairing.approvedAt) {
    throw new MockIngestionError("pair_already_approved", "This pairing was already approved. Return to the CLI.", 409);
  }
  const created = await createUploadSession(
    creatorId,
    pairing.projectLabel,
    apiBaseUrl,
    ownerUserId,
    null,
    pairing.narrativeMode,
  );
  const claim = await claimUploadSession(
    created.deviceAuthorization.sessionId,
    created.deviceAuthorization.userCode,
    [pairing.narrativeMode],
  );
  pairing.approvedAt = new Date().toISOString();
  pairing.grant = {
    protocolVersion: "1.0",
    status: "connected",
    uploadSessionId: created.deviceAuthorization.sessionId,
    connectionId: claim.connectionId,
    uploadGrant: claim.uploadGrant,
    ...(claim.narrative ? { narrative: claim.narrative } : {}),
  };
  return {
    userCode: pairing.userCode,
    projectLabel: pairing.projectLabel,
    narrativeMode: pairing.narrativeMode,
    expiresAt: pairing.expiresAt,
    status: "approved",
  };
}

export async function pollCliPairing(pairingId: string): Promise<{ pending: true } | LocalConnectResponse> {
  const pairing = store.pairings.get(pairingId);
  if (!pairing || pairingPreviewStatus(pairing) === "expired") {
    throw new MockIngestionError("pair_expired", "This pairing expired or was not found.", 410);
  }
  if (pairingPreviewStatus(pairing) === "expired") {
    throw new MockIngestionError("pair_expired", "This pairing expired or was not found.", 410);
  }
  if (pairing.consumedAt) {
    throw new MockIngestionError("pair_expired", "This pairing grant was already issued.", 410);
  }
  if (!pairing.approvedAt || !pairing.grant) {
    return { pending: true };
  }
  pairing.consumedAt = new Date().toISOString();
  const grant = pairing.grant;
  pairing.grant = null;
  return grant;
}

export async function acceptSnapshot(
  sessionId: string,
  bearerToken: string,
  snapshotDigest: string,
  value: unknown,
): Promise<SnapshotUploadReceipt> {
  const session = store.sessions.get(sessionId);
  if (!session) {
    throw new MockIngestionError("not_found", "Upload session not found.", 404);
  }
  if (
    !session.uploadTokenHash ||
    !session.uploadTokenExpiresAt ||
    Date.parse(session.uploadTokenExpiresAt) <= Date.now()
  ) {
    throw new MockIngestionError("upload_token_expired", "Upload token is missing or expired.", 401);
  }
  if ((await hashToken(bearerToken)) !== session.uploadTokenHash) {
    throw new MockIngestionError("invalid_upload_token", "Upload token is invalid.", 401);
  }
  if (session.uploadTokenConsumedAt) {
    throw new MockIngestionError(
      "upload_token_used",
      "Upload token has already been consumed. Use the status endpoint instead.",
      409,
    );
  }
  if (!/^sha256:[a-f0-9]{64}$/.test(snapshotDigest)) {
    throw new MockIngestionError(
      "invalid_snapshot_digest",
      "X-BuildStory-Snapshot-Digest must be a lowercase sha256 digest.",
      400,
    );
  }

  const validated = validateProjectSnapshot(value);
  if (!validated.ok) {
    throw new MockIngestionError(
      "invalid_project_snapshot",
      "ProjectSnapshot validation failed.",
      422,
      validated.errors,
    );
  }
  const hasUploadedEvidence = Boolean(validated.snapshot.narrativeEvidence?.excerpts.length);
  if (session.narrativeMode !== "cloud" && hasUploadedEvidence) {
    throw new MockIngestionError("narrative_mode_mismatch", "This connection mode does not authorize conversation-excerpt uploads.", 422);
  }
  if ((session.narrativeMode === "cloud" || session.narrativeMode === "off") && validated.snapshot.generatedNarrative) {
    throw new MockIngestionError("narrative_mode_mismatch", "This connection mode does not authorize an uploaded generated narrative.", 422);
  }
  if (hasUploadedEvidence) {
    const expectedPolicy = session.analysisTier === "deep" ? "deep-evidence-v2" : "deterministic-heuristic-v1";
    if (validated.snapshot.narrativeEvidence?.policy.excerptSelection !== expectedPolicy) {
      throw new MockIngestionError("analysis_tier_mismatch", "The evidence-selection policy does not match the analysis tier authorized by this connection.", 422);
    }
  }

  const user = Array.from(store.users.values()).find(
    (candidate) => candidate.authSubject === session.creatorId,
  );
  if (!user) {
    throw new MockIngestionError(
      "creator_not_provisioned",
      "This creator has no account record yet. Sign in through the dashboard once before scanning.",
      409,
    );
  }
  // Mirrors d1-store.ts's anti-abuse ceiling - see its comment for the full rationale.
  const existingReportCount = Array.from(store.reports.values()).filter((report) => report.creatorId === session.creatorId).length;
  if (existingReportCount >= MAX_STORED_REPORTS_PER_ACCOUNT) {
    throw new MockIngestionError(
      "report_limit_reached",
      `This account has reached its ${MAX_STORED_REPORTS_PER_ACCOUNT}-report storage limit. Delete an existing project or report before scanning a new one.`,
      403,
    );
  }
  if (session.targetProjectId) {
    const targetProject = store.projects.get(session.targetProjectId);
    if (!targetProject || targetProject.ownerUserId !== user.id) {
      throw new MockIngestionError("not_found", "Project not found.", 404);
    }
    if (targetProject.repositoryFingerprint !== validated.snapshot.repository.fingerprint) {
      throw new MockIngestionError(
        "project_fingerprint_mismatch",
        `This scan is from a different repository than "${targetProject.name}".`,
        422,
      );
    }
  }
  const snapshotSessions = validated.snapshot.sessions;
  const activeDayCount = new Set(snapshotSessions.map((item) => item.startedAt.slice(0, 10))).size;
  const project = ensureProject(
    user.id,
    validated.snapshot.repository.fingerprint,
    validated.snapshot.repository.fingerprintBasis,
    {
      displayName: validated.snapshot.repository.displayName,
      fingerprintBasis: validated.snapshot.repository.fingerprintBasis,
      scannedAt: validated.snapshot.generatedAt,
      sessionCount: snapshotSessions.length,
      commitCount: validated.snapshot.git.commits,
      activeDays: activeDayCount,
    },
  );
  // Authoritative rescan-cap enforcement: targetProjectId above is only a client-side
  // hint, so this is the one true "this counts as a rescan" moment regardless of which
  // UI flow the client came through. A project's first-ever scan never counts.
  if (project.isExisting) {
    if (effectivePlan(user.plan) !== "pro" && getFeatureBudgetCount(user.id, "rescan") >= MONTHLY_RESCAN_CAP_FREE) {
      throw new MockIngestionError(
        "rescan_limit_reached",
        `Free accounts get ${MONTHLY_RESCAN_CAP_FREE} project updates a month. Upgrade to Pro for unlimited updates.`,
        403,
      );
    }
    incrementFeatureBudget(user.id, "rescan");
  }

  // Carry forward the previous chapter's editorial choices - without this, every
  // update would silently reset to DEFAULT_PUBLIC_FIELDS/no category/no artifact
  // links, discarding everything the creator set up on the prior chapter.
  const previousReport = Array.from(store.reports.values())
    .filter((candidate) => candidate.projectId === project.id)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;

  const acceptedAt = new Date().toISOString();
  const reportId = makeId("rpt");
  const receiptId = makeId("rcpt");
  const reportSnapshot = reportSnapshotFromScanner(validated.snapshot, project, {
    id: user.id,
    name: user.displayName,
    handle: user.handle,
    role: builderRoleLabel(user.builderRole) ?? user.bio ?? "AI-assisted software builder",
  });
  session.uploadTokenConsumedAt = acceptedAt;
  session.uploadReceiptId = receiptId;
  session.snapshotDigest = snapshotDigest;
  session.snapshot = validated.snapshot;
  session.snapshotReceivedAt = acceptedAt;
  session.queuedAt = acceptedAt;
  session.reportId = reportId;
  session.status = "queued";
  session.statusDetail = "Snapshot validated and queued for report generation.";

  // Only carry forward tagline/description if the creator actually rewrote them away
  // from the scanner's own defaults - otherwise the new snapshot's freshly regenerated
  // text is a better default than an old chapter's stale auto-generated copy.
  const previousTaglineEdited = previousReport?.editorial.tagline !== previousReport?.snapshot.identity.tagline;
  const previousDescriptionEdited = previousReport?.editorial.description !== previousReport?.snapshot.identity.description;

  const newReport: GeneratedReport = {
    id: reportId,
    creatorId: session.creatorId,
    projectId: reportSnapshot.identity.id,
    uploadSessionId: session.id,
    status: "queued",
    createdAt: acceptedAt,
    readyAt: null,
    sourceSnapshot: validated.snapshot,
    snapshot: reportSnapshot,
    selectedPublicFields: withUiPortPublicFields(previousReport?.selectedPublicFields ?? DEFAULT_PUBLIC_FIELDS),
    editorial: {
      tagline: previousReport && previousTaglineEdited ? previousReport.editorial.tagline : reportSnapshot.identity.tagline,
      description: previousReport && previousDescriptionEdited ? previousReport.editorial.description : reportSnapshot.identity.description,
      reflection: previousReport?.editorial.reflection ?? "",
    },
    category: previousReport?.category ?? null,
    storyBackgroundId: previousReport?.storyBackgroundId ?? DEFAULT_STORY_BACKGROUND_ID,
    artifact: previousReport?.artifact ?? { projectUrl: null, repoUrl: null, videoUrl: null },
    publication: {
      status: "not_published",
      slug: reportSnapshot.identity.slug,
      publishedAt: null,
      publicUrl: null,
      chapterIndex: null,
    },
    narrative: null,
    chapterDelta: null,
  };
  store.reports.set(reportId, newReport);
  registerSocialReport(reportId, user.id, newReport);

  if (validated.snapshot.generatedNarrative) {
    store.narratives.set(reportId, {
      id: makeId("nar"),
      reportId,
      ownerUserId: user.id,
      mode: "local",
      provider: validated.snapshot.generatedNarrative.provider,
      model: validated.snapshot.generatedNarrative.model,
      status: "ready",
      sections: validated.snapshot.generatedNarrative.sections,
      storyPack: validated.snapshot.generatedNarrative.storyPack ?? null,
      analysisTierRequested: "standard",
      analysisTierDelivered: validated.snapshot.generatedNarrative.storyPack?.version === "3.0.0" ? "deep" : "standard",
      evidenceScrubbedAt: null,
      observability: null,
      fallbacksUsed: validated.snapshot.generatedNarrative.fallbacksUsed,
      inputTokens: 0,
      outputTokens: 0,
      costMicroUsd: 0,
      attempts: 0,
    });
  } else if (session.narrativeMode === "local" || session.narrativeMode === "byok") {
    // Generation was attempted on the creator's machine (Ollama or a BYOK
    // provider) and produced nothing - record it as failed rather than
    // falling through to the narrativeEvidence branch, which local/byok
    // scans never carry.
    store.narratives.set(reportId, {
      id: makeId("nar"),
      reportId,
      ownerUserId: user.id,
      mode: "local",
      provider: session.narrativeMode === "byok" ? "byok" : "ollama",
      model: session.narrativeModel ?? "auto",
      status: "failed",
      sections: null,
      storyPack: null,
      analysisTierRequested: "standard",
      analysisTierDelivered: "standard",
      evidenceScrubbedAt: null,
      observability: null,
      fallbacksUsed: [],
      inputTokens: 0,
      outputTokens: 0,
      costMicroUsd: 0,
      attempts: 0,
    });
  } else if (validated.snapshot.narrativeEvidence && validated.snapshot.narrativeEvidence.excerpts.length > 0) {
    createNarrativeJob(reportId, user.id, session.analysisTier);
  }

  return {
    sessionId,
    receiptId,
    scanId: validated.snapshot.scanId,
    snapshotDigest,
    acceptedAt,
    status: "queued",
    statusEndpoint: `/api/v1/cli/upload-sessions/${sessionId}/status`,
    reportEndpoint: `/api/v1/cli/reports/${reportId}`,
  };
}

async function scannerSessionForToken(sessionId: string, bearerToken: string) {
  const session = store.sessions.get(sessionId);
  if (!session) {
    throw new MockIngestionError("not_found", "Upload session not found.", 404);
  }
  if (
    !session.uploadTokenHash ||
    !session.uploadTokenExpiresAt ||
    Date.parse(session.uploadTokenExpiresAt) <= Date.now()
  ) {
    throw new MockIngestionError(
      "upload_token_expired",
      "The local upload grant is missing or expired. Create a fresh dashboard connection.",
      401,
    );
  }
  if ((await hashToken(bearerToken)) !== session.uploadTokenHash) {
    throw new MockIngestionError(
      "invalid_upload_token",
      "The local upload grant is invalid for this session.",
      401,
    );
  }
  return session;
}

export async function getLocalUploadStatus(
  sessionId: string,
  bearerToken: string,
): Promise<{
  protocolVersion: "1.0";
  status: "accepted" | "processing" | "ready" | "failed";
  reportReady: boolean;
  narrativeStatus: "not_requested" | NarrativeStatus;
}> {
  const session = await scannerSessionForToken(sessionId, bearerToken);
  if (!session.uploadTokenConsumedAt) {
    throw new MockIngestionError(
      "snapshot_not_uploaded",
      "No ProjectSnapshot has been accepted for this connection yet.",
      409,
    );
  }
  refreshLifecycle(session);
  const status =
    session.status === "report_ready"
      ? "ready"
      : session.status === "failed"
        ? "failed"
        : session.status === "snapshot_received"
          ? "accepted"
          : "processing";
  return {
    protocolVersion: "1.0",
    status,
    reportReady: status === "ready",
    narrativeStatus: session.reportId ? store.narratives.get(session.reportId)?.status ?? "not_requested" : "not_requested",
  };
}

export async function getLocalReport(
  reportId: string,
  bearerToken: string,
): Promise<LocalReportSummary> {
  const report = store.reports.get(reportId);
  if (!report) {
    throw new MockIngestionError("not_found", "Report not found.", 404);
  }
  const session = await scannerSessionForToken(
    report.uploadSessionId,
    bearerToken,
  );
  refreshLifecycle(session);
  if (report.status !== "ready") {
    throw new MockIngestionError(
      "report_not_ready",
      "The private report is still being generated. Poll statusUrl before retrieving it.",
      409,
    );
  }

  return {
    summary: `Private report ready for ${report.snapshot.identity.name}. Review it in the Buildstory dashboard before publishing.`,
    sessionCount: report.snapshot.sessions.length,
    commitCount: report.snapshot.git.commits,
    milestoneCount: report.snapshot.milestones.length,
    warningCount: report.sourceSnapshot?.quality.warningCount ?? 0,
  };
}

export async function getReport(creatorId: string, reportId: string): Promise<GeneratedReport> {
  const report = store.reports.get(reportId);
  if (!report || report.creatorId !== creatorId) {
    throw new MockIngestionError("not_found", "Report not found.", 404);
  }
  const session = store.sessions.get(report.uploadSessionId);
  if (session) refreshLifecycle(session);
  const narrative = store.narratives.get(reportId);
  if (narrative && (narrative.status === "queued" || narrative.status === "generating")) {
    await processNarrativeJob(reportId);
  }
  return hydrateGeneratedReport({ ...structuredClone(report), narrative: narrativeRecordFor(reportId) });
}

export function updateReport(
  creatorId: string,
  reportId: string,
  update: {
    selectedPublicFields?: PublicFieldKey[];
    editorial?: Partial<GeneratedReport["editorial"]>;
    artifact?: ArtifactLinksUpdate;
    category?: GeneratedReport["category"];
    storyBackgroundId?: GeneratedReport["storyBackgroundId"];
  },
): GeneratedReport {
  const report = store.reports.get(reportId);
  if (!report || report.creatorId !== creatorId) {
    throw new MockIngestionError("not_found", "Report not found.", 404);
  }
  if (report.status !== "ready") {
    throw new MockIngestionError("report_not_ready", "Report is not ready to edit.", 409);
  }

  if (update.selectedPublicFields) {
    const unique = [...new Set(update.selectedPublicFields)];
    if (unique.some((field) => !PUBLIC_FIELD_KEYS.includes(field))) {
      throw new MockIngestionError("invalid_public_fields", "One or more public fields are invalid.", 422);
    }
    report.selectedPublicFields = unique;
  }

  if (update.editorial) {
    for (const key of ["tagline", "description", "reflection"] as const) {
      const value = update.editorial[key];
      if (value !== undefined) {
        const sanitized = sanitizePublicText(
          value,
          key === "tagline" ? 300 : 4_000,
        );
        if (sanitized.findings.length > 0) {
          throw new MockIngestionError(
            "unsafe_editorial_content",
            "Editorial text cannot contain secrets, raw remote URLs, or absolute paths.",
            422,
          );
        }
        report.editorial[key] = sanitized.value;
      }
    }
  }
  if (update.artifact) {
    for (const key of ["projectUrl", "repoUrl", "videoUrl"] as const) {
      const value = update.artifact[key];
      if (value !== undefined) {
        const normalized = normalizeArtifactUrl(value);
        if (!normalized.ok) {
          throw new MockIngestionError(
            "invalid_artifact_url",
            "Artifact links must be well-formed https URLs with no embedded credentials.",
            422,
          );
        }
        report.artifact[key] = normalized.value;
      }
    }
  }
  if (update.category !== undefined) {
    const valid = ["web-apps", "developer-tools", "saas", "ai-ml", "design-tools", "automation", "data-analytics", "productivity", "games", "other"];
    if (update.category !== null && !valid.includes(update.category)) {
      throw new MockIngestionError("invalid_category", "Choose a valid project category.", 422);
    }
    report.category = update.category;
  }
  if (update.storyBackgroundId !== undefined) {
    if (!isStoryBackgroundId(update.storyBackgroundId)) {
      throw new MockIngestionError("invalid_story_background", "Choose a valid story background.", 422);
    }
    report.storyBackgroundId = update.storyBackgroundId;
  }
  if (report.publication.status === "published") {
    report.publication.status = "draft_changes";
  }
  registerSocialReport(reportId, userIdForCreator(creatorId), report);
  return { ...structuredClone(report), narrative: narrativeRecordFor(reportId) };
}

/** Public boundary: media metadata only, gated by the artifactMedia PublicFieldKey by the caller. */
export function listReportMedia(reportId: string): ReportMediaRecord[] {
  return Array.from(store.reportMedia.values())
    .filter((media) => media.reportId === reportId)
    .sort((left, right) => left.sortOrder - right.sortOrder);
}

/** Owner access or an exact media ID present in the frozen public projection. */
export function canReadReportMedia(r2Key: string, creatorId: string | null): boolean {
  const media = Array.from(store.reportMedia.values()).find((candidate) => candidate.r2Key === r2Key);
  if (!media) return false;
  const report = store.reports.get(media.reportId);
  if (creatorId && report?.creatorId === creatorId) return true;
  return store.publicStoryIndex.get(media.reportId)?.story.artifactMedia.some((candidate) => candidate.id === media.id) ?? false;
}

/**
 * Registers an already-uploaded R2 object against a report. Never accepts
 * bytes itself - the API route puts the object to R2 first, then calls this
 * to record the metadata row, so this function can stay a pure store write.
 */
export function addReportMedia(
  creatorId: string,
  reportId: string,
  media: { r2Key: string; contentType: string; byteSize: number; kind: ReportMediaKind },
): ReportMediaRecord {
  const report = store.reports.get(reportId);
  if (!report || report.creatorId !== creatorId) {
    throw new MockIngestionError("not_found", "Report not found.", 404);
  }
  if (report.status !== "ready") {
    throw new MockIngestionError("report_not_ready", "Report is not ready to edit.", 409);
  }
  const ownerUserId = userIdForCreator(creatorId);
  if (!ownerUserId) throw new MockIngestionError("not_found", "Creator account not found.", 404);
  const existing = listReportMedia(reportId);
  if (existing.length >= MAX_MEDIA_PER_REPORT) {
    throw new MockIngestionError(
      "media_limit_reached",
      `A report can have at most ${MAX_MEDIA_PER_REPORT} images.`,
      422,
    );
  }
  const record: ReportMediaRecord = {
    id: makeId("med"),
    reportId,
    ownerUserId,
    r2Key: media.r2Key,
    contentType: media.contentType,
    byteSize: media.byteSize,
    kind: media.kind,
    sortOrder: existing.length,
    url: mediaPublicUrl(media.r2Key),
  };
  store.reportMedia.set(record.id, record);
  return record;
}

/** Returns the deleted row's r2Key so the caller can also remove the R2 object; deletes nothing if the media doesn't belong to this creator. */
export function deleteReportMedia(creatorId: string, mediaId: string): { r2Key: string } {
  const ownerUserId = userIdForCreator(creatorId);
  if (!ownerUserId) throw new MockIngestionError("not_found", "Creator account not found.", 404);
  const record = store.reportMedia.get(mediaId);
  if (!record || record.ownerUserId !== ownerUserId) {
    throw new MockIngestionError("not_found", "Media not found.", 404);
  }
  store.reportMedia.delete(mediaId);
  return { r2Key: record.r2Key };
}

/**
 * Publishing is chapter-aware: a project can have several simultaneously-published
 * reports now, one per chapter. Exactly one - the one with the highest chapterIndex -
 * is canonical (its publicUrl has no trailing chapter number); older ones are
 * rewritten to a chapter-suffixed publicUrl when superseded. Mirrors d1-store.ts.
 */
export async function publishReport(creatorId: string, reportId: string): Promise<GeneratedReport> {
  const report = store.reports.get(reportId);
  if (!report || report.creatorId !== creatorId) {
    throw new MockIngestionError("not_found", "Report not found.", 404);
  }
  if (report.status !== "ready") {
    throw new MockIngestionError("report_not_ready", "Report is not ready to publish.", 409);
  }
  if (report.narrative?.status === "queued" || report.narrative?.status === "generating") {
    throw new MockIngestionError(
      "narrative_pending",
      "The AI narrative is still being generated. You can browse the private report while it finishes.",
      409,
    );
  }
  if (!report.selectedPublicFields.includes("tagline")) {
    throw new MockIngestionError("missing_public_field", "A public tagline is required.", 422);
  }
  if (!report.category) {
    throw new MockIngestionError("missing_category", "Choose a project category before publishing.", 422);
  }
  if (
    Object.entries(report.editorial).some(
      ([key, value]) =>
        sanitizePublicText(value, key === "tagline" ? 300 : 4_000).findings
          .length > 0,
    )
  ) {
    throw new MockIngestionError(
      "unsafe_editorial_content",
      "Editorial text must pass the public privacy boundary before publication.",
      422,
    );
  }

  if (report.publication.chapterIndex === null) {
    const maxChapter = Array.from(store.reports.values())
      .filter((candidate) => candidate.projectId === report.projectId && candidate.publication.chapterIndex !== null)
      .reduce((max, candidate) => Math.max(max, candidate.publication.chapterIndex ?? 0), 0);
    report.publication.chapterIndex = maxChapter + 1;
  }

  const currentCanonical = Array.from(store.reports.values())
    .filter((candidate) => candidate.id !== reportId && candidate.projectId === report.projectId && candidate.publication.status === "published")
    .sort((left, right) => (right.publication.chapterIndex ?? 0) - (left.publication.chapterIndex ?? 0))[0];

  const becomesCanonical = !currentCanonical || (currentCanonical.publication.chapterIndex ?? 0) < report.publication.chapterIndex;
  const owner = store.users.get(userIdForCreator(creatorId) ?? "");
  const handle = owner?.handle ?? report.snapshot.identity.owner.handle;
  const canonicalUrl = `${publicOrigin()}/u/${handle}/${report.publication.slug}`;
  const now = new Date().toISOString();

  if (becomesCanonical && currentCanonical) {
    currentCanonical.publication.publicUrl = `${canonicalUrl}/${currentCanonical.publication.chapterIndex}`;
  }
  report.publication.status = "published";
  report.publication.publishedAt = now;
  report.publication.publicUrl = becomesCanonical ? canonicalUrl : `${canonicalUrl}/${report.publication.chapterIndex}`;

  // Compute the chapter's delta against the immediately-preceding chapter, once, at
  // publish time - never re-derived on a public read, same rationale as story_json.
  const thisChapterIndex = report.publication.chapterIndex;
  if (thisChapterIndex !== null && thisChapterIndex > 1) {
    const previousChapter = Array.from(store.reports.values()).find(
      (candidate) => candidate.projectId === report.projectId && candidate.publication.chapterIndex === thisChapterIndex - 1,
    );
    report.chapterDelta = previousChapter
      ? computeChapterDelta(previousChapter.snapshot, report.snapshot, thisChapterIndex - 1, thisChapterIndex)
      : null;
  }

  const hydrated = hydrateGeneratedReport(report);
  const publicStory = publicBuildStoryFromSnapshot(hydrated.snapshot, report.selectedPublicFields, { tagline: report.editorial.tagline, description: report.editorial.description, reflection: report.editorial.reflection, category: report.category }, { ...report.artifact, media: listReportMedia(report.id) }, { storyBackgroundId: report.storyBackgroundId });
  // Gated at publish time and frozen alongside every other public field - a creator
  // who never republishes after toggling a field off must not have that field's
  // numbers reappear here just because the delta band re-reads live state.
  const publicStoryWithDelta = {
    ...publicStory,
    chapterDelta: report.chapterDelta ? publicChapterDelta(report.chapterDelta, report.selectedPublicFields) : null,
  };
  store.publicStoryIndex.set(report.id, {
    story: publicStoryWithDelta,
    category: report.category,
    searchText: [publicStory.name, publicStory.tagline, publicStory.description, publicStory.owner.name, publicStory.owner.handle, publicStory.category, ...publicStory.stack, ...publicStory.tools.map((tool) => tool.label), ...publicStory.models.flatMap((model) => [model.id, model.label])].join(" ").slice(0, 12_000),
    hasLiveDemo: Boolean(publicStory.artifactLinks.projectUrl),
    updatedAt: now,
  });
  registerSocialReport(reportId, userIdForCreator(creatorId), report, publicStoryWithDelta);
  if (thisChapterIndex !== null && thisChapterIndex > 1 && owner) {
    await notifyFollowersOfStoryUpdate(reportId, owner.id);
  }
  if (owner) {
    try {
      const { refreshUserBadges } = await import("@/lib/badges/mock-store");
      refreshUserBadges(owner.id);
    } catch {
      // Badge evaluation must never block a successful publish.
    }
  }
  return { ...structuredClone(report), narrative: narrativeRecordFor(reportId) };
}

/**
 * Unpublishing the canonical chapter promotes the next-highest still-published
 * chapter (if any) to the canonical URL. Mirrors d1-store.ts.
 */
export function unpublishReport(creatorId: string, reportId: string): GeneratedReport {
  const report = store.reports.get(reportId);
  if (!report || report.creatorId !== creatorId || !isPubliclyVisible(report.publication.status)) throw new MockIngestionError("not_published", "Published report not found.", 404);

  const canonicalUrl = `${publicOrigin()}/u/`; // prefix check below; publicUrl has no trailing /<n> when canonical
  const wasCanonical = Boolean(report.publication.publicUrl) && report.publication.publicUrl!.startsWith(canonicalUrl) && !/\/\d+$/.test(report.publication.publicUrl!);

  report.publication.status = "not_published";
  report.publication.publishedAt = null;
  report.publication.publicUrl = null;
  store.publicStoryIndex.delete(reportId);

  if (wasCanonical) {
    const next = Array.from(store.reports.values())
      .filter((candidate) => candidate.id !== reportId && candidate.projectId === report.projectId && isPubliclyVisible(candidate.publication.status))
      .sort((left, right) => (right.publication.chapterIndex ?? 0) - (left.publication.chapterIndex ?? 0))[0];
    if (next) {
      const owner = store.users.get(userIdForCreator(creatorId) ?? "");
      const handle = owner?.handle ?? next.snapshot.identity.owner.handle;
      next.publication.publicUrl = `${publicOrigin()}/u/${handle}/${next.publication.slug}`;
    }
  }
  return { ...structuredClone(report), narrative: narrativeRecordFor(reportId) };
}

export function publicationStatusForProject(creatorId: string, projectId: string) {
  const report = Array.from(store.reports.values()).find(
    (candidate) => candidate.creatorId === creatorId && candidate.projectId === projectId,
  );
  return report ? structuredClone(report.publication) : null;
}

/** Moderator-triggered unpublish, mirroring unpublishReport but without an ownership check. */
export function moderatorUnpublishReport(reportId: string): void {
  const report = store.reports.get(reportId);
  if (!report || !isPubliclyVisible(report.publication.status)) return;

  const canonicalUrl = `${publicOrigin()}/u/`;
  const wasCanonical =
    Boolean(report.publication.publicUrl) &&
    report.publication.publicUrl!.startsWith(canonicalUrl) &&
    !/\/\d+$/.test(report.publication.publicUrl!);

  report.publication.status = "not_published";
  report.publication.publishedAt = null;
  report.publication.publicUrl = null;
  store.publicStoryIndex.delete(reportId);
  registerSocialReport(reportId, userIdForCreator(report.creatorId), report, null);

  if (wasCanonical) {
    const next = Array.from(store.reports.values())
      .filter((candidate) => candidate.id !== reportId && candidate.projectId === report.projectId && isPubliclyVisible(candidate.publication.status))
      .sort((left, right) => (right.publication.chapterIndex ?? 0) - (left.publication.chapterIndex ?? 0))[0];
    if (next) {
      const owner = store.users.get(userIdForCreator(next.creatorId) ?? "");
      const handle = owner?.handle ?? next.snapshot.identity.owner.handle;
      next.publication.publicUrl = `${publicOrigin()}/u/${handle}/${next.publication.slug}`;
      registerSocialReport(next.id, userIdForCreator(next.creatorId), next);
    }
  }
}

/** Bootstraps or changes a moderator/admin. Handle-based since that's the only identifier an operator has on hand. */
export function setUserRoleByHandle(
  handle: string,
  role: "member" | "moderator" | "admin",
): { id: string; handle: string; role: string } {
  const user = Array.from(store.users.values()).find(
    (candidate) => candidate.handleLower === handle.trim().toLocaleLowerCase("en-US"),
  );
  if (!user) throw new MockIngestionError("not_found", "No user with that handle.", 404);
  user.role = role;
  registerSocialProfile(user);
  return { id: user.id, handle: user.handle, role: user.role };
}

/**
 * Flips account status. Suspension relies on the account_suspended checks
 * already scattered through this file (ensureUser and friends) - this is
 * the missing piece that actually sets the status those checks read.
 */
export function setUserStatusById(
  userId: string,
  status: "active" | "suspended",
): { id: string; handle: string; status: string } {
  const user = store.users.get(userId);
  if (!user) throw new MockIngestionError("not_found", "User not found.", 404);
  user.status = status;
  return { id: user.id, handle: user.handle, status: user.status };
}

export function renameProjectSlug(creatorId: string, projectId: string, requestedSlug: string): ProjectRecord {
  const project = store.projects.get(projectId);
  if (!project || userIdForCreator(creatorId) !== project.ownerUserId) {
    throw new MockIngestionError("not_found", "Project not found.", 404);
  }
  const slug = baseSlugFrom(requestedSlug);
  if (slug !== requestedSlug.trim().toLocaleLowerCase("en-US") || ![...candidateSlugs(slug)].includes(slug)) {
    throw new MockIngestionError("invalid_project_slug", "Project slugs may use lowercase letters, numbers, and hyphens.", 422);
  }
  const conflict = Array.from(store.projects.values()).some((candidate) => candidate.id !== projectId && candidate.ownerUserId === project.ownerUserId && candidate.slug === slug);
  if (conflict) {
    throw new MockIngestionError("project_slug_conflict", "That project slug is already in use.", 409, [...candidateSlugs(slug)].slice(1, 4));
  }
  project.slug = slug;
  return { id: project.id, ownerUserId: project.ownerUserId, slug: project.slug, name: project.name, repositoryFingerprint: project.repositoryFingerprint };
}

export type ProjectVerificationDetail = {
  id: string;
  ownerUserId: string;
  repositoryFingerprint: string;
  fingerprintBasis: string;
  verifiedRepoAt: string | null;
};

export function getProjectForVerification(creatorId: string, projectId: string): ProjectVerificationDetail {
  const project = store.projects.get(projectId);
  if (!project || userIdForCreator(creatorId) !== project.ownerUserId) {
    throw new MockIngestionError("not_found", "Project not found.", 404);
  }
  return {
    id: project.id,
    ownerUserId: project.ownerUserId,
    repositoryFingerprint: project.repositoryFingerprint,
    fingerprintBasis: project.fingerprintBasis,
    verifiedRepoAt: project.verifiedRepoAt,
  };
}

export async function markProjectRepoVerified(creatorId: string, projectId: string): Promise<{ verifiedRepoAt: string }> {
  const project = store.projects.get(projectId);
  if (!project || userIdForCreator(creatorId) !== project.ownerUserId) {
    throw new MockIngestionError("not_found", "Project not found.", 404);
  }
  const now = new Date().toISOString();
  project.verifiedRepoAt = now;
  try {
    const { refreshUserBadges } = await import("@/lib/badges/mock-store");
    refreshUserBadges(project.ownerUserId);
  } catch {
    // Verification should still succeed if badge evaluation fails.
  }
  return { verifiedRepoAt: now };
}

/** Owner-scoped project list for /studio/projects - one row per project, not per scan. */
export function listProjects(creatorId: string): ProjectSummary[] {
  const ownerUserId = userIdForCreator(creatorId);
  if (!ownerUserId) return [];
  const byProject = new Map<string, GeneratedReport[]>();
  for (const report of store.reports.values()) {
    if (report.creatorId !== creatorId) continue;
    const list = byProject.get(report.projectId) ?? [];
    list.push(report);
    byProject.set(report.projectId, list);
  }
  const summaries: ProjectSummary[] = [];
  for (const [projectId, unsortedReports] of byProject) {
    const project = store.projects.get(projectId);
    if (!project || project.ownerUserId !== ownerUserId) continue;
    const reports = [...unsortedReports].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const latestReport = reports[0]!;
    const publishedReports = reports
      .filter((report) => report.publication.chapterIndex !== null)
      .sort((left, right) => (right.publication.chapterIndex ?? 0) - (left.publication.chapterIndex ?? 0));
    const canonicalReport = publishedReports[0] ?? null;
    summaries.push({
      id: project.id,
      slug: project.slug,
      name: project.name,
      chapterCount: publishedReports.length,
      latestChapterIndex: canonicalReport?.publication.chapterIndex ?? null,
      latestPublicationStatus: latestReport.publication.status,
      latestReportId: latestReport.id,
      latestReportStatus: latestReport.status,
      lastScanAt: latestReport.createdAt,
      publicUrl: canonicalReport?.publication.publicUrl ?? null,
    });
  }
  return summaries.sort((left, right) => right.lastScanAt.localeCompare(left.lastScanAt));
}

/** Owner-scoped project detail - every report (chapter or not) belonging to this project. */
export function getProjectDetail(creatorId: string, projectId: string): ProjectDetail {
  const project = store.projects.get(projectId);
  if (!project || userIdForCreator(creatorId) !== project.ownerUserId) {
    throw new MockIngestionError("not_found", "Project not found.", 404);
  }
  const reports = Array.from(store.reports.values())
    .filter((report) => report.projectId === projectId && report.creatorId === creatorId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const canonicalReport = reports
    .filter((report) => report.publication.chapterIndex !== null)
    .sort((left, right) => (right.publication.chapterIndex ?? 0) - (left.publication.chapterIndex ?? 0))[0] ?? null;
  return {
    id: project.id,
    slug: project.slug,
    name: project.name,
    publicUrl: canonicalReport?.publication.publicUrl ?? null,
    reports: reports.map((report) => ({
      reportId: report.id,
      status: report.status,
      chapterIndex: report.publication.chapterIndex,
      publicationStatus: report.publication.status,
      createdAt: report.createdAt,
      publishedAt: report.publication.publishedAt,
      chapterDelta: report.chapterDelta,
      editorialTagline: report.editorial.tagline,
    })),
  };
}

export function getPublicProjectVerification(handle: string, slug: string): string | null {
  const handleLower = handle.toLocaleLowerCase("en-US");
  const owner = Array.from(store.users.values()).find((candidate) => candidate.handleLower === handleLower);
  if (!owner) return null;
  const publishedProjectIds = new Set(
    Array.from(store.reports.values())
      .filter((report) => (report.publication.status === "published" || report.publication.status === "draft_changes") && report.publication.slug === slug)
      .map((report) => report.projectId),
  );
  const project = Array.from(store.projects.values()).find(
    (candidate) => candidate.ownerUserId === owner.id && publishedProjectIds.has(candidate.id),
  );
  return project?.verifiedRepoAt ?? null;
}

function isPubliclyVisible(status: string): boolean {
  return status === "published" || status === "draft_changes";
}

/**
 * Reads back the exact projection frozen at the last publish. A report in `draft_changes`
 * has unsaved edits sitting in its own snapshot/selectedPublicFields/editorial fields -
 * those must never be re-derived for a public read, or every save would leak the creator's
 * unpublished changes onto the still-live public URL. Mirrors d1-store.ts's frozenPublicStory.
 */
function frozenPublicStory(reportId: string): (PublicBuildStoryViewModel & { reportId: string; chapterDelta: ChapterDelta | null }) | null {
  const entry = store.publicStoryIndex.get(reportId);
  return entry ? { ...structuredClone(entry.story), reportId } : null;
}

function publicDeltaFor(report: GeneratedReport): ChapterDelta | null {
  return report.chapterDelta ? publicChapterDelta(report.chapterDelta, report.selectedPublicFields) : null;
}

/** Public boundary: callers receive only the selected projection, never report state. */
/** Picks the canonical (highest chapterIndex) published report among candidates - mirrors the D1 path scheme. */
function canonicalOf(candidates: GeneratedReport[]): GeneratedReport | undefined {
  return candidates.sort((left, right) => (right.publication.chapterIndex ?? 0) - (left.publication.chapterIndex ?? 0))[0];
}

export function getPublishedStoryBySlug(slug: string) {
  const report = canonicalOf(
    Array.from(store.reports.values()).filter(
      (candidate) => candidate.publication.slug === slug && isPubliclyVisible(candidate.publication.status),
    ),
  );
  if (!report) return null;
  if (report.publication.status === "draft_changes") return frozenPublicStory(report.id);
  const snapshot = structuredClone(report.snapshot);
  snapshot.identity.tagline = report.editorial.tagline;
  snapshot.identity.description = report.editorial.description;
  snapshot.identity.visibility = "public";
  return {
    ...publicBuildStoryFromSnapshot(snapshot, report.selectedPublicFields, {
      tagline: report.editorial.tagline,
      description: report.editorial.description,
      reflection: report.editorial.reflection,
      category: report.category,
    }, { ...report.artifact, media: listReportMedia(report.id) }, { storyBackgroundId: report.storyBackgroundId }),
    chapterDelta: publicDeltaFor(report),
  };
}

export function getPublishedStory(handle: string, slug: string) {
  const report = canonicalOf(
    Array.from(store.reports.values()).filter((candidate) => {
      const owner = store.users.get(userIdForCreator(candidate.creatorId) ?? "");
      return owner?.handleLower === handle.toLocaleLowerCase("en-US") && candidate.publication.slug === slug && isPubliclyVisible(candidate.publication.status);
    }),
  );
  if (!report) return null;
  if (report.publication.status === "draft_changes") return frozenPublicStory(report.id);
  const snapshot = structuredClone(report.snapshot);
  snapshot.identity.tagline = report.editorial.tagline;
  snapshot.identity.description = report.editorial.description;
  snapshot.identity.visibility = "public";
  return {
    ...publicBuildStoryFromSnapshot(snapshot, report.selectedPublicFields, { tagline: report.editorial.tagline, description: report.editorial.description, reflection: report.editorial.reflection, category: report.category }, { ...report.artifact, media: listReportMedia(report.id) }, { storyBackgroundId: report.storyBackgroundId }),
    reportId: report.id,
    chapterDelta: publicDeltaFor(report),
  };
}

/** A specific chapter of a project's public story, by its 1-based chapterIndex - used for the archival "<slug>/<n>" path. */
export function getPublishedStoryChapter(handle: string, slug: string, chapterIndex: number) {
  const canonical = canonicalOf(Array.from(store.reports.values()).filter((candidate) => {
    const owner = store.users.get(userIdForCreator(candidate.creatorId) ?? "");
    return (
      owner?.handleLower === handle.toLocaleLowerCase("en-US") &&
      candidate.publication.slug === slug &&
      isPubliclyVisible(candidate.publication.status)
    );
  }));
  const report = canonical
    ? Array.from(store.reports.values()).find((candidate) =>
      candidate.projectId === canonical.projectId &&
      candidate.publication.chapterIndex === chapterIndex &&
      isPubliclyVisible(candidate.publication.status),
    )
    : undefined;
  if (!report) return null;
  if (report.publication.status === "draft_changes") return frozenPublicStory(report.id);
  const snapshot = structuredClone(report.snapshot);
  snapshot.identity.tagline = report.editorial.tagline;
  snapshot.identity.description = report.editorial.description;
  snapshot.identity.visibility = "public";
  return {
    ...publicBuildStoryFromSnapshot(snapshot, report.selectedPublicFields, { tagline: report.editorial.tagline, description: report.editorial.description, reflection: report.editorial.reflection, category: report.category }, { ...report.artifact, media: listReportMedia(report.id) }, { storyBackgroundId: report.storyBackgroundId }),
    reportId: report.id,
    chapterDelta: publicDeltaFor(report),
  };
}

/** All currently-published chapters of a project, oldest first - powers the timeline nav. */
export function listPublishedChapters(handle: string, slug: string) {
  const canonical = canonicalOf(Array.from(store.reports.values()).filter((candidate) => {
    const owner = store.users.get(userIdForCreator(candidate.creatorId) ?? "");
    return owner?.handleLower === handle.toLocaleLowerCase("en-US") && candidate.publication.slug === slug && isPubliclyVisible(candidate.publication.status);
  }));
  return Array.from(store.reports.values())
    .filter((candidate) => canonical && candidate.projectId === canonical.projectId && isPubliclyVisible(candidate.publication.status))
    .sort((left, right) => (left.publication.chapterIndex ?? 0) - (right.publication.chapterIndex ?? 0))
    .map((report) => {
      // Reads the frozen, already-gated public projection, never the private snapshot -
      // a chapter the creator didn't select gitAggregates/costEstimate for must show
      // 0/null here too, exactly like everywhere else on the page. The stored
      // chapterDelta is already gated too, so the timeline's inline deltas can never
      // disagree with the "what changed" band shown elsewhere.
      const publicStory = store.publicStoryIndex.get(report.id)?.story ?? null;
      return {
        reportId: report.id,
        chapterIndex: report.publication.chapterIndex ?? 1,
        publishedAt: report.publication.publishedAt,
        tagline: report.editorial.tagline,
        commits: publicStory?.git.commits ?? 0,
        activeDays: publicStory?.activeDays ?? 0,
        costMicroUsd: publicStory?.cost?.totalMicroUsd ?? null,
        commitsDelta: publicStory?.chapterDelta?.build.commits.change ?? null,
        activeDaysDelta: publicStory?.chapterDelta?.build.activeDays.change ?? null,
        chapterDelta: publicStory?.chapterDelta ?? null,
      };
    });
}

/** IDs only, for social features (reactions/comments) to key off of - never content. */
export function getPublicStoryIdentity(slug: string): { reportId: string; ownerUserId: string | null; projectId: string } | null {
  const report = Array.from(store.reports.values()).find(
    (candidate) => candidate.publication.slug === slug && isPubliclyVisible(candidate.publication.status),
  );
  return report ? { reportId: report.id, ownerUserId: userIdForCreator(report.creatorId), projectId: report.projectId } : null;
}

export function getPublicStoryIdentityByReportId(reportId: string) {
  const report = store.reports.get(reportId);
  return report && isPubliclyVisible(report.publication.status)
    ? { reportId: report.id, ownerUserId: userIdForCreator(report.creatorId), projectId: report.projectId }
    : null;
}

/** Every published (or draft_changes) report id for a project, most recent chapter first - for the comment/reaction rollup. */
export function listPublishedReportIdsForProject(projectId: string): string[] {
  return Array.from(store.reports.values())
    .filter((report) => report.projectId === projectId && isPubliclyVisible(report.publication.status))
    .sort((left, right) => (right.publication.chapterIndex ?? 0) - (left.publication.chapterIndex ?? 0))
    .map((report) => report.id);
}

/**
 * A project can now have several simultaneously-published reports (one per chapter -
 * see the matching comment in d1-store.ts). List/search views must still show exactly
 * one representative row per project - always its current latest (highest chapterIndex) -
 * or a re-scanned project would appear as N duplicate entries in Explore/search.
 */
/**
 * `includeDraftChanges` must match the caller's own filter, exactly as in d1-store.ts's
 * latestChapterOnly: callers that re-derive live from report.snapshot (listPublishedStories,
 * listStoriesByOwner, searchPublishedStories) must keep computing "latest" against
 * published-only rows, or a project whose newest chapter is mid-edit would suppress its
 * still-fully-published previous chapter. explorePublishedStories reads the frozen
 * publicStoryIndex entry, so it can safely widen both.
 */
function isLatestPublishedChapter(report: GeneratedReport, includeDraftChanges = false): boolean {
  const visible = (status: string) => status === "published" || (includeDraftChanges && status === "draft_changes");
  const maxChapter = Array.from(store.reports.values())
    .filter((candidate) => candidate.projectId === report.projectId && visible(candidate.publication.status))
    .reduce((max, candidate) => Math.max(max, candidate.publication.chapterIndex ?? 0), 0);
  return (report.publication.chapterIndex ?? 0) === maxChapter;
}

export function listPublishedStories(limit = 30, cursor?: string) {
  const boundedLimit = Math.min(Math.max(1, Math.trunc(limit)), 100);
  return Array.from(store.reports.values())
    .filter((report) => report.publication.status === "published" && isLatestPublishedChapter(report))
    .filter((report) => !cursor || (report.publication.publishedAt ?? "") < cursor)
    .sort((left, right) =>
      (right.publication.publishedAt ?? "").localeCompare(left.publication.publishedAt ?? ""),
    )
    .slice(0, boundedLimit)
    .map((report) => {
      const snapshot = structuredClone(report.snapshot);
      snapshot.identity.tagline = report.editorial.tagline;
      snapshot.identity.description = report.editorial.description;
      snapshot.identity.visibility = "public";
      return {
        // List views intentionally omit media, matching d1-store.ts (avoids an N+1 style
        // lookup there; kept symmetric here so both backends behave the same way).
        ...publicBuildStoryFromSnapshot(snapshot, report.selectedPublicFields, {
          reflection: report.editorial.reflection,
          category: report.category,
        }, report.artifact, { storyBackgroundId: report.storyBackgroundId }),
        publishedAt: report.publication.publishedAt,
      };
    });
}

export function explorePublishedStories(query: {
  query?: string;
  category?: string;
  tools?: string[];
  models?: string[];
  hasDemo?: boolean;
  sort?: "newest" | "trending";
  limit?: number;
  cursor?: string;
}) {
  const sort = query.sort === "trending" ? "trending" : "newest";
  const normalizedQuery = query.query?.trim().toLocaleLowerCase("en-US") ?? "";
  const selectedTools = (query.tools ?? []).map((value) => value.toLocaleLowerCase("en-US"));
  const selectedModels = (query.models ?? []).map((value) => value.toLocaleLowerCase("en-US"));
  const indexed = Array.from(store.publicStoryIndex.entries()).flatMap(([reportId, entry]) => {
    const report = store.reports.get(reportId);
    const visibleStatus = report?.publication.status === "published" || report?.publication.status === "draft_changes";
    if (!report || !visibleStatus || !isLatestPublishedChapter(report, true)) return [];
    return [{ ...structuredClone(entry.story), reportId, publishedAt: report.publication.publishedAt, trendScore: getTrendingScoreForReport(reportId), publicSearchText: entry.searchText.toLocaleLowerCase("en-US") }];
  });
  type IndexedStory = (typeof indexed)[number];
  const matches = (story: IndexedStory, excludedFacet?: "category" | "tools" | "models" | "demo") => {
    const toolValues = [...story.stack, ...story.tools.map((tool) => tool.label)].map((value) => value.toLocaleLowerCase("en-US"));
    const modelValues = story.models.flatMap((model) => [model.id, model.label]).map((value) => value.toLocaleLowerCase("en-US"));
    return (!normalizedQuery || story.publicSearchText.includes(normalizedQuery))
      && (excludedFacet === "category" || !query.category || story.category === query.category)
      && (excludedFacet === "tools" || !selectedTools.length || selectedTools.some((tool) => toolValues.includes(tool)))
      && (excludedFacet === "models" || !selectedModels.length || selectedModels.some((model) => modelValues.includes(model)))
      && (excludedFacet === "demo" || !query.hasDemo || Boolean(story.artifactLinks.projectUrl));
  };
  const resultRows = indexed.filter((story) => matches(story));
  resultRows.sort((left, right) => compareExploreRows(left, right, sort));
  const decodedCursor = decodeExploreCursor(query.cursor);
  const cursorRows = resultRows.filter((story) => decodedCursor
    ? isAfterExploreCursor(story, decodedCursor, sort)
    : !query.cursor || (story.publishedAt ?? "") < query.cursor);
  const bounded = Math.min(Math.max(1, Math.trunc(query.limit ?? 30)), 100);
  const visible = cursorRows.slice(0, bounded);

  const categories = new Map<string, number>();
  for (const story of indexed.filter((item) => matches(item, "category"))) categories.set(story.category, (categories.get(story.category) ?? 0) + 1);
  const toolCounts = new Map<string, { label: string; count: number }>();
  for (const story of indexed.filter((item) => matches(item, "tools"))) {
    const storyTools = new Map([...story.stack, ...story.tools.map((tool) => tool.label)].map((value) => [value.toLocaleLowerCase("en-US"), value]));
    for (const [value, label] of storyTools) toolCounts.set(value, { label, count: (toolCounts.get(value)?.count ?? 0) + 1 });
  }
  const modelCalls = new Map<string, { label: string; weight: number }>();
  for (const story of indexed.filter((item) => matches(item, "models"))) {
    for (const model of story.models) {
      const current = modelCalls.get(model.id) ?? { label: model.label, weight: 0 };
      current.weight += model.requests;
      modelCalls.set(model.id, current);
    }
  }
  const totalModelCalls = Array.from(modelCalls.values()).reduce((sum, item) => sum + item.weight, 0);
  const modelShares = Array.from(modelCalls, ([value, item]) => ({ value, label: item.label, exact: totalModelCalls ? (item.weight * 100) / totalModelCalls : 0, share: 0 }));
  for (const item of modelShares) item.share = Math.floor(item.exact);
  let remainingModelShare = totalModelCalls ? 100 - modelShares.reduce((sum, item) => sum + item.share, 0) : 0;
  modelShares.sort((a, b) => (b.exact - Math.floor(b.exact)) - (a.exact - Math.floor(a.exact)) || a.value.localeCompare(b.value));
  for (const item of modelShares) { if (remainingModelShare <= 0) break; item.share += 1; remainingModelShare -= 1; }
  modelShares.sort((a, b) => b.share - a.share || a.value.localeCompare(b.value));
  const last = visible.at(-1);
  return {
    stories: visible.map(({ trendScore, publicSearchText, ...story }) => {
      void trendScore;
      void publicSearchText;
      return story;
    }),
    nextCursor: last && cursorRows.length > bounded ? encodeExploreCursor({ version: 1, sort, publishedAt: last.publishedAt ?? "", reportId: last.reportId, trendScore: last.trendScore }) : null,
    resultCount: resultRows.length,
    facets: {
      categories: Array.from(categories, ([value, count]) => ({ value, label: value.replaceAll("-", " "), count })),
      tools: Array.from(toolCounts, ([value, item]) => ({ value, label: item.label, count: item.count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)),
      models: modelShares.map(({ value, label, share }) => ({ value, label, requestShare: share })),
      liveDemoCount: indexed.filter((story) => matches(story, "demo") && Boolean(story.artifactLinks.projectUrl)).length,
    },
  };
}

/**
 * Public boundary: same projection as listPublishedStories, scoped to one owner.
 * Used to populate a builder's public profile page with their published stories.
 */
export function listStoriesByOwner(ownerUserId: string, limit = 30, cursor?: string) {
  const boundedLimit = Math.min(Math.max(1, Math.trunc(limit)), 100);
  return Array.from(store.reports.values())
    .filter((report) => report.publication.status === "published" && userIdForCreator(report.creatorId) === ownerUserId && isLatestPublishedChapter(report))
    .filter((report) => !cursor || (report.publication.publishedAt ?? "") < cursor)
    .sort((left, right) =>
      (right.publication.publishedAt ?? "").localeCompare(left.publication.publishedAt ?? ""),
    )
    .slice(0, boundedLimit)
    .map((report) => {
      const snapshot = structuredClone(report.snapshot);
      snapshot.identity.tagline = report.editorial.tagline;
      snapshot.identity.description = report.editorial.description;
      snapshot.identity.visibility = "public";
      return {
        ...publicBuildStoryFromSnapshot(snapshot, report.selectedPublicFields, {
          reflection: report.editorial.reflection,
          category: report.category,
        }, report.artifact, { storyBackgroundId: report.storyBackgroundId }),
        publishedAt: report.publication.publishedAt,
      };
    });
}

/** Public boundary: matches only against already-public editorial text and the owner's handle/display name, never source snapshot content. */
export function searchPublishedStories(query: string, limit = 20, cursor?: string) {
  const boundedLimit = Math.min(Math.max(1, Math.trunc(limit)), 50);
  const needle = query.trim().slice(0, 200).toLocaleLowerCase("en-US");
  if (needle.length < 2) return [];
  return Array.from(store.reports.values())
    .filter((report) => {
      if (report.publication.status !== "published") return false;
      if (!isLatestPublishedChapter(report)) return false;
      if (cursor && (report.publication.publishedAt ?? "") >= cursor) return false;
      const owner = store.users.get(userIdForCreator(report.creatorId) ?? "");
      const haystack = [
        report.editorial.tagline,
        report.editorial.description,
        owner?.handle ?? "",
        owner?.displayName ?? "",
      ]
        .join("\n")
        .toLocaleLowerCase("en-US");
      return haystack.includes(needle);
    })
    .sort((left, right) =>
      (right.publication.publishedAt ?? "").localeCompare(left.publication.publishedAt ?? ""),
    )
    .slice(0, boundedLimit)
    .map((report) => {
      const snapshot = structuredClone(report.snapshot);
      snapshot.identity.tagline = report.editorial.tagline;
      snapshot.identity.description = report.editorial.description;
      snapshot.identity.visibility = "public";
      return {
        ...publicBuildStoryFromSnapshot(snapshot, report.selectedPublicFields, {
          reflection: report.editorial.reflection,
        }, report.artifact, { storyBackgroundId: report.storyBackgroundId }),
        publishedAt: report.publication.publishedAt,
      };
    });
}

type UsageProjectList = Array<{
  ownerUserId: string;
  projectId: string;
  slug: string;
  commitCount: number;
  storyCount: number;
  verifiedRepoAt: string | null;
  maxChapterIndex: number;
  chapters: Array<{ chapterIndex: number; snapshot: unknown }>;
}>;

function listUsageProjects(include: "published" | "ready"): UsageProjectList {
  const byProject = new Map<string, Array<{ chapterIndex: number; snapshot: unknown }>>();
  for (const report of store.reports.values()) {
    const published = report.publication.status === "published" || report.publication.status === "draft_changes";
    if (include === "published" && !published) continue;
    if (include === "ready" && report.status !== "ready") continue;
    const chapters = byProject.get(report.projectId) ?? [];
    chapters.push({
      chapterIndex: report.publication.chapterIndex ?? chapters.length + 1,
      snapshot: report.sourceSnapshot ?? report.snapshot,
    });
    byProject.set(report.projectId, chapters);
  }
  return Array.from(store.projects.values())
    .filter((project) => byProject.has(project.id))
    .map((project) => {
      const chapters = (byProject.get(project.id) ?? []).sort((left, right) => left.chapterIndex - right.chapterIndex);
      return {
        ownerUserId: project.ownerUserId,
        projectId: project.id,
        slug: project.slug,
        commitCount: project.latestCommitCount,
        storyCount: chapters.length,
        verifiedRepoAt: project.verifiedRepoAt,
        maxChapterIndex: chapters.reduce((max, chapter) => Math.max(max, chapter.chapterIndex), 0),
        chapters,
      };
    });
}

/** Published (or draft_changes) chapters plus project totals - the usage leaderboard's raw input. */
export function listPublishedUsageProjects() {
  return listUsageProjects("published");
}

/** Ready chapters split so private usage can union unpublished onto published. */
export function listOwnerUsageChapterSets(): Array<{
  ownerUserId: string;
  projectId: string;
  published: Array<{ chapterIndex: number; snapshot: unknown }>;
  unpublished: Array<{ chapterIndex: number; snapshot: unknown }>;
}> {
  const byProject = new Map<string, { published: Array<{ chapterIndex: number; snapshot: unknown }>; unpublished: Array<{ chapterIndex: number; snapshot: unknown }> }>();
  for (const report of store.reports.values()) {
    if (report.status !== "ready") continue;
    const live = report.publication.status === "published" || report.publication.status === "draft_changes";
    const bucket = byProject.get(report.projectId) ?? { published: [], unpublished: [] };
    const target = live ? bucket.published : bucket.unpublished;
    target.push({
      chapterIndex: report.publication.chapterIndex ?? target.length + 1,
      snapshot: report.sourceSnapshot ?? report.snapshot,
    });
    byProject.set(report.projectId, bucket);
  }
  return Array.from(store.projects.values())
    .filter((project) => byProject.has(project.id))
    .map((project) => {
      const bucket = byProject.get(project.id)!;
      return {
        ownerUserId: project.ownerUserId,
        projectId: project.id,
        published: bucket.published.sort((left, right) => left.chapterIndex - right.chapterIndex),
        unpublished: bucket.unpublished.sort((left, right) => left.chapterIndex - right.chapterIndex),
      };
    });
}

/** Account export/deletion needs: everything owned by this user, keyed by the store's real user id rather than the creatorId ("google:<sub>") string used elsewhere. */
export function getAccountProjectsAndReports(userId: string): { projects: StoredProject[]; reports: GeneratedReport[] } {
  const user = store.users.get(userId);
  if (!user) return { projects: [], reports: [] };
  return {
    projects: Array.from(store.projects.values()).filter((project) => project.ownerUserId === userId),
    reports: Array.from(store.reports.values()).filter((report) => report.creatorId === user.authSubject),
  };
}

/** For the account export: the scanner records themselves - narrative generation results and upload session history, keyed by owner. */
export function getAccountScannerData(userId: string): { narratives: StoredNarrative[]; uploadSessions: StoredUploadSession[] } {
  return {
    narratives: Array.from(store.narratives.values()).filter((narrative) => narrative.ownerUserId === userId),
    uploadSessions: Array.from(store.sessions.values()).filter((session) => session.ownerUserId === userId),
  };
}

/**
 * Permanent, irreversible erasure - mirrors d1-store's deleteAccount:
 * reports/sessions/projects owned by this user are removed outright, not
 * merely orphaned.
 */
/** Returns the r2Keys of any deleted media so the caller can also remove the underlying R2 objects. */
export function deleteAccountData(userId: string): string[] {
  const user = store.users.get(userId);
  if (!user) return [];
  const orphanedR2Keys: string[] = [];
  for (const [id, media] of store.reportMedia) {
    if (media.ownerUserId === userId) {
      orphanedR2Keys.push(media.r2Key);
      store.reportMedia.delete(id);
    }
  }
  for (const [id, report] of store.reports) {
    if (report.creatorId === user.authSubject) {
      store.reports.delete(id);
      store.publicStoryIndex.delete(id);
    }
  }
  for (const [id, session] of store.sessions) {
    if (session.ownerUserId === userId) store.sessions.delete(id);
  }
  for (const [id, project] of store.projects) {
    if (project.ownerUserId === userId) store.projects.delete(id);
  }
  for (const key of store.guidance.keys()) {
    if (key.startsWith(`${userId}:`)) store.guidance.delete(key);
  }
  store.users.delete(userId);
  return orphanedR2Keys;
}

export function countPublicArchetypes(): PublicArchetypeCounts {
  const byKey: Record<string, number> = {};
  let total = 0;
  for (const entry of store.publicStoryIndex.values()) {
    const name = entry.story.profile?.archetype?.name;
    if (!name) continue;
    const key = archetypeFacetKey(name);
    byKey[key] = (byKey[key] ?? 0) + 1;
    total += 1;
  }
  return { total, byKey };
}

export type PortReportUiPage = {
  processed: number;
  hydrated: number;
  fieldsUpdated: number;
  republished: number;
  nextCursor: string | null;
  done: boolean;
};

export function portReportUi(cursor = "", limit = 5, dryRun = false, reportId?: string): PortReportUiPage {
  const reports = [...store.reports.values()]
    .filter((report) => report.status === "ready" && (!reportId || report.id === reportId))
    .sort((left, right) => left.id.localeCompare(right.id));
  const start = reportId || !cursor ? 0 : reports.findIndex((report) => report.id > cursor);
  const pageSize = reportId ? 1 : Math.max(1, Math.min(limit, 10));
  const slice = start < 0 ? [] : reports.slice(start, start + pageSize);
  let hydrated = 0;
  let fieldsUpdated = 0;
  let republished = 0;
  const now = new Date().toISOString();
  for (const report of slice) {
    const { next, plan } = planReportUiPort(report);
    if (plan.hydrateSnapshot) hydrated += 1;
    if (plan.updatePublicFields) fieldsUpdated += 1;
    if (plan.refreshPublicIndex) republished += 1;
    if (dryRun) continue;
    if (plan.hydrateSnapshot) report.snapshot = next.snapshot;
    if (plan.updatePublicFields) report.selectedPublicFields = next.selectedPublicFields;
    if (plan.refreshPublicIndex) {
      const publicStory = publicBuildStoryFromSnapshot(
        next.snapshot,
        next.selectedPublicFields,
        { tagline: report.editorial.tagline, description: report.editorial.description, reflection: report.editorial.reflection, category: report.category },
        { ...report.artifact, media: listReportMedia(report.id) },
        { storyBackgroundId: report.storyBackgroundId },
      );
      const publicStoryWithDelta = {
        ...publicStory,
        chapterDelta: report.chapterDelta ? publicChapterDelta(report.chapterDelta, next.selectedPublicFields) : null,
      };
      store.publicStoryIndex.set(report.id, {
        story: publicStoryWithDelta,
        category: publicStory.category,
        searchText: [publicStory.name, publicStory.tagline, publicStory.description, publicStory.owner.name, publicStory.owner.handle, publicStory.category, ...publicStory.stack, ...publicStory.tools.map((tool) => tool.label), ...publicStory.models.flatMap((model) => [model.id, model.label])].join(" ").slice(0, 12_000),
        hasLiveDemo: Boolean(publicStory.artifactLinks.projectUrl),
        updatedAt: now,
      });
      registerSocialReport(report.id, userIdForCreator(report.creatorId), report, publicStoryWithDelta);
    }
  }
  const nextCursor = slice.at(-1)?.id ?? null;
  return {
    processed: slice.length,
    hydrated,
    fieldsUpdated,
    republished,
    nextCursor,
    done: Boolean(reportId) || slice.length < pageSize,
  };
}

export function statusLabel(status: UploadSessionStatus) {
  return status.replaceAll("_", " ");
}
