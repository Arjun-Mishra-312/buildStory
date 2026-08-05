import Link from "next/link";
import type { CreatorSession } from "@/lib/auth/runtime";

const creatorNavigation = [
  ["01", "Overview", "/dashboard"],
  ["02", "Connect scanner", "/dashboard/connect"],
  ["03", "Feed", "/dashboard/feed"],
  ["04", "Settings", "/dashboard/settings"],
  ["↗", "Public stories", "/explore"],
] as const;

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
          {creatorNavigation.map(([index, label, href]) => (
            <Link href={href} key={href}><span>{index}</span> {label}</Link>
          ))}
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
          <details className="creator-mobile-menu">
            <summary>Menu</summary>
            <nav aria-label="Mobile creator workspace">
              {creatorNavigation.map(([, label, href]) => (
                <Link href={href} key={href}>{label}</Link>
              ))}
            </nav>
          </details>
        </header>
        {children}
      </div>
    </div>
  );
}
