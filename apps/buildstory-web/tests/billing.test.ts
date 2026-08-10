import assert from "node:assert/strict";
import test from "node:test";
import Stripe from "stripe";
import { applyBillingUpdate, ensureUser, findUserIdByStripeCustomerId, getBillingProfile } from "../lib/ingestion/mock-store";

Reflect.set(process.env, "NODE_ENV", "test");
process.env.STRIPE_SECRET_KEY = "sk_test_billing_route_fixture";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_billing_route_fixture";

const { POST: webhook } = await import("../app/api/webhooks/stripe/route");

test("getBillingProfile/applyBillingUpdate round-trip Stripe subscription state on the mock store", () => {
  const user = ensureUser({ creatorId: "dev:billing-store-user", name: "Billing Store User", email: "billing-store@buildstory.local", image: null });

  const initial = getBillingProfile(user.id);
  assert.deepEqual(initial, {
    plan: "free",
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    subscriptionStatus: null,
    billingInterval: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
  });

  applyBillingUpdate(user.id, {
    stripeCustomerId: "cus_store_test",
    stripeSubscriptionId: "sub_store_test",
    subscriptionStatus: "active",
    billingInterval: "month",
    currentPeriodEnd: "2026-09-01T00:00:00.000Z",
    cancelAtPeriodEnd: false,
    plan: "pro",
  });

  assert.deepEqual(getBillingProfile(user.id), {
    plan: "pro",
    stripeCustomerId: "cus_store_test",
    stripeSubscriptionId: "sub_store_test",
    subscriptionStatus: "active",
    billingInterval: "month",
    currentPeriodEnd: "2026-09-01T00:00:00.000Z",
    cancelAtPeriodEnd: false,
  });
  assert.equal(findUserIdByStripeCustomerId("cus_store_test"), user.id);
  assert.equal(findUserIdByStripeCustomerId("cus_does_not_exist"), null);

  applyBillingUpdate(user.id, { plan: "free", stripeSubscriptionId: null, subscriptionStatus: null, billingInterval: null, currentPeriodEnd: null, cancelAtPeriodEnd: false });
  const downgraded = getBillingProfile(user.id);
  assert.equal(downgraded?.plan, "free");
  assert.equal(downgraded?.stripeSubscriptionId, null);
  assert.equal(downgraded?.stripeCustomerId, "cus_store_test", "the Stripe customer is kept so a later resubscribe reuses it");
});

function fakeSubscriptionEvent(overrides: Partial<{ status: string; customer: string; cancelAtPeriodEnd: boolean; metadata: Record<string, string> }> = {}) {
  return {
    id: "evt_test_subscription",
    object: "event",
    api_version: "2025-01-01",
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    type: "customer.subscription.updated",
    data: {
      object: {
        id: "sub_webhook_test",
        object: "subscription",
        status: overrides.status ?? "active",
        customer: overrides.customer ?? "cus_webhook_test",
        cancel_at_period_end: overrides.cancelAtPeriodEnd ?? false,
        metadata: overrides.metadata ?? {},
        items: {
          data: [
            {
              current_period_end: Math.floor(Date.now() / 1000) + 30 * 86_400,
              price: { recurring: { interval: "month" } },
            },
          ],
        },
      },
    },
  };
}

// A fixed signer, independent of process.env.STRIPE_SECRET_KEY - tests that
// manipulate that env var to exercise the route's fail-closed 503 paths must
// still be able to produce a validly-signed request.
const signer = new Stripe("sk_test_signer_fixture");

async function signedRequest(body: object, secret = process.env.STRIPE_WEBHOOK_SECRET!) {
  const payload = JSON.stringify(body);
  const signature = await signer.webhooks.generateTestHeaderStringAsync({ payload, secret });
  return new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": signature },
    body: payload,
  });
}

test("Stripe webhook route fails closed (503) when secrets are unconfigured", async () => {
  const previousKey = process.env.STRIPE_SECRET_KEY;
  const previousSecret = process.env.STRIPE_WEBHOOK_SECRET;
  try {
    delete process.env.STRIPE_SECRET_KEY;
    const noKeyResponse = await webhook(await signedRequest(fakeSubscriptionEvent(), previousSecret!));
    assert.equal(noKeyResponse.status, 503);

    process.env.STRIPE_SECRET_KEY = previousKey;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const noSecretResponse = await webhook(await signedRequest(fakeSubscriptionEvent(), previousSecret!));
    assert.equal(noSecretResponse.status, 503);
  } finally {
    process.env.STRIPE_SECRET_KEY = previousKey;
    process.env.STRIPE_WEBHOOK_SECRET = previousSecret;
  }
});

test("Stripe webhook route rejects an unverifiable signature", async () => {
  const response = await webhook(await signedRequest(fakeSubscriptionEvent(), "whsec_wrong_secret"));
  assert.equal(response.status, 400);
});

test("customer.subscription.updated moves the linked account to pro and back to free", async () => {
  const user = ensureUser({ creatorId: "dev:billing-webhook-user", name: "Billing Webhook User", email: "billing-webhook@buildstory.local", image: null });
  applyBillingUpdate(user.id, { stripeCustomerId: "cus_webhook_flow" });

  const activated = await webhook(await signedRequest(fakeSubscriptionEvent({ customer: "cus_webhook_flow", status: "active" })));
  assert.equal(activated.status, 200);
  assert.equal(getBillingProfile(user.id)?.plan, "pro");
  assert.equal(getBillingProfile(user.id)?.subscriptionStatus, "active");

  const canceled = await webhook(await signedRequest(fakeSubscriptionEvent({ customer: "cus_webhook_flow", status: "canceled" })));
  assert.equal(canceled.status, 200);
  assert.equal(getBillingProfile(user.id)?.plan, "free");
});

test("customer.subscription.deleted clears subscription state but keeps the Stripe customer", async () => {
  const user = ensureUser({ creatorId: "dev:billing-webhook-delete-user", name: "Billing Webhook Delete User", email: "billing-webhook-delete@buildstory.local", image: null });
  applyBillingUpdate(user.id, { stripeCustomerId: "cus_webhook_delete", stripeSubscriptionId: "sub_webhook_delete", subscriptionStatus: "active", plan: "pro" });

  const event = fakeSubscriptionEvent({ customer: "cus_webhook_delete" });
  event.type = "customer.subscription.deleted";
  const response = await webhook(await signedRequest(event));
  assert.equal(response.status, 200);

  const profile = getBillingProfile(user.id);
  assert.equal(profile?.plan, "free");
  assert.equal(profile?.stripeSubscriptionId, null);
  assert.equal(profile?.stripeCustomerId, "cus_webhook_delete");
});

test("an unhandled event type is acknowledged without touching any account", async () => {
  const event = fakeSubscriptionEvent();
  event.type = "invoice.paid";
  const response = await webhook(await signedRequest(event));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { received: true });
});
