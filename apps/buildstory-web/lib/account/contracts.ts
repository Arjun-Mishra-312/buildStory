export class AccountError extends Error {
  readonly isBuildstoryIngestionError = true;

  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export type AccountExport = {
  exportedAt: string;
  profile: {
    id: string;
    handle: string;
    displayName: string;
    email: string;
    bio: string | null;
    createdAt: string;
  };
  projects: Array<{
    id: string;
    slug: string;
    name: string;
    latestCommitCount: number;
    latestActiveDays: number;
  }>;
  reports: Array<{
    id: string;
    status: string;
    publicationStatus: string;
    publicationSlug: string;
    editorialTagline: string;
    createdAt: string;
    publishedAt: string | null;
  }>;
  commentsAuthored: Array<{
    id: string;
    reportId: string;
    parentCommentId: string | null;
    body: string;
    createdAt: string;
  }>;
  reactionsGiven: Array<{ reportId: string; kind: string; createdAt: string }>;
  commentUpvotesGiven: Array<{ commentId: string; reportId: string; createdAt: string }>;
  following: string[];
  followers: string[];
  media: Array<{ id: string; reportId: string; url: string; kind: string; createdAt: string }>;
};
