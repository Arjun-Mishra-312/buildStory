import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MarketingLanding } from "@/components/marketing/landing";
import { getCreatorSession } from "@/lib/auth/runtime";

export const metadata: Metadata = { title: { absolute: "Buildstory — Show the story behind the software" }, description: "A community for AI-assisted software builders to share the decisions, detours, and tools behind what they ship." };

export default async function Home() {
  const creator = await getCreatorSession();
  if (!creator) return <MarketingLanding />;
  redirect("/explore");
}
