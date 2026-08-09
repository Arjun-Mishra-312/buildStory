import Link from "next/link";
import { GuidanceHelp, StudioGuideProvider } from "@/components/guidance/studio-guide";

const links = [["Studio overview", "/studio"], ["Your projects", "/studio/projects"], ["Create story", "/studio/connect"], ["Settings", "/studio/settings"], ["Public stories", "/explore"]] as const;

export function StudioNav({ children, role }: { children: React.ReactNode; role: "member" | "moderator" | "admin" }) {
  const visibleLinks = role === "moderator" || role === "admin"
    ? [...links, ["Moderation", "/studio/moderation"] as const]
    : links;
  return <StudioGuideProvider><div className="studio-surface"><nav className="studio-nav" aria-label="Studio workspace">{visibleLinks.map(([label, href]) => <Link href={href} key={href}>{label}</Link>)}<GuidanceHelp /></nav>{children}</div></StudioGuideProvider>;
}
