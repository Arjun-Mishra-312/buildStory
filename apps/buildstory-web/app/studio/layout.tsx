import { requireCreator } from "@/lib/auth/runtime";
import { redirect } from "next/navigation";
import { StudioNav } from "@/components/studio/studio-nav";
import { ensureUser } from "@/lib/ingestion/store";
import { launchPromotionStatus } from "@/lib/narrative/entitlement";

export const dynamic = "force-dynamic";

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const creator = await requireCreator("/studio");
  const user = await ensureUser(creator);
  if (!user.onboardingCompletedAt) redirect("/onboarding?next=/studio");
  const promotion = launchPromotionStatus();
  return <StudioNav role={user.role} proTrialDaysRemaining={promotion.active ? promotion.daysRemaining : null}>{children}</StudioNav>;
}
