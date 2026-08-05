"use client";

import Link from "next/link";
import { NotificationBell } from "./notification-bell";

type SiteHeaderProps = {
  active?: "home" | "explore" | "project";
  compact?: boolean;
};

export function SiteHeader({ active, compact = false }: SiteHeaderProps) {
  function toggleTheme() {
    const current =
      document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    const next = current === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("buildstory-theme", next);
  }

  return (
    <header className={`site-header ${compact ? "site-header--compact" : ""}`}>
      <div className="site-header__inner">
        <Link className="wordmark" href="/" aria-label="Buildstory home">
          <span className="wordmark__mark" aria-hidden="true">
            <span />
            <span />
          </span>
          <span>Buildstory</span>
        </Link>

        <nav className="primary-nav" aria-label="Primary navigation">
          <Link
            href="/explore"
            className={active === "explore" ? "is-active" : undefined}
          >
            Explore
          </Link>
          <Link href="/#how-it-works">How it works</Link>
          <Link href="/#manifesto">Manifesto</Link>
        </nav>

        <div className="site-header__actions">
          <NotificationBell />
          <button
            className="theme-toggle"
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle color theme"
            title="Toggle color theme"
          >
            <span className="theme-toggle__track" aria-hidden="true">
              <span className="theme-toggle__thumb" />
            </span>
            <span className="theme-toggle__label">Theme</span>
          </button>
          <Link className="header-cta" href="/signin?callbackUrl=/dashboard">
            Creator sign in <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
