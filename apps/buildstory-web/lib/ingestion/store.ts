import type {
  BillingUpdate,
  FeatureBudgetName,
  GeneratedReport,
  PublicFieldKey,
  ReportMediaKind,
  UploadSessionStatus,
} from "./contracts";
import type { BuilderRole } from "@/lib/identity/builder-roles";
import type { GuideKey, GuideState } from "@/lib/guidance/contracts";
import type { ArtifactLinksUpdate } from "./artifact-links";
import type { NarrativeMode, NarrativeProvider } from "./scanner-project-snapshot";

type CreatorIdentity = { creatorId: string; name: string; email: string; image: string | null };

/**
 * Exported so UI copy can describe storage truthfully without re-deriving the
 * rule. A page that hardcodes "local development is disposable" is wrong the
 * moment it renders on a hosted deployment.
 */
export function shouldUseDurableStore() {
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
  targetProjectId: string | null = null,
  narrativeProvider: NarrativeProvider | null = null,
) {
  return (await backend()).createUploadSession(
    creatorId,
    projectLabel,
    apiBaseUrl,
    ownerUserId,
    narrativeModel,
    narrativeMode,
    targetProjectId,
    narrativeProvider,
  );
}

export async function listProjects(creatorId: string) {
  return (await backend()).listProjects(creatorId);
}

export async function getProjectDetail(creatorId: string, projectId: string) {
  return (await backend()).getProjectDetail(creatorId, projectId);
}

export async function ensureUser(session: CreatorIdentity) {
  return (await backend()).ensureUser(session);
}

export async function findUserByIdentity(provider: string, subject: string) {
  return (await backend()).findUserByIdentity(provider, subject);
}

export async function findUserByVerifiedEmail(email: string) {
  return (await backend()).findUserByVerifiedEmail(email);
}

export async function linkIdentity(userId: string, provider: string, subject: string, email: string) {
  return (await backend()).linkIdentity(userId, provider, subject, email);
}

export async function markEmailVerified(userId: string) {
  return (await backend()).markEmailVerified(userId);
}

export async function getBillingProfile(userId: string) {
  return (await backend()).getBillingProfile(userId);
}

export async function findUserIdByStripeCustomerId(stripeCustomerId: string) {
  return (await backend()).findUserIdByStripeCustomerId(stripeCustomerId);
}

export async function applyBillingUpdate(userId: string, update: BillingUpdate) {
  return (await backend()).applyBillingUpdate(userId, update);
}

export async function getFeatureBudgetCount(userId: string, feature: FeatureBudgetName) {
  return (await backend()).getFeatureBudgetCount(userId, feature);
}

export async function incrementFeatureBudget(userId: string, feature: FeatureBudgetName) {
  return (await backend()).incrementFeatureBudget(userId, feature);
}

export async function createHighlight(userId: string, reportId: string) {
  return (await backend()).createHighlight(userId, reportId);
}

export async function getActiveHighlights(limit?: number) {
  return (await backend()).getActiveHighlights(limit);
}

export async function getIdentityForUser(userId: string, provider: string) {
  return (await backend()).getIdentityForUser(userId, provider);
}

export async function getProjectForVerification(creatorId: string, projectId: string) {
  return (await backend()).getProjectForVerification(creatorId, projectId);
}

export async function markProjectRepoVerified(creatorId: string, projectId: string) {
  return (await backend()).markProjectRepoVerified(creatorId, projectId);
}

export async function getPublicProjectVerification(handle: string, slug: string) {
  return (await backend()).getPublicProjectVerification(handle, slug);
}

export async function updateProfile(
  userId: string,
  update: { bio?: string; displayName?: string; handle?: string; builderRole?: BuilderRole | null },
) {
  return (await backend()).updateProfile(userId, update);
}

export async function completeOnboarding(
  userId: string,
  update: { displayName: string; handle: string; bio?: string | null; builderRole?: BuilderRole | null },
) {
  return (await backend()).completeOnboarding(userId, update);
}

export async function listGuidance(userId: string) {
  return (await backend()).listGuidance(userId);
}

export async function setGuidance(userId: string, guideKey: GuideKey, guideVersion: number, state: GuideState) {
  return (await backend()).setGuidance(userId, guideKey, guideVersion, state);
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
    artifact?: ArtifactLinksUpdate;
    category?: GeneratedReport["category"];
    storyBackgroundId?: GeneratedReport["storyBackgroundId"];
  },
) {
  return (await backend()).updateReport(creatorId, reportId, update);
}

export async function listReportMedia(reportId: string) {
  return (await backend()).listReportMedia(reportId);
}

export async function canReadReportMedia(r2Key: string, creatorId: string | null) {
  return (await backend()).canReadReportMedia(r2Key, creatorId);
}

export async function addReportMedia(
  creatorId: string,
  reportId: string,
  media: { r2Key: string; contentType: string; byteSize: number; kind: ReportMediaKind },
) {
  return (await backend()).addReportMedia(creatorId, reportId, media);
}

export async function deleteReportMedia(creatorId: string, mediaId: string) {
  return (await backend()).deleteReportMedia(creatorId, mediaId);
}

export async function publishReport(creatorId: string, reportId: string) {
  return (await backend()).publishReport(creatorId, reportId);
}

export async function unpublishReport(creatorId: string, reportId: string) {
  return (await backend()).unpublishReport(creatorId, reportId);
}

export async function moderatorUnpublishReport(reportId: string) {
  return (await backend()).moderatorUnpublishReport(reportId);
}

export async function setUserRoleByHandle(handle: string, role: "member" | "moderator" | "admin") {
  return (await backend()).setUserRoleByHandle(handle, role);
}

export async function setUserStatusById(userId: string, status: "active" | "suspended") {
  return (await backend()).setUserStatusById(userId, status);
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

export async function getPublishedStoryChapter(handle: string, slug: string, chapterIndex: number) {
  return (await backend()).getPublishedStoryChapter(handle, slug, chapterIndex);
}

export async function listPublishedChapters(handle: string, slug: string) {
  return (await backend()).listPublishedChapters(handle, slug);
}

export async function getPublicStoryIdentity(slug: string) {
  return (await backend()).getPublicStoryIdentity(slug);
}

export async function getPublicStoryIdentityByReportId(reportId: string) {
  return (await backend()).getPublicStoryIdentityByReportId(reportId);
}

export async function listPublishedReportIdsForProject(projectId: string) {
  return (await backend()).listPublishedReportIdsForProject(projectId);
}

export async function listPublishedStories(limit?: number, cursor?: string) {
  return (await backend()).listPublishedStories(limit, cursor);
}

export async function listStoriesByOwner(ownerUserId: string, limit?: number, cursor?: string) {
  return (await backend()).listStoriesByOwner(ownerUserId, limit, cursor);
}

export async function searchPublishedStories(query: string, limit?: number, cursor?: string) {
  return (await backend()).searchPublishedStories(query, limit, cursor);
}

export type ExploreQuery = {
  query?: string;
  category?: string;
  tools?: string[];
  models?: string[];
  hasDemo?: boolean;
  sort?: "newest" | "trending";
  limit?: number;
  cursor?: string;
};

export async function explorePublishedStories(query: ExploreQuery = {}) {
  return (await backend()).explorePublishedStories(query);
}

export function statusLabel(status: UploadSessionStatus) {
  return status.replaceAll("_", " ");
}
