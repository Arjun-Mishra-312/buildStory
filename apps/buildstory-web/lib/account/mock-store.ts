import { getR2, MediaStorageUnavailableError } from "@/db/r2";
import { deleteAccountData, getAccountProjectsAndReports, listReportMedia } from "@/lib/ingestion/mock-store";
import { deleteAccountSocialData, getAccountSocialData, getProfile } from "@/lib/social/mock-store";
import { AccountError, type AccountExport } from "./contracts";

export function exportAccountData(userId: string): AccountExport {
  const profile = getProfile(userId);
  if (!profile) throw new AccountError("not_found", "Account not found.", 404);
  const { projects, reports } = getAccountProjectsAndReports(userId);
  const social = getAccountSocialData(userId);
  const media = reports.flatMap((report) => listReportMedia(report.id));
  return {
    exportedAt: new Date().toISOString(),
    profile: {
      id: profile.id,
      handle: profile.handle,
      displayName: profile.displayName,
      email: "",
      bio: profile.bio,
      createdAt: "",
    },
    projects: projects.map((project) => ({
      id: project.id,
      slug: project.slug,
      name: project.name,
      latestCommitCount: project.latestCommitCount,
      latestActiveDays: project.latestActiveDays,
    })),
    reports: reports.map((report) => ({
      id: report.id,
      status: report.status,
      publicationStatus: report.publication.status,
      publicationSlug: report.publication.slug,
      editorialTagline: report.editorial.tagline,
      createdAt: report.createdAt,
      publishedAt: report.publication.publishedAt,
    })),
    commentsAuthored: social.commentsAuthored,
    reactionsGiven: social.reactionsGiven,
    commentUpvotesGiven: social.commentUpvotesGiven,
    following: social.following,
    followers: social.followers,
    media: media.map((item) => ({ id: item.id, reportId: item.reportId, url: item.url, kind: item.kind, createdAt: "" })),
  };
}

export async function deleteAccount(userId: string): Promise<void> {
  const orphanedR2Keys = deleteAccountData(userId);
  deleteAccountSocialData(userId);
  // Uploaded media always lands in the real (or Miniflare-local) R2 bucket regardless of
  // which store backend is active - only the metadata rows are backend-specific.
  if (orphanedR2Keys.length > 0) {
    try {
      const bucket = await getR2();
      await bucket.delete(orphanedR2Keys);
    } catch (error) {
      if (!(error instanceof MediaStorageUnavailableError)) throw error;
    }
  }
}
