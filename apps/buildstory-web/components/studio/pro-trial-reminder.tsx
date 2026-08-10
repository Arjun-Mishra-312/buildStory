"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";

const REMINDER_THRESHOLD_DAYS = 3;
const DISMISS_KEY_PREFIX = "buildstory:pro-trial-reminder-dismissed:";

function todayKey() {
  return `${DISMISS_KEY_PREFIX}${new Date().toISOString().slice(0, 10)}`;
}

function subscribeToStorage(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function readStoredDismissed() {
  return window.localStorage.getItem(todayKey()) === "1";
}

// Hides the reminder on the server-rendered/first-paint markup - matches the
// prior default and avoids a hydration mismatch, since localStorage isn't
// available during SSR.
function readServerDismissed() {
  return true;
}

export function ProTrialReminder({ daysRemaining }: { daysRemaining: number | null }) {
  const storedDismissed = useSyncExternalStore(subscribeToStorage, readStoredDismissed, readServerDismissed);
  // Local dismissal in this render pass - the storage event above only fires
  // for other tabs, not the one that made the write.
  const [sessionDismissed, setSessionDismissed] = useState(false);
  const dismissed = storedDismissed || sessionDismissed;

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
          setSessionDismissed(true);
        }}
      >
        Dismiss
      </button>
    </div>
  );
}
