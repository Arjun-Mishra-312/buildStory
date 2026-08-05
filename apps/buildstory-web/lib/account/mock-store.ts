import { deleteAccountData, getAccountProjectsAndReports } from "@/lib/ingestion/mock-store";
import { deleteAccountSocialData, getAccountSocialData, getProfile } from "@/lib/social/mock-store";
import { AccountError, type AccountExport } from "./contracts";

export function exportAccountData(userId: string): AccountExport {
  const profile = getProfile(userId);
  if (!profile) throw new AccountError("not_found", "Account not found.", 404);
  const { projects, reports } = getAccountProjectsAndReports(userId);
  const social = getAccountSocialData(userId);
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
    following: social.following,
    followers: social.followers,
  };
}

export function deleteAccount(userId: string): void {
  deleteAccountData(userId);
  deleteAccountSocialData(userId);
}
