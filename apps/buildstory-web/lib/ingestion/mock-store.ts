import { orbitNotesSnapshot } from "@/lib/mock-projects";
import { publicBuildStoryFromSnapshot } from "@/lib/build-story";
import { sanitizePublicText } from "@/lib/publication/sanitization";
import type {
  DeviceAuthorization,
  GeneratedReport,
  LocalReportSummary,
  PublicFieldKey,
  ScannerClaimResponse,
  SnapshotUploadReceipt,
  UploadSessionStatus,
  UploadSessionView,
} from "./contracts";
import { reportSnapshotFromScanner } from "./report-adapter";
import type { ScannerProjectSnapshot } from "./scanner-project-snapshot";
import { PROJECT_SNAPSHOT_SCHEMA_VERSION } from "./scanner-project-snapshot";
import {
  MAX_SNAPSHOT_BYTES,
  validateProjectSnapshot,
} from "./validation";

type StoredUploadSession = UploadSessionView & {
  deviceCodeHash: string;
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

type MockStore = {
  sessions: Map<string, StoredUploadSession>;
  reports: Map<string, GeneratedReport>;
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
  const report: GeneratedReport = {
    id: reportId,
    creatorId,
    projectId: orbitNotesSnapshot.identity.id,
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
  };
  const session: StoredUploadSession = {
    id: sessionId,
    creatorId,
    projectLabel: orbitNotesSnapshot.identity.name,
    status: "report_ready",
    createdAt: orbitNotesSnapshot.provenance.scannedAt,
    expiresAt: orbitNotesSnapshot.provenance.scannedAt,
    scannerAuthorizedAt: orbitNotesSnapshot.provenance.scannedAt,
    snapshotReceivedAt: orbitNotesSnapshot.provenance.scannedAt,
    reportId,
    statusDetail: "Private report ready for review.",
    deviceCodeHash: "used-seed",
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
  };
}

const store =
  storeGlobal.__buildstoryMockIngestion ??
  (storeGlobal.__buildstoryMockIngestion = createSeedStore());

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

export function listUploadSessions(creatorId: string): UploadSessionView[] {
  return Array.from(store.sessions.values())
    .filter((session) => session.creatorId === creatorId)
    .map((session) => {
      refreshLifecycle(session);
      return cleanSession(session);
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createUploadSession(
  creatorId: string,
  projectLabel = "New local project",
  apiBaseUrl = "http://localhost:3000/",
): Promise<{ session: UploadSessionView; deviceAuthorization: DeviceAuthorization }> {
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 15 * 60_000);
  const id = makeId("upl");
  const deviceCode = makeDeviceCode();
  const session: StoredUploadSession = {
    id,
    creatorId,
    projectLabel: projectLabel.trim().slice(0, 120) || "New local project",
    status: "awaiting_scanner",
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    scannerAuthorizedAt: null,
    snapshotReceivedAt: null,
    reportId: null,
    statusDetail: "Waiting for a scanner to claim the one-time connection code.",
    deviceCodeHash: await hashToken(deviceCode),
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
  const commandHint = `buildstory connect "${id}" --code "${deviceCode}" --api-base-url "${normalizedApiBaseUrl}"`;
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
): Promise<ScannerClaimResponse> {
  const session = store.sessions.get(sessionId);
  if (
    !session ||
    session.deviceCodeHash !== (await hashToken(userCode.trim().toUpperCase()))
  ) {
    throw new MockIngestionError("invalid_device_code", "Connection code is invalid.", 401);
  }
  if (Date.parse(session.expiresAt) <= Date.now()) {
    session.status = "expired";
    session.statusDetail = "Connection code expired before the scanner claimed it.";
    throw new MockIngestionError("session_expired", "Upload session expired.", 410);
  }
  if (session.deviceCodeClaimedAt) {
    throw new MockIngestionError("device_code_used", "Connection code has already been used.", 409);
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

  const acceptedAt = new Date().toISOString();
  const reportId = makeId("rpt");
  const receiptId = makeId("rcpt");
  const reportSnapshot = reportSnapshotFromScanner(
    validated.snapshot,
    session.creatorId,
  );
  session.uploadTokenConsumedAt = acceptedAt;
  session.uploadReceiptId = receiptId;
  session.snapshotDigest = snapshotDigest;
  session.snapshot = validated.snapshot;
  session.snapshotReceivedAt = acceptedAt;
  session.queuedAt = acceptedAt;
  session.reportId = reportId;
  session.status = "queued";
  session.statusDetail = "Snapshot validated and queued for report generation.";

  store.reports.set(reportId, {
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
  });

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

export function getReport(creatorId: string, reportId: string): GeneratedReport {
  const report = store.reports.get(reportId);
  if (!report || report.creatorId !== creatorId) {
    throw new MockIngestionError("not_found", "Report not found.", 404);
  }
  const session = store.sessions.get(report.uploadSessionId);
  if (session) refreshLifecycle(session);
  return structuredClone(report);
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
  return structuredClone(report);
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
  report.publication.status = "published";
  report.publication.publishedAt = new Date().toISOString();
  report.publication.publicUrl = `${publicOrigin()}/p/${report.publication.slug}`;
  return structuredClone(report);
}

export function publicationStatusForProject(creatorId: string, projectId: string) {
  const report = Array.from(store.reports.values()).find(
    (candidate) => candidate.creatorId === creatorId && candidate.projectId === projectId,
  );
  return report ? structuredClone(report.publication) : null;
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
  return publicBuildStoryFromSnapshot(snapshot, report.selectedPublicFields);
}

export function statusLabel(status: UploadSessionStatus) {
  return status.replaceAll("_", " ");
}
