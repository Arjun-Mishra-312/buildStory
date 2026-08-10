import Link from "next/link";
import { GuidanceHelp, StudioGuideProvider } from "@/components/guidance/studio-guide";
import { ProTrialReminder } from "@/components/studio/pro-trial-reminder";

const links = [["Studio overview", "/studio"], ["Your projects", "/studio/projects"], ["Create story", "/studio/connect"], ["Settings", "/studio/settings"], ["Public stories", "/explore"]] as const;

export function StudioNav({ children, role, proTrialDaysRemaining }: { children: React.ReactNode; role: "member" | "moderator" | "admin"; proTrialDaysRemaining: number | null }) {
  let visibleLinks: ReadonlyArray<readonly [string, string]> = links;
  if (role === "moderator" || role === "admin") visibleLinks = [...visibleLinks, ["Moderation", "/studio/moderation"] as const];
  if (role === "admin") visibleLinks = [...visibleLinks, ["Admin", "/studio/admin"] as const];
  return <StudioGuideProvider><div className="studio-surface"><ProTrialReminder daysRemaining={proTrialDaysRemaining} /><nav className="studio-nav" aria-label="Studio workspace">{visibleLinks.map(([label, href]) => <Link href={href} key={href}>{label}</Link>)}<GuidanceHelp /></nav>{children}</div></StudioGuideProvider>;
}
