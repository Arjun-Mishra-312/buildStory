import type { Metadata } from "next";
import { HomeFeed } from "@/components/home-feed";
import { MarketingLanding } from "@/components/marketing/landing";
import { getCreatorSession } from "@/lib/auth/runtime";
import { ensureUser } from "@/lib/ingestion/store";
import { getActivityFeed } from "@/lib/social/store";

export const metadata: Metadata = { title: { absolute: "Buildstory — Show the story behind the software" }, description: "A community for AI-assisted software builders to share the decisions, detours, and tools behind what they ship." };

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
  const { entries, unavailable } = await loadFeed(creator);
  return <HomeFeed entries={entries} unavailable={unavailable} />;
}
