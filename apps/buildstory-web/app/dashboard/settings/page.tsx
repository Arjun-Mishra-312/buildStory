import type { Metadata } from "next";
import { AccountDangerZone } from "@/components/creator/account-danger-zone";
import { requireCreator } from "@/lib/auth/runtime";
import { ensureUser } from "@/lib/ingestion/store";

export const metadata: Metadata = { title: "Account settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const creator = await requireCreator("/dashboard/settings");
  const user = await ensureUser(creator);

  return (
    <main className="creator-page">
      <span className="section-index">( ACCOUNT SETTINGS )</span>
      <h1>Your data, your call.</h1>
      <p>Export everything Buildstory holds about @{user.handle}, or permanently delete your account.</p>
      <AccountDangerZone handle={user.handle} />
    </main>
  );
}
