"use client";

/* Avatar URLs come from the signed-in identity provider and are intentionally not allowlisted as image hosts. */
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { signOutAction } from "@/app/signin/actions";
import type { Viewer } from "./viewer";

export function AvatarMenu({ viewer }: { viewer: Viewer }) {
  return (
    <details className="avatar-menu">
      <summary aria-label="Open account menu">
        {viewer.avatarUrl ? <img src={viewer.avatarUrl} alt="" className="avatar" /> : <span className="avatar">{viewer.initials}</span>}
        <span className="avatar-menu__name">{viewer.name}</span>
      </summary>
      <div className="avatar-menu__panel">
        <Link href="/u/me">Your profile</Link>
        <Link href="/studio">Your stories</Link>
        <Link href="/studio/connect">Create story</Link>
        <Link href="/studio/settings">Settings</Link>
        <form action={signOutAction}><button type="submit">Sign out</button></form>
      </div>
    </details>
  );
}
