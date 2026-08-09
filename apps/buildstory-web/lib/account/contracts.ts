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
    builderRole: string | null;
    onboardingCompletedAt: string | null;
    createdAt: string;
  };
  guidance: Array<{
    guideKey: string;
    guideVersion: number;
    state: string;
    updatedAt: string;
  }>;
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
  /**
   * The scanner data itself - the most personal thing Buildstory holds, and
   * previously missing from this export even though Settings promised
   * "scanner records". sourceSnapshot is the full validated ProjectSnapshot
   * the scanner uploaded for this report, including any narrativeEvidence
   * excerpts if the creator opted into Cloud mode with evidence - this is
   * the one place that redacted excerpt text is ever returned to the
   * creator themselves.
   */
  scans: Array<{
    reportId: string;
    createdAt: string;
    sourceSnapshot: unknown;
  }>;
  narratives: Array<{
    reportId: string;
    mode: string;
    provider: string;
    model: string;
    status: string;
    sections: unknown;
    fallbacksUsed: string[];
    createdAt: string;
  }>;
  uploadSessions: Array<{
    id: string;
    projectLabel: string;
    narrativeMode: string;
    status: string;
    reportId: string | null;
    createdAt: string;
  }>;
};
