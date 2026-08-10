import type { Metadata } from "next";
import { AccountDangerZone } from "@/components/creator/account-danger-zone";
import { BillingSettings } from "@/components/creator/billing-settings";
import { OllamaModelStatus } from "@/components/creator/ollama-model-status";
import { ProfileSettings } from "@/components/creator/profile-settings";
import { requireCreator } from "@/lib/auth/runtime";
import { isLocalApiEnabled } from "@/lib/ingestion/local-api";
import { ensureUser, getBillingProfile } from "@/lib/ingestion/store";
import { cloudNarrativeAvailable } from "@/lib/narrative/entitlement";
import { getProfile } from "@/lib/social/store";

export const metadata: Metadata = { title: "Account settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const creator = await requireCreator("/studio/settings");
  const user = await ensureUser(creator);
  const profile = await getProfile(user.id).catch(() => null);
  const billing = await getBillingProfile(user.id);

  return (
    <section className="creator-page">
      <span className="section-index">( ACCOUNT SETTINGS )</span>
      <h1>Your data, your call.</h1>
      <p>Manage the public identity, narrative privacy, export, and account controls for @{user.handle}.</p>
      <div className="settings-sections">
        <section><header><span className="section-index">01 / PROFILE</span><h2>How builders find you.</h2><p>Your name, handle, bio, and builder role appear on published stories.</p></header><ProfileSettings handle={user.handle} displayName={user.displayName} bio={profile?.bio ?? ""} builderRole={user.builderRole} handleChangeAvailable={!user.handleChangedAt} /></section>
        <section><header><span className="section-index">02 / AI &amp; PRIVACY</span><h2>Choose where narrative work happens.</h2><p>OpenRouter Cloud is recommended for deep reports; Local keeps reviewed evidence on this machine.</p></header><OllamaModelStatus discoveryAvailable={isLocalApiEnabled()} cloudAvailable={await cloudNarrativeAvailable(user.id)} /></section>
        <section><header><span className="section-index">03 / DATA EXPORT</span><h2>Take your data with you.</h2><p>Export your profile, stories, reactions, comments, and scanner records.</p></header><AccountDangerZone handle={user.handle} exportOnly /></section>
        <section><header><span className="section-index">04 / BILLING</span><h2>Pro, on your terms.</h2><p>Upgrade for deeper AI-generated reports, or manage an existing subscription.</p></header><BillingSettings plan={billing?.plan ?? user.plan} billingInterval={billing?.billingInterval ?? null} currentPeriodEnd={billing?.currentPeriodEnd ?? null} cancelAtPeriodEnd={billing?.cancelAtPeriodEnd ?? false} /></section>
        <section className="settings-sections__danger"><header><span className="section-index">05 / DANGER ZONE</span><h2>Close your account.</h2><p>Deletion is permanent and removes private scans and public social activity.</p></header><AccountDangerZone handle={user.handle} deleteOnly /></section>
      </div>
    </section>
  );
}
