import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

const googleOAuthConfigured = Boolean(
  process.env.AUTH_SECRET &&
    process.env.AUTH_SECRET.length >= 32 &&
    process.env.AUTH_GOOGLE_ID &&
    process.env.AUTH_GOOGLE_SECRET,
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: googleOAuthConfigured ? [Google] : [],
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
      if (account?.provider !== "google") return false;
      const googleProfile = profile as
        | { email?: string; email_verified?: boolean }
        | undefined;
      return Boolean(googleProfile?.email && googleProfile.email_verified);
    },
    async jwt({ token, account, profile }) {
      if (account?.provider === "google") {
        const googleProfile = profile as { sub?: string } | undefined;
        token.creatorId = `google:${googleProfile?.sub ?? token.sub}`;
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
