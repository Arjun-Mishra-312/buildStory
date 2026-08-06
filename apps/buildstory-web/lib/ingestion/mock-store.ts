import { orbitNotesSnapshot } from "@/lib/mock-projects";
import { publicBuildStoryFromSnapshot } from "@/lib/build-story";
import { baseHandleFrom, baseSlugFrom, candidateHandles, candidateSlugs } from "@/lib/identity/handles";
import { isLoopbackHostname } from "@/lib/ingestion/local-api";
import { generateNarrative, narrativeProviderConfigured, NarrativeProviderError } from "@/lib/narrative/provider";
import { canUseCloudNarrative } from "@/lib/narrative/entitlement";
import { estimateCostMicroUsd } from "@/lib/narrative/pricing";
import { NARRATIVE_FIELD_LIMITS } from "@/lib/narrative/schema";
import { sanitizePublicText } from "@/lib/publication/sanitization";
import { registerProfile as registerSocialProfileRecord, registerReport as registerSocialReportRecord } from "@/lib/social/mock-store";
import type {
  DeviceAuthorization,
  GeneratedReport,
  LocalReportSummary,
  NarrativeRecord,
  NarrativeStatus,
  ProjectRecord,
  ProjectScanStats,
  PublicFieldKey,
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
};

type StoredProject = ProjectRecord & {
  fingerprintBasis: string;
  storyCount: number;
  latestSessionCount: number;
  latestCommitCount: number;
  latestActiveDays: number;
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
  observability: NarrativeRecord["observability"];
  fallbacksUsed: string[];
  inputTokens: number;
  outputTokens: number;
  costMicroUsd: number;
  attempts: number;
};

type StoredBudget = {
  spentMicroUsd: number;
  capMicroUsd: number;
};

type MockStore = {
  sessions: Map<string, StoredUploadSession>;
  reports: Map<string, GeneratedReport>;
  users: Map<string, StoredUser>;
  projects: Map<string, StoredProject>;
  narratives: Map<string, StoredNarrative>;
  llmBudgets: Map<string, StoredBudget>;
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
  const user: StoredUser = {
    id: userId,
    authSubject: creatorId,
    email: "dev@buildstory.local",
    handle: "minabuilds",
    handleLower: "minabuilds",
    displayName: "Mina Park",
    avatarUrl: null,
    bio: "Independent product engineer",
    role: "member",
    status: "active",
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
  };
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
    ],
    editorial: {
      tagline: orbitNotesSnapshot.identity.tagline,
      description: orbitNotesSnapshot.identity.description,
      reflection:
        "AI made it cheap to explore three architectures. Tester feedback made it obvious which one deserved to survive.",
    },
    publication: {
      status: "published",
      slug: orbitNotesSnapshot.identity.slug,
      publishedAt: orbitNotesSnapshot.timeWindow.endedAt,
      publicUrl: `/p/${orbitNotesSnapshot.identity.slug}`,
    },
    narrative: null,
  };
  const session: StoredUploadSession = {
    id: sessionId,
    creatorId,
    ownerUserId: userId,
    projectLabel: orbitNotesSnapshot.identity.name,
    narrativeModel: null,
    narrativeMode: "cloud",
    status: "report_ready",
    createdAt: orbitNotesSnapshot.provenance.scannedAt,
    expiresAt: orbitNotesSnapshot.provenance.scannedAt,
    scannerAuthorizedAt: orbitNotesSnapshot.provenance.scannedAt,
    snapshotReceivedAt: orbitNotesSnapshot.provenance.scannedAt,
    reportId,
    statusDetail: "Private report ready for review.",
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
  return {
    sessions: new Map([[sessionId, session]]),
    reports: new Map([[reportId, report]]),
    users: new Map([[userId, user]]),
    projects: new Map([[projectId, project]]),
    narratives: new Map(),
    llmBudgets: new Map(),
  };
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
  return {
    id: session.id,
    creatorId: session.creatorId,
    projectLabel: session.projectLabel,
    narrativeModel: session.narrativeModel,
    narrativeMode: session.narrativeMode,
    status: session.status,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    scannerAuthorizedAt: session.scannerAuthorizedAt,
    snapshotReceivedAt: session.snapshotReceivedAt,
    reportId: session.reportId,
    statusDetail: session.statusDetail,
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
    role: user.role,
  });
}

function userIdForCreator(creatorId: string): string | null {
  return Array.from(store.users.values()).find((candidate) => candidate.authSubject === creatorId)?.id ?? null;
}

