import Stripe from "stripe";
import type { BillingUpdate } from "@/lib/ingestion/contracts";

/** Same marker shape as D1IngestionError/SocialError, so ingestionErrorResponse() can translate this without knowing about billing specifically. */
export class BillingError extends Error {
  readonly isBuildstoryIngestionError = true;

  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: string[],
  ) {
    super(message);
  }
}

/**
 * Fresh client per call rather than a module-level singleton - construction
 * does no I/O, and this avoids any question of stale env vars surviving a
 * Worker isolate across a config change or local dev reload.
 */
export function getStripeClient(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new BillingError("billing_unavailable", "Billing is not configured on this deployment.", 503);
  }
  return new Stripe(secretKey);
}

const PRICE_ENV_VAR = {
  month: "STRIPE_PRICE_ID_MONTHLY",
  year: "STRIPE_PRICE_ID_ANNUAL",
} as const;

export function getPriceId(interval: "month" | "year"): string {
  const value = process.env[PRICE_ENV_VAR[interval]];
  if (!value) {
    throw new BillingError("billing_unavailable", "Billing is not configured on this deployment.", 503);
  }
  return value;
}

export function getWebhookSecret(): string {
  const value = process.env.STRIPE_WEBHOOK_SECRET;
  if (!value) {
    throw new BillingError("billing_unavailable", "Billing is not configured on this deployment.", 503);
  }
  return value;
}

/**
 * current_period_end and the price/interval live on the subscription's first
 * item, not the subscription itself, as of this SDK's pinned API version -
 * Stripe moved billing-period fields to support multi-item subscriptions.
 * Buildstory only ever creates single-item subscriptions (one Price per
 * Checkout session), so the first item is always the one that matters.
 */
export function billingUpdateFromSubscription(subscription: Stripe.Subscription): BillingUpdate {
  const item = subscription.items.data[0];
  const interval = item?.price.recurring?.interval;
  return {
    stripeSubscriptionId: subscription.id,
    subscriptionStatus: subscription.status,
    billingInterval: interval === "month" ? "month" : interval === "year" ? "year" : null,
    currentPeriodEnd: item ? new Date(item.current_period_end * 1000).toISOString() : null,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    plan: subscription.status === "active" || subscription.status === "trialing" ? "pro" : "free",
  };
}
