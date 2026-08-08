import Link from "next/link";

const links = [["Overview", "/studio"], ["Projects", "/studio/projects"], ["Connect scanner", "/studio/connect"], ["Settings", "/studio/settings"], ["Public stories", "/explore"]] as const;

export function StudioNav({ children, role }: { children: React.ReactNode; role: "member" | "moderator" | "admin" }) {
  const visibleLinks = role === "moderator" || role === "admin"
    ? [...links, ["Moderation", "/studio/moderation"] as const]
    : links;
  return <div className="studio-surface"><nav className="studio-nav" aria-label="Studio workspace">{visibleLinks.map(([label, href]) => <Link href={href} key={href}>{label}</Link>)}</nav>{children}</div>;
}