/** Keeps the (separately module-scoped) social mock store's shadow report record in sync. */
function registerSocialReport(reportId: string, ownerUserId: string | null, report: GeneratedReport) {
  registerSocialReportRecord({
    id: reportId,
    ownerUserId,
    publicationStatus: report.publication.status,
    publicationSlug: report.publication.slug,
    editorialTagline: report.editorial.tagline,
    publishedAt: report.publication.publishedAt,
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
    existing.displayName = session.name;
    existing.avatarUrl = session.image;
    registerSocialProfile(existing);
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
      role: "member",
      status: "active",
    };
    store.users.set(user.id, user);
    registerSocialProfile(user);
    return user;
  }
  throw new MockIngestionError("handle_generation_failed", "Could not allocate a handle for this account.", 500);
}

function ensureProject(ownerUserId: string, fingerprint: string, fingerprintBasis: string, stats: ProjectScanStats): ProjectRecord {
  const existing = Array.from(store.projects.values()).find(
    (candidate) => candidate.ownerUserId === ownerUserId && candidate.repositoryFingerprint === fingerprint,
  );
  if (existing) {
    existing.storyCount += 1;
    existing.latestSessionCount = stats.sessionCount;
    existing.latestCommitCount = stats.commitCount;
    existing.latestActiveDays = stats.activeDays;
    return existing;
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
    };
    store.projects.set(project.id, project);
    return project;
  }
  throw new MockIngestionError("project_slug_generation_failed", "Could not allocate a project slug for this repository.", 500);
}

const DEFAULT_MONTHLY_LLM_CAP_MICRO_USD = 1_000_000; // $1.00/month/user, subsidized default - mirrors d1-store.ts.

function currentBudgetPeriodKey(): string {
  return new Date().toISOString().slice(0, 7); // "YYYY-MM", UTC.
}

function hasNarrativeBudget(ownerUserId: string): boolean {
  const budget = store.llmBudgets.get(`${ownerUserId}:${currentBudgetPeriodKey()}`);
  if (!budget) return true;
  return budget.spentMicroUsd < budget.capMicroUsd;
}

function recordNarrativeSpend(ownerUserId: string, costMicroUsd: number) {
  const key = `${ownerUserId}:${currentBudgetPeriodKey()}`;
  const existing = store.llmBudgets.get(key);
  if (existing) {
    existing.spentMicroUsd += costMicroUsd;
  } else {
    store.llmBudgets.set(key, { spentMicroUsd: costMicroUsd, capMicroUsd: DEFAULT_MONTHLY_LLM_CAP_MICRO_USD });
  }
}

