import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import { pickVerifiedPrimaryEmail, resolveGithubCreatorId } from "@/lib/auth/github-link";

const authSecretConfigured = Boolean(process.env.AUTH_SECRET && process.env.AUTH_SECRET.length >= 32);

const googleOAuthConfigured = Boolean(
  authSecretConfigured && process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET,
);

const githubOAuthConfigured = Boolean(
  authSecretConfigured && process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET,
);

/** GitHub's `profile.email` can be null or unverified even when the account has a verified address elsewhere - the primary/verified one only shows up here. */
async function fetchGithubVerifiedPrimaryEmail(accessToken: string): Promise<string | null> {
  const response = await fetch("https://api.github.com/user/emails", {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/vnd.github+json",
      "user-agent": "buildstory",
    },
  });
  if (!response.ok) return null;
  const emails = (await response.json()) as Array<{ email: string; primary: boolean; verified: boolean }>;
  return pickVerifiedPrimaryEmail(emails);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    ...(googleOAuthConfigured ? [Google] : []),
    ...(githubOAuthConfigured ? [GitHub] : []),
  ],
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  useSecureCookies: process.env.NODE_ENV === "production",
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 12,
  },
  pages: {
    signIn: "/signin",
  },
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider === "google") {
        const googleProfile = profile as { email?: string; email_verified?: boolean } | undefined;
        return Boolean(googleProfile?.email && googleProfile.email_verified);
      }
      if (account?.provider === "github") {
        if (!account.access_token) return false;
        const verifiedEmail = await fetchGithubVerifiedPrimaryEmail(account.access_token);
        return Boolean(verifiedEmail);
      }
      return false;
    },
    async jwt({ token, account, profile }) {
      if (account?.provider === "google") {
        const googleProfile = profile as { sub?: string } | undefined;
        token.creatorId = `google:${googleProfile?.sub ?? token.sub}`;
      } else if (account?.provider === "github") {
        const githubProfile = profile as { id?: number } | undefined;
        const subject = String(githubProfile?.id ?? token.sub ?? "");
        const accessToken = account.access_token;
        const store = await import("@/lib/ingestion/store");
        token.creatorId = await resolveGithubCreatorId(
          subject,
          () => (accessToken ? fetchGithubVerifiedPrimaryEmail(accessToken) : Promise.resolve(null)),
          store,
        );
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.creatorId ?? token.sub ?? "");
      }
      return session;
    },
  },
});
