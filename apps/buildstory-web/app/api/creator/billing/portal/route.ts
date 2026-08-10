import { ingestionErrorResponse, jsonError, requireApiCreator } from "@/lib/api/responses";
import { getStripeClient } from "@/lib/billing/stripe";
import { ensureUser, getBillingProfile } from "@/lib/ingestion/store";
import { assertSameOriginBrowserMutation } from "@/lib/security/browser-request";

/** Opens the Stripe Billing Portal for a creator who already has a subscription, so they can update payment or cancel. */
export async function POST(request: Request) {
  const creator = await requireApiCreator();
  if (!creator) return jsonError("unauthorized", "Creator sign-in required.", 401);

  try {
    assertSameOriginBrowserMutation(request);
    const user = await ensureUser(creator);
    const billing = await getBillingProfile(user.id);
    if (!billing?.stripeCustomerId) {
      return jsonError("no_billing_customer", "No billing history found for this account.", 400);
    }

    const stripe = getStripeClient();
    const origin = new URL(request.url).origin;
    const session = await stripe.billingPortal.sessions.create({
      customer: billing.stripeCustomerId,
      return_url: `${origin}/studio/settings`,
    });

    return Response.json({ url: session.url }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return ingestionErrorResponse(error);
  }
}
