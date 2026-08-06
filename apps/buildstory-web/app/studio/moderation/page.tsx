import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ModerationQueue } from "@/components/moderation-queue";
import { requireCreator } from "@/lib/auth/runtime";
import { ensureUser } from "@/lib/ingestion/store";
import { listContentReports } from "@/lib/social/store";

export const metadata: Metadata = { title: "Moderation" };
export const dynamic = "force-dynamic";

export default async function ModerationPage() {
  const creator = await requireCreator("/studio/moderation");
  const user = await ensureUser(creator);
  if (user.role !== "moderator" && user.role !== "admin") notFound();
  return <section className="creator-page moderation-page"><span className="section-index">( MODERATION )</span><h1>Keep the public trail healthy.</h1><p>Review filed content reports and leave an auditable resolution.</p><ModerationQueue initialReports={await listContentReports("open")} /></section>;
}
