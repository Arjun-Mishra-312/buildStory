"use client";

/* Avatar URLs come from the signed-in identity provider and are intentionally not allowlisted as image hosts. */
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { signOutAction } from "@/app/signin/actions";
import type { Viewer } from "./viewer";

export function AvatarMenu({ viewer }: { viewer: Viewer }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setOpen(false));
    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        containerRef.current?.querySelector<HTMLButtonElement>(".avatar-menu__trigger")?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const close = () => setOpen(false);
  return (
    <div className={`avatar-menu${open ? " is-open" : ""}`} ref={containerRef}>
      <button className="avatar-menu__trigger" type="button" aria-label="Open account menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        {viewer.avatarUrl ? <img src={viewer.avatarUrl} alt="" className="avatar" /> : <span className="avatar">{viewer.initials}</span>}
        <span className="avatar-menu__name">{viewer.name}</span>
      </button>
      {open ? <div className="avatar-menu__panel">
        <Link href="/studio" onClick={close}>Studio overview</Link>
        <Link href="/studio/projects" onClick={close}>Your projects</Link>
        <Link href="/u/me" onClick={close}>Your profile</Link>
        <Link href="/studio/connect" onClick={close}>Create story</Link>
        <Link href="/studio/settings" onClick={close}>Settings</Link>
        <form action={signOutAction} onSubmit={close}><button type="submit">Sign out</button></form>
      </div>
      : null}
    </div>
  );
}
