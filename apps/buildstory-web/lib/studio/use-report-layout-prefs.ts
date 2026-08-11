"use client";

import { useCallback, useEffect, useState } from "react";
import {
  defaultReportLayoutPrefs,
  isSectionOpen,
  parseReportLayoutPrefs,
  serializeReportLayoutPrefs,
  withSectionHidden,
  withSectionOpen,
  withSectionPinned,
  type ReportLayoutPrefs,
  type ReportSectionKey,
} from "./report-layout-prefs";

const STORAGE_KEY = "buildstory:report-layout";

function readStoredPrefs(): ReportLayoutPrefs {
  try {
    return parseReportLayoutPrefs(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return defaultReportLayoutPrefs();
  }
}

function writeStoredPrefs(prefs: ReportLayoutPrefs) {
  try {
    window.localStorage.setItem(STORAGE_KEY, serializeReportLayoutPrefs(prefs));
  } catch {
    // Best-effort: a blocked storage context just means prefs reset next visit.
  }
}

/**
 * Per-device persistence for private-report section layout (open/closed,
 * hidden, pinned). Initializes to defaults during SSR/first paint so there is
 * no hydration mismatch, then reads localStorage in an effect - `hydrated`
 * flips true once that read has happened, for callers that want to avoid a
 * flash of a section expanding post-hydration.
 */
export function useReportLayoutPrefs() {
  const [prefs, setPrefs] = useState<ReportLayoutPrefs>(defaultReportLayoutPrefs);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // One-time bridge from localStorage (a browser-only external system) into React state on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPrefs(readStoredPrefs());
    setHydrated(true);
  }, []);

  const update = useCallback((next: ReportLayoutPrefs) => {
    setPrefs(next);
    writeStoredPrefs(next);
  }, []);

  const setOpen = useCallback(
    (key: ReportSectionKey, open: boolean) => {
      update(withSectionOpen(prefs, key, open));
    },
    [prefs, update],
  );

  const toggleHidden = useCallback(
    (key: ReportSectionKey) => {
      const hidden = prefs.hidden.includes(key);
      update(withSectionHidden(prefs, key, !hidden));
    },
    [prefs, update],
  );

  const togglePinned = useCallback(
    (key: ReportSectionKey) => {
      const pinned = prefs.pinned.includes(key);
      update(withSectionPinned(prefs, key, !pinned));
    },
    [prefs, update],
  );

  const reset = useCallback(() => {
    update(defaultReportLayoutPrefs());
  }, [update]);

  const showAllHidden = useCallback(() => {
    update({ ...prefs, hidden: [] });
  }, [prefs, update]);

  const isOpen = useCallback((key: ReportSectionKey) => isSectionOpen(prefs, key), [prefs]);
  const isHidden = useCallback((key: ReportSectionKey) => prefs.hidden.includes(key), [prefs]);
  const isPinned = useCallback((key: ReportSectionKey) => prefs.pinned.includes(key), [prefs]);

  return { prefs, hydrated, isOpen, isHidden, isPinned, setOpen, toggleHidden, togglePinned, reset, showAllHidden };
}
