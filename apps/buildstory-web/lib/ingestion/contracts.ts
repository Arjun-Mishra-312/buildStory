import type { ProjectSnapshot } from "@/lib/project-snapshot";
import type { ScannerProjectSnapshot } from "./scanner-project-snapshot";

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
  | "toolUsage"
  | "gitAggregates"
  | "redactionSummary";

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
  };
};

export type LocalUploadGrant = {
  bearerToken: string;
  snapshotEndpoint: string;
  expiresAt: string;
  schemaVersion: "1.0.0";
  maxBytes: number;
};

export type LocalConnectResponse = {
  protocolVersion: "1.0";
  status: "connected";
  uploadSessionId: string;
  connectionId: string;
  uploadGrant: LocalUploadGrant;
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