function createNarrativeJob(reportId: string, ownerUserId: string) {
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
      throw new NarrativeProviderError("llm_not_entitled", "Cloud narrative generation is not enabled for this account.");
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
    narrative.observability = {
      providerCounts: Object.fromEntries(report.sourceSnapshot?.sourceSelection.providers.map((item) => [item.provider, item.sessionsIncluded]) ?? []),
      promptVersion: "narrative-v2",
      schemaVersion: report.sourceSnapshot?.schemaVersion ?? "1.5.0",
      generationLatencyMs: 0,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costMicroUsd: estimateCostMicroUsd(result.model, result.inputTokens, result.outputTokens),
      invalidReferenceCount: result.invalidReferenceCount,
      fallbackCount: result.fallbacksUsed.length,
    };
    narrative.fallbacksUsed = result.fallbacksUsed;
    narrative.inputTokens = result.inputTokens;
    narrative.outputTokens = result.outputTokens;
    narrative.costMicroUsd = estimateCostMicroUsd(result.model, result.inputTokens, result.outputTokens);
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
        }
      : undefined;
    narrative.status = "ready";
    recordNarrativeSpend(narrative.ownerUserId, narrative.costMicroUsd);
  } catch {
    narrative.status = narrative.attempts >= 3 ? "failed" : "queued";
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
    sections: narrative.sections,
    storyPack: narrative.storyPack,
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
  narrativeMode: "local" | "cloud" | "off" = "cloud",
): Promise<{ session: UploadSessionView; deviceAuthorization: DeviceAuthorization }> {
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 15 * 60_000);
  const id = makeId("upl");
  const deviceCode = makeDeviceCode();
  const session: StoredUploadSession = {
    id,
    creatorId,
    ownerUserId,
    projectLabel: projectLabel.trim().slice(0, 120) || "New local project",
    narrativeModel,
    narrativeMode,
    status: "awaiting_scanner",
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    scannerAuthorizedAt: null,
    snapshotReceivedAt: null,
    reportId: null,
    statusDetail: "Waiting for a scanner to claim the one-time connection code.",
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
  const commandHint = `buildstory connect "${id}" --code "${deviceCode}" --api-base-url "${normalizedApiBaseUrl}"${allowHostFlag}`;
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
        "buildstory scan-upload --repo . --consent local-scan --upload-consent local-dashboard",
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
  narrativeModes?: Array<"local" | "cloud" | "off">,
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
    ...(narrativeModes ? { narrative: { mode: session.narrativeMode, model: session.narrativeModel } } : {}),
  };
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

  const acceptedAt = new Date().toISOString();
  const reportId = makeId("rpt");
  const receiptId = makeId("rcpt");
  const reportSnapshot = reportSnapshotFromScanner(validated.snapshot, project, {
    id: user.id,
    name: user.displayName,
    handle: user.handle,
    role: user.bio ?? "AI-assisted software builder",
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
    selectedPublicFields: [
      "tagline",
      "description",
      "timeWindow",
      "sessionSummary",
      "milestones",
      "modelMix",
      "gitAggregates",
      "redactionSummary",
    ],
    editorial: {
      tagline: reportSnapshot.identity.tagline,
      description: reportSnapshot.identity.description,
      reflection: "",
    },
    publication: {
      status: "not_published",
      slug: reportSnapshot.identity.slug,
      publishedAt: null,
      publicUrl: null,
    },
    narrative: null,
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
      observability: null,
      fallbacksUsed: validated.snapshot.generatedNarrative.fallbacksUsed,
      inputTokens: 0,
      outputTokens: 0,
      costMicroUsd: 0,
      attempts: 0,
    });
  } else if (session.narrativeMode === "local") {
    store.narratives.set(reportId, {
      id: makeId("nar"),
      reportId,
      ownerUserId: user.id,
      mode: "local",
      provider: "ollama",
      model: session.narrativeModel ?? "auto",
      status: "failed",
      sections: null,
      storyPack: null,
      observability: null,
      fallbacksUsed: [],
      inputTokens: 0,
      outputTokens: 0,
      costMicroUsd: 0,
      attempts: 0,
    });
  } else if (validated.snapshot.narrativeEvidence && validated.snapshot.narrativeEvidence.excerpts.length > 0) {
    createNarrativeJob(reportId, user.id);
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
  return { ...structuredClone(report), narrative: narrativeRecordFor(reportId) };
}

