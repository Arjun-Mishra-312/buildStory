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
 * Deliberately narrow: this governs only the subsidized-cloud benefits
 * (budget cap, escalation model). Scans and chapters through local, BYOK, or
 * off mode are unlimited on every tier regardless of plan - those runs cost
 * the operator nothing, so metering them would only push people toward Pro
 * for no reason (a decision made explicit after the initial launch audit).
 */
export function effectivePlan(accountPlan: "free" | "pro"): "free" | "pro" {
  if (process.env.BUILDSTORY_LAUNCH_PRO_FOR_ALL === "true") return "pro";
  return accountPlan;
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
