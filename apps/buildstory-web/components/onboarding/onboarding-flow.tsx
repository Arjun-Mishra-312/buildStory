"use client";

/* Avatar URLs come from the signed-in identity provider and are intentionally not allowlisted as image hosts. */
/* eslint-disable @next/next/no-img-element */

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { BUILDER_ROLE_LABELS, BUILDER_ROLES, type BuilderRole } from "@/lib/identity/builder-roles";

type OnboardingFlowProps = {
  next: string;
  initialProfile: {
    displayName: string;
    handle: string;
    bio: string;
    builderRole: BuilderRole | null;
    avatarUrl: string | null;
  };
};

export function OnboardingFlow({ next, initialProfile }: OnboardingFlowProps) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [displayName, setDisplayName] = useState(initialProfile.displayName);
  const [handle, setHandle] = useState(initialProfile.handle);
  const [bio, setBio] = useState(initialProfile.bio);
  const [builderRole, setBuilderRole] = useState<BuilderRole | null>(initialProfile.builderRole);
  const [destination, setDestination] = useState<"create" | "explore" | "next">("create");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function finish() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/creator/onboarding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName, handle, bio: bio.trim() || null, builderRole }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(payload?.error?.message ?? "Could not finish your profile. Try again.");
        return;
      }
      const target = destination === "create" ? "/studio/connect" : destination === "explore" ? "/explore" : next;
      router.push(target);
      router.refresh();
    } catch {
      setError("Could not finish your profile. Try again shortly.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="onboarding-page">
      <div className="onboarding-shell">
        <header className="onboarding-header">
          <Link className="onboarding-wordmark" href="/" aria-label="Buildstory home"><span aria-hidden="true">L</span> Buildstory</Link>
          <span className="onboarding-progress">{step + 1} / 3</span>
        </header>

        <div className="onboarding-card">
          {step === 0 ? (
            <section className="onboarding-step onboarding-step--welcome" aria-labelledby="onboarding-welcome-title">
              <div className="onboarding-step__art"><img src="/assets/illustrations/onboarding-welcome-light.webp" alt="" className="onboarding-art onboarding-art--light" /><img src="/assets/illustrations/onboarding-welcome-dark.webp" alt="" className="onboarding-art onboarding-art--dark" /></div>
              <div className="onboarding-step__copy">
                <span className="section-index">( WELCOME TO BUILDSTORY )</span>
                <h1 id="onboarding-welcome-title">Every build has a story.</h1>
                <p>Buildstory turns your working process into a thoughtful, shareable record. Your scan stays private until you choose what to publish.</p>
                <div className="onboarding-trust-list"><span><i>01</i> Your browser identifies your account.</span><span><i>02</i> The scanner uses a separate one-time token.</span><span><i>03</i> You choose the public story boundary.</span></div>
                <button className="button button--primary" type="button" onClick={() => setStep(1)}>Set up your profile <span aria-hidden="true">→</span></button>
              </div>
            </section>
          ) : null}

          {step === 1 ? (
            <section className="onboarding-step" aria-labelledby="onboarding-profile-title">
              <div className="onboarding-step__copy">
                <span className="section-index">( YOUR PUBLIC PROFILE )</span>
                <h1 id="onboarding-profile-title">Make it easy to find you.</h1>
                <p>Your name, handle, bio, and builder role appear alongside your published stories. You can refine them later in Settings.</p>
                <div className="onboarding-profile-preview">
                  {initialProfile.avatarUrl ? <img src={initialProfile.avatarUrl} alt="" className="avatar avatar--large" /> : <span className="avatar avatar--large">{displayName.slice(0, 1).toUpperCase() || "B"}</span>}
                  <span><strong>{displayName || "Your name"}</strong><small>@{handle || "your-handle"}</small></span>
                </div>
                <label><span>Display name</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={80} autoComplete="name" /></label>
                <label><span>Handle</span><input value={handle} onChange={(event) => setHandle(event.target.value)} maxLength={32} autoComplete="username" /></label>
                <label><span>Bio <small>{bio.length}/280 · optional</small></span><textarea value={bio} onChange={(event) => setBio(event.target.value)} maxLength={280} rows={3} placeholder="What are you building?" /></label>
                <fieldset className="builder-role-picker"><legend>What describes you? <small>optional</small></legend><div>{BUILDER_ROLES.map((role) => <button key={role} type="button" className={builderRole === role ? "is-selected" : undefined} aria-pressed={builderRole === role} onClick={() => setBuilderRole(builderRole === role ? null : role)}>{BUILDER_ROLE_LABELS[role]}</button>)}</div></fieldset>
                {error ? <p className="onboarding-error" role="alert">{error}</p> : null}
                <div className="onboarding-actions"><button className="button button--text" type="button" onClick={() => setStep(0)}>Back</button><button className="button button--primary" type="button" onClick={() => { setError(null); setStep(2); }} disabled={!displayName.trim() || !handle.trim()}>Continue <span aria-hidden="true">→</span></button></div>
              </div>
            </section>
          ) : null}

          {step === 2 ? (
            <section className="onboarding-step" aria-labelledby="onboarding-start-title">
              <div className="onboarding-step__copy">
                <span className="section-index">( YOUR FIRST MOVE )</span>
                <h1 id="onboarding-start-title">Where should we start?</h1>
                <p>Take a quick look around, or connect the scanner and turn a recent build into your first private report.</p>
                <div className="onboarding-destination-list" role="radiogroup" aria-label="Choose where to start">
                  <button type="button" className={destination === "create" ? "is-selected" : undefined} aria-pressed={destination === "create"} onClick={() => setDestination("create")}><span><strong>Create a story</strong><small>Connect the scanner and capture a build.</small></span><i aria-hidden="true">→</i></button>
                  <button type="button" className={destination === "explore" ? "is-selected" : undefined} aria-pressed={destination === "explore"} onClick={() => setDestination("explore")}><span><strong>Explore stories</strong><small>Find builders to follow and learn from.</small></span><i aria-hidden="true">→</i></button>
                  {next !== "/studio" ? <button type="button" className={destination === "next" ? "is-selected" : undefined} aria-pressed={destination === "next"} onClick={() => setDestination("next")}><span><strong>Continue where I left off</strong><small>Return to the page that brought you here.</small></span><i aria-hidden="true">→</i></button> : null}
                </div>
                {error ? <p className="onboarding-error" role="alert">{error}</p> : null}
                <div className="onboarding-actions"><button className="button button--text" type="button" onClick={() => setStep(1)} disabled={busy}>Back</button><button className="button button--primary" type="button" onClick={() => void finish()} disabled={busy}>{busy ? "Saving…" : "Enter Buildstory"} <span aria-hidden="true">→</span></button></div>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </main>
  );
}
