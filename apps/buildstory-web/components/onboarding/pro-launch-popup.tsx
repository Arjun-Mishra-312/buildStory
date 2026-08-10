"use client";

import { useEffect } from "react";

type ProLaunchPopupProps = {
  open: boolean;
  onContinue: () => void;
  daysRemaining: number | null;
};

const BENEFITS = [
  "Deeper, richer AI-generated reports with a higher monthly analysis budget.",
  "Unlimited project re-scans (free accounts get 3/month).",
  "Spotlight your stories on Explore's Pro Picks rail for 24 hours each.",
];

export function ProLaunchPopup({ open, onContinue, daysRemaining }: ProLaunchPopupProps) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onContinue();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onContinue]);

  if (!open) return null;

  const countdown = daysRemaining !== null
    ? `Free for your first ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}.`
    : "Free for launch.";

  return (
    <div className="pro-launch-popup-backdrop" role="presentation" onClick={onContinue}>
      <div className="pro-launch-popup" role="dialog" aria-modal="true" aria-labelledby="pro-launch-popup-title" onClick={(event) => event.stopPropagation()}>
        <span className="section-index">( ON US TO LAUNCH )</span>
        <h2 id="pro-launch-popup-title">You&apos;ve got Pro. {countdown}</h2>
        <p>Every new account gets full Pro access while we launch Buildstory — no card, no catch.</p>
        <ul className="pro-launch-popup__benefits">
          {BENEFITS.map((benefit) => (
            <li key={benefit}>{benefit}</li>
          ))}
        </ul>
        <button className="button button--primary" type="button" onClick={onContinue}>
          Let&apos;s go <span aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  );
}
