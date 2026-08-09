"use client";

import { NotificationBell } from "@/components/notification-bell";
import { useEffect, useRef, useState } from "react";
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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const callback = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setMenuOpen(false));
    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuRef.current?.querySelector<HTMLButtonElement>(".site-mobile-menu__trigger")?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("pointerdown", onPointerDown); document.removeEventListener("keydown", onKeyDown); };
  }, [menuOpen]);
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <BrandMark />
        <nav className="primary-nav" aria-label="Primary navigation">
          <NavLink href="/explore">Explore</NavLink>
          <NavLink href="/leaderboard">Leaderboard</NavLink>
          <NavLink href="/about#how-it-works">How it works</NavLink>
          <NavLink href="/about#manifesto">Manifesto</NavLink>
        </nav>
        <div className="site-header__actions">
          <div className={`site-mobile-menu${menuOpen ? " is-open" : ""}`} ref={menuRef}>
            <button className="site-mobile-menu__trigger" type="button" aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)}>Menu</button>
            {menuOpen ? <nav aria-label="Mobile primary navigation">
              <NavLink href="/explore" onClick={() => setMenuOpen(false)}>Explore</NavLink>
              <NavLink href="/leaderboard" onClick={() => setMenuOpen(false)}>Leaderboard</NavLink>
              <NavLink href="/about#how-it-works" onClick={() => setMenuOpen(false)}>How it works</NavLink>
              <NavLink href="/about#manifesto" onClick={() => setMenuOpen(false)}>Manifesto</NavLink>
              {viewer ? <NavLink href="/studio" onClick={() => setMenuOpen(false)}>Studio</NavLink> : <NavLink href={`/signin?callbackUrl=${encodeURIComponent(callback)}`} onClick={() => setMenuOpen(false)}>Sign in</NavLink>}
            </nav> : null}
          </div>
          <SearchTrigger />
          {viewer ? <NotificationBell /> : null}
          <ThemeToggle />
          {viewer ? <AvatarMenu viewer={viewer} /> : <a className="header-cta" href={`/signin?callbackUrl=${encodeURIComponent(callback)}`}>Sign in <span aria-hidden="true">↗</span></a>}
        </div>
      </div>
    </header>
  );
}