export function updateReport(
  creatorId: string,
  reportId: string,
  update: {
    selectedPublicFields?: PublicFieldKey[];
    editorial?: Partial<GeneratedReport["editorial"]>;
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
    const allowed: PublicFieldKey[] = [
      "tagline",
      "description",
      "timeWindow",
      "sessionSummary",
      "milestones",
      "modelMix",
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
      "decisionPatterns",
      "standoutTraits",
      "growthEdge",
    ];
    const unique = [...new Set(update.selectedPublicFields)];
    if (unique.some((field) => !allowed.includes(field))) {
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
  if (report.publication.status === "published") {
    report.publication.status = "draft_changes";
  }
  registerSocialReport(reportId, userIdForCreator(creatorId), report);
  return { ...structuredClone(report), narrative: narrativeRecordFor(reportId) };
}

export function publishReport(creatorId: string, reportId: string): GeneratedReport {
  const report = store.reports.get(reportId);
  if (!report || report.creatorId !== creatorId) {
    throw new MockIngestionError("not_found", "Report not found.", 404);
  }
  if (report.status !== "ready") {
    throw new MockIngestionError("report_not_ready", "Report is not ready to publish.", 409);
  }
  if (!report.selectedPublicFields.includes("tagline")) {
    throw new MockIngestionError("missing_public_field", "A public tagline is required.", 422);
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
  for (const other of store.reports.values()) {
    if (other.id !== reportId && other.projectId === report.projectId && other.publication.status === "published") {
      other.publication.status = "draft_changes";
      other.publication.publishedAt = null;
      other.publication.publicUrl = null;
    }
  }
  const owner = store.users.get(userIdForCreator(creatorId) ?? "");
  report.publication.status = "published";
  report.publication.publishedAt = new Date().toISOString();
  report.publication.publicUrl = `${publicOrigin()}/u/${owner?.handle ?? report.snapshot.identity.owner.handle}/${report.publication.slug}`;
  registerSocialReport(reportId, userIdForCreator(creatorId), report);
  return { ...structuredClone(report), narrative: narrativeRecordFor(reportId) };
}

export function unpublishReport(creatorId: string, reportId: string): GeneratedReport {
  const report = store.reports.get(reportId);
  if (!report || report.creatorId !== creatorId || report.publication.status !== "published") throw new MockIngestionError("not_published", "Published report not found.", 404);
  report.publication.status = "not_published";
  report.publication.publishedAt = null;
  report.publication.publicUrl = null;
  return { ...structuredClone(report), narrative: narrativeRecordFor(reportId) };
}

export function publicationStatusForProject(creatorId: string, projectId: string) {
  const report = Array.from(store.reports.values()).find(
    (candidate) => candidate.creatorId === creatorId && candidate.projectId === projectId,
  );
  return report ? structuredClone(report.publication) : null;
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

/** Public boundary: callers receive only the selected projection, never report state. */
export function getPublishedStoryBySlug(slug: string) {
  const report = Array.from(store.reports.values()).find(
    (candidate) =>
      candidate.publication.slug === slug &&
      candidate.publication.status === "published",
  );
  if (!report) return null;
  const snapshot = structuredClone(report.snapshot);
  snapshot.identity.tagline = report.editorial.tagline;
  snapshot.identity.description = report.editorial.description;
  snapshot.identity.visibility = "public";
  return publicBuildStoryFromSnapshot(snapshot, report.selectedPublicFields, {
    reflection: report.editorial.reflection,
  });
}

export function getPublishedStory(handle: string, slug: string) {
  const report = Array.from(store.reports.values()).find((candidate) => {
    const owner = store.users.get(userIdForCreator(candidate.creatorId) ?? "");
    return owner?.handleLower === handle.toLocaleLowerCase("en-US") && candidate.publication.slug === slug && candidate.publication.status === "published";
  });
  if (!report) return null;
  const snapshot = structuredClone(report.snapshot);
  snapshot.identity.tagline = report.editorial.tagline;
  snapshot.identity.description = report.editorial.description;
  snapshot.identity.visibility = "public";
  return { ...publicBuildStoryFromSnapshot(snapshot, report.selectedPublicFields, { reflection: report.editorial.reflection }), reportId: report.id };
}

/** IDs only, for social features (reactions/comments) to key off of - never content. */
export function getPublicStoryIdentity(slug: string): { reportId: string; ownerUserId: string | null } | null {
  const report = Array.from(store.reports.values()).find(
    (candidate) => candidate.publication.slug === slug && candidate.publication.status === "published",
  );
  return report ? { reportId: report.id, ownerUserId: userIdForCreator(report.creatorId) } : null;
}

export function getPublicStoryIdentityByReportId(reportId: string) {
  const report = store.reports.get(reportId);
  return report && report.publication.status === "published" ? { reportId: report.id, ownerUserId: userIdForCreator(report.creatorId) } : null;
}

export function listPublishedStories(limit = 30, cursor?: string) {
  const boundedLimit = Math.min(Math.max(1, Math.trunc(limit)), 100);
  return Array.from(store.reports.values())
    .filter((report) => report.publication.status === "published")
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
        }),
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
        }),
        publishedAt: report.publication.publishedAt,
      };
    });
}

/** Verified-provenance stats per project that has at least one published report - the leaderboard's raw input. */
export function listProjectStatsForLeaderboard(): Array<{
  ownerUserId: string;
  latestCommitCount: number;
  latestActiveDays: number;
}> {
  const publishedProjectIds = new Set(
    Array.from(store.reports.values())
      .filter((report) => report.publication.status === "published")
      .map((report) => report.projectId),
  );
  return Array.from(store.projects.values())
    .filter((project) => publishedProjectIds.has(project.id))
    .map((project) => ({
      ownerUserId: project.ownerUserId,
      latestCommitCount: project.latestCommitCount,
      latestActiveDays: project.latestActiveDays,
    }));
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

/**
 * Permanent, irreversible erasure - mirrors d1-store's deleteAccount:
 * reports/sessions/projects owned by this user are removed outright, not
 * merely orphaned.
 */
export function deleteAccountData(userId: string): void {
  const user = store.users.get(userId);
  if (!user) return;
  for (const [id, report] of store.reports) {
    if (report.creatorId === user.authSubject) store.reports.delete(id);
  }
  for (const [id, session] of store.sessions) {
    if (session.ownerUserId === userId) store.sessions.delete(id);
  }
  for (const [id, project] of store.projects) {
    if (project.ownerUserId === userId) store.projects.delete(id);
  }
  store.users.delete(userId);
}

export function statusLabel(status: UploadSessionStatus) {
  return status.replaceAll("_", " ");
}
