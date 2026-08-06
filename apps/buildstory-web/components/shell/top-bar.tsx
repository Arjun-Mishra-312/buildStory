"use client";

import { NotificationBell } from "@/components/notification-bell";
import { usePathname, useSearchParams } from "next/navigation";
import { BrandMark } from "./brand-mark";
import { AvatarMenu } from "./avatar-menu";
import { NavLink } from "./nav-link";
import { SearchTrigger } from "./search-trigger";
import { ThemeToggle } from "./theme-toggle";
import type { Viewer } from "./viewer";

export function TopBar({ viewer }: { viewer: Viewer | null }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const callback = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <BrandMark />
        <nav className="primary-nav" aria-label="Primary navigation">
          {viewer ? <NavLink href="/explore">Explore</NavLink> : null}
          {viewer ? <NavLink href="/leaderboard">Leaderboard</NavLink> : null}
          <NavLink href="/about#how-it-works">How it works</NavLink>
          <NavLink href="/about#manifesto">Manifesto</NavLink>
        </nav>
        <div className="site-header__actions">
          <details className="site-mobile-menu">
            <summary>Menu</summary>
            <nav aria-label="Mobile primary navigation">
              {viewer ? <NavLink href="/explore">Explore</NavLink> : null}
              {viewer ? <NavLink href="/leaderboard">Leaderboard</NavLink> : null}
              <NavLink href="/about#how-it-works">How it works</NavLink>
              <NavLink href="/about#manifesto">Manifesto</NavLink>
              {viewer ? <NavLink href="/studio">Studio</NavLink> : <NavLink href={`/signin?callbackUrl=${encodeURIComponent(callback)}`}>Sign in</NavLink>}
            </nav>
          </details>
          <SearchTrigger />
          {viewer ? <NotificationBell /> : null}
          <ThemeToggle />
          {viewer ? <AvatarMenu viewer={viewer} /> : <a className="header-cta" href={`/signin?callbackUrl=${encodeURIComponent(callback)}`}>Sign in <span aria-hidden="true">↗</span></a>}
        </div>
      </div>
    </header>
  );
}
