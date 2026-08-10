import { jsonError } from "@/lib/api/responses";
import { billingUpdateFromSubscription, getStripeClient, getWebhookSecret } from "@/lib/billing/stripe";
import { applyBillingUpdate, findUserIdByStripeCustomerId } from "@/lib/ingestion/store";
import { logOperationalEvent } from "@/lib/observability/log";
import type Stripe from "stripe";

/**
 * Server-to-server caller, like the internal cron endpoint - no creator
 * session, no same-origin check. Trust is established by the Stripe
 * signature instead of a bearer secret or cookies.
 */
export async function POST(request: Request) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secretKey || !webhookSecret) {
    return jsonError("billing_unavailable", "This deployment has not configured Stripe billing.", 503);
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return jsonError("missing_signature", "A Stripe-Signature header is required.", 400);
  }

  const rawBody = await request.text();
  const stripe = getStripeClient();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, getWebhookSecret());
  } catch {
    return jsonError("invalid_signature", "The Stripe signature could not be verified.", 400);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId = session.client_reference_id ?? undefined;
        const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
        const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
        if (!userId || !subscriptionId || !customerId) break;
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        await applyBillingUpdate(userId, {
          stripeCustomerId: customerId,
          ...billingUpdateFromSubscription(subscription),
        });
        break;
      }
      case "customer.subscription.updated": {
        const subscription = event.data.object;
        const userId = await resolveUserId(subscription);
        if (!userId) break;
        await applyBillingUpdate(userId, billingUpdateFromSubscription(subscription));
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const userId = await resolveUserId(subscription);
        if (!userId) break;
        await applyBillingUpdate(userId, {
          plan: "free",
          stripeSubscriptionId: null,
          subscriptionStatus: null,
          billingInterval: null,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
        });
        break;
      }
      default:
        break;
    }
  } catch {
    logOperationalEvent("error", "billing.webhook_handler_failed");
    return jsonError("webhook_handler_failed", "Failed to apply the billing update.", 500);
  }

  return Response.json({ received: true }, { headers: { "cache-control": "no-store" } });
}

async function resolveUserId(subscription: Stripe.Subscription): Promise<string | null> {
  const metadataUserId = subscription.metadata.buildstoryUserId;
  if (metadataUserId) return metadataUserId;
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  return findUserIdByStripeCustomerId(customerId);
}
