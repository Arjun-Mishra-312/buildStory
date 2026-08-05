import Link from "next/link";
import type { CreatorSession } from "@/lib/auth/runtime";

export function CreatorShell({
  creator,
  children,
}: {
  creator: CreatorSession;
  children: React.ReactNode;
}) {
  const initials = creator.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <div className="creator-shell">
      <aside className="creator-sidebar">
        <Link className="wordmark creator-sidebar__brand" href="/">
          <span className="wordmark__mark" aria-hidden="true"><span /><span /></span>
          <span>Buildstory</span>
        </Link>
        <div className="creator-sidebar__label">CREATOR WORKSPACE</div>
        <nav aria-label="Creator workspace">
          <Link href="/dashboard"><span>01</span> Overview</Link>
          <Link href="/dashboard/projects/orbit-notes"><span>02</span> Project & report</Link>
          <Link href="/dashboard/connect"><span>03</span> Connect scanner</Link>
          <Link href="/dashboard/feed"><span>04</span> Feed</Link>
          <Link href="/p/orbit-notes"><span>↗</span> Public page</Link>
        </nav>
        <div className="creator-sidebar__boundary">
          <span>PRIVATE SURFACE</span>
          <p>Browser identity gates every route and creator API.</p>
        </div>
        <div className="creator-profile">
          <span className="avatar">{initials || "MP"}</span>
          <span><strong>{creator.name}</strong><small>{creator.email}</small></span>
          <a href={creator.mode === "google" ? "/api/auth/signout" : "/signin"}>
            {creator.mode === "google" ? "Sign out" : "Dev"}
          </a>
        </div>
      </aside>
      <div className="creator-main">
        <header className="creator-mobile-header">
          <Link className="wordmark" href="/dashboard">
            <span className="wordmark__mark" aria-hidden="true"><span /><span /></span>
            <span>Buildstory</span>
          </Link>
          <Link href="/dashboard/connect">Connect scanner</Link>
        </header>
        {children}
      </div>
    </div>
  );
}
