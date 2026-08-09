import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getAuthRuntimeMode,
  getCreatorSession,
  isGithubOAuthConfigured,
  isGoogleOAuthConfigured,
  safeReturnPath,
} from "@/lib/auth/runtime";
import { signInWithGithub, signInWithGoogle } from "./actions";
import { ensureUser } from "@/lib/ingestion/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to connect a scanner and manage Buildstory projects.",
};

type SignInPageProps = {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const callbackUrl = safeReturnPath(params.callbackUrl);
  const creator = await getCreatorSession();
  if (creator) {
    const user = await ensureUser(creator);
    if (!user.onboardingCompletedAt) redirect(`/onboarding?next=${encodeURIComponent(callbackUrl)}`);
    redirect(callbackUrl);
  }

  const mode = getAuthRuntimeMode();

  return (
    <div className="auth-page">
      <section className="auth-layout section-wrap">
        <section className="auth-layout__copy">
          <span className="section-index">( CREATOR ACCESS )</span>
          <h1>Your work stays private until you publish it.</h1>
          <p>
            Sign in to connect the local scanner, review generated reports,
            choose public fields, and publish a Build Story anyone can read.
          </p>
          <div className="auth-trust-list">
            <span><i>1</i> Browser session identifies the creator.</span>
            <span><i>2</i> Scanner receives a separate one-time upload token.</span>
            <span><i>3</i> Public pages never require an account.</span>
          </div>
        </section>

        <section className="auth-card">
          <div className="auth-card__header">
            <span className="wordmark__mark" aria-hidden="true"><span /><span /></span>
            <div><strong>Buildstory for creators</strong><small>Google or GitHub account access</small></div>
          </div>

          {params.error ? (
            <p className="auth-notice auth-notice--error">
              Sign-in did not complete. Nothing was changed; please try again.
            </p>
          ) : null}

          <p className="auth-card__consent">
            By continuing you agree to the <Link href="/terms">Terms of Service</Link> and{" "}
            <Link href="/privacy">Privacy Policy</Link>, and confirm you are at least 13 years old.
          </p>

          {mode === "oauth" ? (
            <div className="auth-card__providers">
              {isGoogleOAuthConfigured() ? (
                <form action={signInWithGoogle}>
                  <input type="hidden" name="callbackUrl" value={callbackUrl} />
                  <button className="google-signin" type="submit">
                    <span aria-hidden="true">G</span>
                    Continue with Google
                  </button>
                </form>
              ) : null}

              {isGithubOAuthConfigured() ? (
                <form action={signInWithGithub}>
                  <input type="hidden" name="callbackUrl" value={callbackUrl} />
                  <button className="github-signin" type="submit">
                    <span aria-hidden="true">GH</span>
                    Continue with GitHub
                  </button>
                </form>
              ) : null}
            </div>
          ) : null}

          {mode === "development-bypass" ? (
            <>
              <p className="auth-notice">
                Development creator mode is active. It is automatically unavailable in production.
              </p>
                <Link className="button button--primary auth-card__button" href={`/onboarding?next=${encodeURIComponent(callbackUrl)}`}>
                Continue as Mina Park <span aria-hidden="true">→</span>
              </Link>
            </>
          ) : null}

          {mode === "disabled" ? (
            <div className="auth-disabled">
              <span>AUTHENTICATION DISABLED</span>
              <h2>Add Google or GitHub credentials, or opt into the local dev identity.</h2>
              <p>
                The public site remains available. Creator routes stay locked
                until the local environment is configured as documented in the README.
              </p>
              <code>BUILDSTORY_DEV_AUTH_BYPASS=true</code>
            </div>
          ) : null}

          <p className="auth-card__fineprint">
            Authentication grants creator access only. It never grants the
            scanner access to browser cookies or unpublished project data.
          </p>
          <Link className="auth-card__public-link" href="/explore">
            Continue to public stories without signing in <span aria-hidden="true">→</span>
          </Link>
        </section>
      </section>
    </div>
  );
}
