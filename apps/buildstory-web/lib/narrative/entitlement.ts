import { configuredCloudNarrativeProvider, narrativeProviderConfigured, openRouterZdrModelReady } from "./provider";

/**
 * Single policy seam for cloud narrative access. Everyone is entitled at
 * launch; Pro gating can be added here without changing ingestion or queue
 * behavior.
 */
export function canUseCloudNarrative(userId: string): boolean {
  void userId;
  return true;
}

/**
 * BUILDSTORY_LAUNCH_PRO_FOR_ALL grants every account Pro benefits without
 * writing to buildstory_users.plan, so ending the launch promotion later is
 * one var flip, not a data migration or a per-account downgrade. The column
 * always holds the account's real, durable plan.
 *
 * BUILDSTORY_LAUNCH_PRO_PROMOTION_ENDS_AT (optional, ISO 8601) makes that
 * flip automatic instead of relying on someone remembering to make it: once
 * the deployment's clock passes this timestamp, the promotion stops on its
 * own, no redeploy needed. Left unset, BUILDSTORY_LAUNCH_PRO_FOR_ALL behaves
 * exactly as before - on indefinitely until manually turned off. A missing
 * or unparseable value is treated the same as unset (ignored, not an outage)
 * so a malformed date can't silently cut a live promotion short.
 *
 * Deliberately narrow: this governs only the subsidized-cloud benefits
 * (budget cap, escalation model). Scans and chapters through local, BYOK, or
 * off mode are unlimited on every tier regardless of plan - those runs cost
 * the operator nothing, so metering them would only push people toward Pro
 * for no reason (a decision made explicit after the initial launch audit).
 */
export function effectivePlan(accountPlan: "free" | "pro"): "free" | "pro" {
  if (launchPromotionActive()) return "pro";
  return accountPlan;
}

export function launchPromotionActive(): boolean {
  if (process.env.BUILDSTORY_LAUNCH_PRO_FOR_ALL !== "true") return false;
  const endsAt = process.env.BUILDSTORY_LAUNCH_PRO_PROMOTION_ENDS_AT;
  if (!endsAt) return true;
  const parsed = Date.parse(endsAt);
  if (Number.isNaN(parsed)) return true;
  return Date.now() < parsed;
}

/**
 * UI-facing view of the same promotion, for surfaces that announce it
 * (onboarding popup, in-studio expiry reminder) rather than just enforcing
 * it. daysRemaining is null when there's no parseable end date to count
 * down to - the promotion is active but open-ended.
 */
export function launchPromotionStatus(): { active: boolean; endsAt: string | null; daysRemaining: number | null } {
  const active = launchPromotionActive();
  const endsAt = process.env.BUILDSTORY_LAUNCH_PRO_PROMOTION_ENDS_AT ?? null;
  if (!active || !endsAt) return { active, endsAt: null, daysRemaining: null };
  const parsed = Date.parse(endsAt);
  if (Number.isNaN(parsed)) return { active, endsAt: null, daysRemaining: null };
  const daysRemaining = Math.max(0, Math.ceil((parsed - Date.now()) / (24 * 60 * 60 * 1000)));
  return { active, endsAt, daysRemaining };
}

/**
 * The one check every surface offering the Cloud narrative option must call
 * before rendering it. Combines "is a provider actually configured on this
 * deployment" with "is this account entitled" so the UI can never offer a
 * mode the deployment cannot honor - the failure mode of getting that wrong
 * is a creator reviewing and releasing excerpts that then upload and are
 * stored with nowhere to go (see the pre-launch audit).
 */
export async function cloudNarrativeAvailable(userId: string): Promise<boolean> {
  if (!narrativeProviderConfigured("cloud") || !canUseCloudNarrative(userId)) return false;
  // The catalog check protects the deployed Cloud offering. Local development
  // and tests must remain deterministic and must never depend on OpenRouter.
  if (configuredCloudNarrativeProvider() !== "openrouter" || process.env.NODE_ENV !== "production") return true;
  return openRouterZdrModelReady();
}
