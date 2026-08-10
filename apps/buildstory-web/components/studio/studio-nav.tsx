import Link from "next/link";
import { GuidanceHelp, StudioGuideProvider } from "@/components/guidance/studio-guide";

const links = [["Studio overview", "/studio"], ["Your projects", "/studio/projects"], ["Create story", "/studio/connect"], ["Settings", "/studio/settings"], ["Public stories", "/explore"]] as const;

export function StudioNav({ children, role }: { children: React.ReactNode; role: "member" | "moderator" | "admin" }) {
  let visibleLinks: ReadonlyArray<readonly [string, string]> = links;
  if (role === "moderator" || role === "admin") visibleLinks = [...visibleLinks, ["Moderation", "/studio/moderation"] as const];
  if (role === "admin") visibleLinks = [...visibleLinks, ["Admin", "/studio/admin"] as const];
  return <StudioGuideProvider><div className="studio-surface"><nav className="studio-nav" aria-label="Studio workspace">{visibleLinks.map(([label, href]) => <Link href={href} key={href}>{label}</Link>)}<GuidanceHelp /></nav>{children}</div></StudioGuideProvider>;
}
