import type {
  GeneratedReport,
  PublicFieldKey,
  UploadSessionStatus,
} from "./contracts";
import type { NarrativeMode } from "./scanner-project-snapshot";

type CreatorIdentity = { creatorId: string; name: string; email: string; image: string | null };

function shouldUseDurableStore() {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.BUILDSTORY_STORE === "d1"
  );
}

async function backend() {
  if (shouldUseDurableStore()) return import("./d1-store");
  return import("./mock-store");
}

export async function listUploadSessions(creatorId: string, limit?: number, cursor?: string) {
  return (await backend()).listUploadSessions(creatorId, limit, cursor);
}

export async function createUploadSession(
  creatorId: string,
  projectLabel = "New local project",
  apiBaseUrl = "http://localhost:3000/",
  ownerUserId: string | null = null,
  narrativeModel: string | null = null,
  narrativeMode: NarrativeMode = "cloud",
) {
  return (await backend()).createUploadSession(
    creatorId,
    projectLabel,
    apiBaseUrl,
    ownerUserId,
    narrativeModel,
    narrativeMode,
  );
}

export async function ensureUser(session: CreatorIdentity) {
  return (await backend()).ensureUser(session);
}

export async function getUploadSession(creatorId: string, sessionId: string) {
  return (await backend()).getUploadSession(creatorId, sessionId);
}

export async function claimUploadSession(sessionId: string, userCode: string, narrativeModes?: NarrativeMode[]) {
  return (await backend()).claimUploadSession(sessionId, userCode, narrativeModes);
}

export async function acceptSnapshot(
  sessionId: string,
  bearerToken: string,
  snapshotDigest: string,
  value: unknown,
) {
  return (await backend()).acceptSnapshot(
    sessionId,
    bearerToken,
    snapshotDigest,
    value,
  );
}

export async function getLocalUploadStatus(
  sessionId: string,
  bearerToken: string,
) {
  return (await backend()).getLocalUploadStatus(sessionId, bearerToken);
}

export async function getLocalReport(reportId: string, bearerToken: string) {
  return (await backend()).getLocalReport(reportId, bearerToken);
}

export async function getReport(creatorId: string, reportId: string) {
  return (await backend()).getReport(creatorId, reportId);
}

export async function updateReport(
  creatorId: string,
  reportId: string,
  update: {
    selectedPublicFields?: PublicFieldKey[];
    editorial?: Partial<GeneratedReport["editorial"]>;
  },
) {
  return (await backend()).updateReport(creatorId, reportId, update);
}

export async function publishReport(creatorId: string, reportId: string) {
  return (await backend()).publishReport(creatorId, reportId);
}

export async function unpublishReport(creatorId: string, reportId: string) {
  return (await backend()).unpublishReport(creatorId, reportId);
}

export async function publicationStatusForProject(
  creatorId: string,
  projectId: string,
) {
  return (await backend()).publicationStatusForProject(creatorId, projectId);
}

export async function renameProjectSlug(
  creatorId: string,
  projectId: string,
  slug: string,
) {
  return (await backend()).renameProjectSlug(creatorId, projectId, slug);
}

export async function getPublishedStoryBySlug(slug: string) {
  return (await backend()).getPublishedStoryBySlug(slug);
}

export async function getPublishedStory(handle: string, slug: string) {
  return (await backend()).getPublishedStory(handle, slug);
}

export async function getPublicStoryIdentity(slug: string) {
  return (await backend()).getPublicStoryIdentity(slug);
}

export async function getPublicStoryIdentityByReportId(reportId: string) {
  return (await backend()).getPublicStoryIdentityByReportId(reportId);
}

export async function listPublishedStories(limit?: number, cursor?: string) {
  return (await backend()).listPublishedStories(limit, cursor);
}

export async function searchPublishedStories(query: string, limit?: number, cursor?: string) {
  return (await backend()).searchPublishedStories(query, limit, cursor);
}

export function statusLabel(status: UploadSessionStatus) {
  return status.replaceAll("_", " ");
}
