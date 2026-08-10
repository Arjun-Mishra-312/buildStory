import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCreator, safeReturnPath } from "@/lib/auth/runtime";
import { ensureUser } from "@/lib/ingestion/store";
import { launchPromotionStatus } from "@/lib/narrative/entitlement";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Welcome to Buildstory" };

type PageProps = { searchParams: Promise<{ next?: string }> };

export default async function OnboardingPage({ searchParams }: PageProps) {
  const creator = await requireCreator("/onboarding");
  const user = await ensureUser(creator);
  const next = safeReturnPath((await searchParams).next);
  if (user.onboardingCompletedAt) redirect(next);
  const promotion = launchPromotionStatus();

  return (
    <OnboardingFlow
      next={next}
      initialProfile={{
        displayName: user.displayName,
        handle: user.handle,
        bio: "",
        builderRole: null,
        avatarUrl: user.avatarUrl,
      }}
      proLaunchPromo={promotion.active ? { daysRemaining: promotion.daysRemaining } : null}
    />
  );
}
