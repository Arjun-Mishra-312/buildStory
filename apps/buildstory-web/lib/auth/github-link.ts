export type GithubEmailEntry = { email: string; primary: boolean; verified: boolean };

/** GitHub's `/user/emails` can list several addresses; only the primary, verified one is trustworthy. */
export function pickVerifiedPrimaryEmail(emails: GithubEmailEntry[]): string | null {
  return emails.find((entry) => entry.primary && entry.verified)?.email ?? null;
}

export type LinkedIdentity = { userId: string; authSubject: string };

export type GithubIdentityStore = {
  findUserByIdentity(provider: string, subject: string): Promise<LinkedIdentity | null>;
  findUserByVerifiedEmail(email: string): Promise<LinkedIdentity | null>;
  linkIdentity(userId: string, provider: string, subject: string, email: string): Promise<void>;
  markEmailVerified(userId: string): Promise<void>;
};

/**
 * Resolves what token.creatorId should be for a GitHub sign-in: the existing
 * user's original authSubject if this GitHub subject is already linked, the
 * existing user's original authSubject if we can auto-link by verified-email
 * match, or a fresh "github:<subject>" for a brand-new account. Never returns
 * anything but one of those three, so a linked user's uploads/reports/sessions
 * (all keyed off authSubject) stay joined to the same account regardless of
 * which provider they signed in with today.
 */
export async function resolveGithubCreatorId(
  subject: string,
  fetchVerifiedPrimaryEmail: () => Promise<string | null>,
  store: GithubIdentityStore,
): Promise<string> {
  const existing = await store.findUserByIdentity("github", subject);
  if (existing) {
    await store.markEmailVerified(existing.userId);
    return existing.authSubject;
  }

  const verifiedEmail = await fetchVerifiedPrimaryEmail();
  if (verifiedEmail) {
    const matched = await store.findUserByVerifiedEmail(verifiedEmail);
    if (matched) {
      await store.linkIdentity(matched.userId, "github", subject, verifiedEmail);
      await store.markEmailVerified(matched.userId);
      return matched.authSubject;
    }
  }

  return `github:${subject}`;
}
