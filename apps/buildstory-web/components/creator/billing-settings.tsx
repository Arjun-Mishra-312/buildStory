"use client";

import { useState } from "react";

type BillingSettingsProps = {
  plan: "free" | "pro";
  billingInterval: "month" | "year" | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

function formatDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

async function extractErrorMessage(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  return payload?.error?.message ?? fallback;
}

export function BillingSettings({ plan, billingInterval, currentPeriodEnd, cancelAtPeriodEnd }: BillingSettingsProps) {
  const [billingParam] = useState<string | null>(() =>
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("billing"),
  );
  const [busyInterval, setBusyInterval] = useState<"month" | "year" | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upgrade(interval: "month" | "year") {
    setBusyInterval(interval);
    setError(null);
    try {
      const response = await fetch("/api/creator/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ interval }),
      });
      if (!response.ok) {
        setError(await extractErrorMessage(response, "Could not start checkout. Try again shortly."));
        setBusyInterval(null);
        return;
      }
      const data = (await response.json()) as { url: string };
      window.location.href = data.url;
    } catch {
      setError("Could not start checkout. Try again shortly.");
      setBusyInterval(null);
    }
  }

  async function manageBilling() {
    setPortalBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/creator/billing/portal", { method: "POST" });
      if (!response.ok) {
        setError(await extractErrorMessage(response, "Could not open billing management. Try again shortly."));
        return;
      }
      const data = (await response.json()) as { url: string };
      window.location.href = data.url;
    } catch {
      setError("Could not open billing management. Try again shortly.");
    } finally {
      setPortalBusy(false);
    }
  }

  return (
    <div className="account-settings">
      {billingParam === "success" ? (
        <p className="auth-notice">You&apos;re on Pro. Thanks for supporting Buildstory.</p>
      ) : null}
      {billingParam === "cancelled" ? (
        <p className="auth-notice auth-notice--error">Checkout was cancelled - no changes were made.</p>
      ) : null}
      {plan === "pro" ? (
        <section className="report-card">
          <header>
            <span>PRO</span>
            <strong>{cancelAtPeriodEnd ? "Cancels" : "Renews"} {formatDate(currentPeriodEnd) ?? "soon"}</strong>
          </header>
          <p>
            {billingInterval === "year" ? "Billed annually." : "Billed monthly."}{" "}
            {cancelAtPeriodEnd
              ? "Your Pro benefits stay active until then."
              : "Manage your payment method or cancel anytime."}
          </p>
          {error ? <p className="comment-thread__error">{error}</p> : null}
          <button className="button button--secondary" type="button" onClick={() => void manageBilling()} disabled={portalBusy}>
            {portalBusy ? "Opening…" : "Manage billing"}
          </button>
        </section>
      ) : (
        <section className="report-card">
          <header>
            <span>FREE</span>
            <strong>Upgrade to Pro</strong>
          </header>
          <p>Deeper AI-generated reports and a higher monthly cloud-analysis budget, for $5/month.</p>
          {error ? <p className="comment-thread__error">{error}</p> : null}
          <button className="button button--primary" type="button" onClick={() => void upgrade("month")} disabled={busyInterval !== null}>
            {busyInterval === "month" ? "Starting checkout…" : "Upgrade monthly"}
          </button>
          <button className="button button--secondary" type="button" onClick={() => void upgrade("year")} disabled={busyInterval !== null}>
            {busyInterval === "year" ? "Starting checkout…" : "Upgrade yearly"}
          </button>
        </section>
      )}
    </div>
  );
}
