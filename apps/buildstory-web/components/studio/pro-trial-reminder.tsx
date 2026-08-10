"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const REMINDER_THRESHOLD_DAYS = 3;
const DISMISS_KEY_PREFIX = "buildstory:pro-trial-reminder-dismissed:";

function todayKey() {
  return `${DISMISS_KEY_PREFIX}${new Date().toISOString().slice(0, 10)}`;
}

export function ProTrialReminder({ daysRemaining }: { daysRemaining: number | null }) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(window.localStorage.getItem(todayKey()) === "1");
  }, []);

  if (daysRemaining === null || daysRemaining > REMINDER_THRESHOLD_DAYS || dismissed) return null;

  return (
    <div className="pro-trial-reminder" role="note">
      <span>
        {daysRemaining === 0
          ? "Your free Pro access ends today."
          : `${daysRemaining} day${daysRemaining === 1 ? "" : "s"} left of your free Pro access.`}{" "}
        <Link href="/studio/settings">See plan details</Link>
      </span>
      <button
        className="button button--text"
        type="button"
        onClick={() => {
          window.localStorage.setItem(todayKey(), "1");
          setDismissed(true);
        }}
      >
        Dismiss
      </button>
    </div>
  );
}
