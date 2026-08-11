import type { Metadata } from "next";
import { HomeFeed } from "@/components/home-feed";
import { MarketingLanding } from "@/components/marketing/landing";
import { getCreatorSession } from "@/lib/auth/runtime";
import { ensureUser } from "@/lib/ingestion/store";
import { getActivityFeed } from "@/lib/social/store";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: { absolute: "Buildstory - Your AI build, decoded." }, description: "Private AI-build reports that reveal decisions, patterns, costs, progress, and evidence-backed turning points." };

export const dynamic = "force-dynamic";

async function loadFeed(creator: NonNullable<Awaited<ReturnType<typeof getCreatorSession>>>) {
  try {
    const user = await ensureUser(creator);
    const entries = await getActivityFeed(user.id, 30);
    return { entries, unavailable: false };
  } catch {
    return { entries: [], unavailable: true };
  }
}

export default async function Home() {
  const creator = await getCreatorSession();
  if (!creator) return <MarketingLanding />;
  const user = await ensureUser(creator);
  if (!user.onboardingCompletedAt) redirect("/onboarding?next=/");
  const { entries, unavailable } = await loadFeed(creator);
  return <HomeFeed entries={entries} unavailable={unavailable} />;
}
