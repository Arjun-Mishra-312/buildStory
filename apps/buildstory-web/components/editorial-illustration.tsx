"use client";

import { useEffect, useState } from "react";

export type EditorialIllustrationKind =
  | "feed-quiet"
  | "search-no-results"
  | "leaderboard-first-rank"
  | "profile-first-story"
  | "studio-first-story";

type Theme = "light" | "dark";

const assets: Record<EditorialIllustrationKind, Record<Theme, string>> = {
  "feed-quiet": {
    light: "/assets/illustrations/feed-quiet-light.webp",
    dark: "/assets/illustrations/feed-quiet-dark.webp",
  },
  "search-no-results": {
    light: "/assets/illustrations/search-no-results-light.webp",
    dark: "/assets/illustrations/search-no-results-dark.webp",
  },
  "leaderboard-first-rank": {
    light: "/assets/illustrations/leaderboard-first-rank-light.webp",
    dark: "/assets/illustrations/leaderboard-first-rank-dark.webp",
  },
  "profile-first-story": {
    light: "/assets/illustrations/profile-first-story-light.webp",
    dark: "/assets/illustrations/profile-first-story-dark.webp",
  },
  "studio-first-story": {
    light: "/assets/illustrations/studio-first-story-light.webp",
    dark: "/assets/illustrations/studio-first-story-dark.webp",
  },
};

function documentTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function EditorialIllustration({ kind, className = "" }: { kind: EditorialIllustrationKind; className?: string }) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const root = document.documentElement;
    const syncTheme = () => setTheme(documentTheme());
    syncTheme();

    const observer = new MutationObserver(syncTheme);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  return (
    // Static assets are intentionally theme-swapped from a fixed local map.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt=""
      aria-hidden="true"
      className={`editorial-illustration ${className}`.trim()}
      decoding="async"
      height={640}
      loading="lazy"
      src={assets[kind][theme]}
      width={640}
    />
  );
}
