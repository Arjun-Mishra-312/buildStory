import { ingestionErrorResponse, jsonError, requireApiCreator } from "@/lib/api/responses";
import { getPriceId, getStripeClient } from "@/lib/billing/stripe";
import { readBoundedJson } from "@/lib/ingestion/local-api";
import { applyBillingUpdate, ensureUser, getBillingProfile } from "@/lib/ingestion/store";
import { assertSameOriginBrowserMutation } from "@/lib/security/browser-request";

const ALLOWED_INTERVALS = new Set(["month", "year"]);

/** Starts a Stripe Checkout session for the signed-in creator to subscribe to Pro. */
export async function POST(request: Request) {
  const creator = await requireApiCreator();
  if (!creator) return jsonError("unauthorized", "Creator sign-in required.", 401);

  try {
    assertSameOriginBrowserMutation(request);
    const { value } = await readBoundedJson(request, 1024);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return jsonError("invalid_checkout_request", "A checkout request object is required.", 422);
    }
    const raw = value as Record<string, unknown>;
    if (typeof raw.interval !== "string" || !ALLOWED_INTERVALS.has(raw.interval)) {
      return jsonError("invalid_checkout_request", "interval must be 'month' or 'year'.", 422);
    }
    const interval = raw.interval as "month" | "year";

    const user = await ensureUser(creator);
    const billing = await getBillingProfile(user.id);
    const stripe = getStripeClient();

    let customerId = billing?.stripeCustomerId ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: creator.email,
        metadata: { buildstoryUserId: user.id },
      });
      customerId = customer.id;
      await applyBillingUpdate(user.id, { stripeCustomerId: customerId });
    }

    const origin = new URL(request.url).origin;
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: getPriceId(interval), quantity: 1 }],
      client_reference_id: user.id,
      subscription_data: { metadata: { buildstoryUserId: user.id } },
      success_url: `${origin}/studio/settings?billing=success`,
      cancel_url: `${origin}/studio/settings?billing=cancelled`,
    });

    if (!session.url) {
      return jsonError("checkout_session_incomplete", "Stripe did not return a checkout URL.", 502);
    }
    return Response.json({ url: session.url }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return ingestionErrorResponse(error);
  }
}
