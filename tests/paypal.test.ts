import { afterEach, expect, it, vi } from "vitest";
import {
  matchesWebhook,
  validateOrder,
  paypal,
  requestPayPal,
  verifyWebhook,
} from "../apps/web/src/server/paypal";
import { freeze } from "../apps/web/src/server/model";
import { agreement } from "./helpers";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("matches webhooks only through populated provider identifiers", () => {
  const draft = agreement();
  draft.mode = "sandbox";
  draft.payment = { mode: "sandbox", status: "NONE" };
  const a = agreement();
  a.mode = "sandbox";
  const event = { resource: { id: a.payment.authorizationId } };
  expect(matchesWebhook(draft, event)).toBe(false);
  expect(matchesWebhook(a, event)).toBe(true);
  expect(matchesWebhook(a, {})).toBe(false);
  expect(matchesWebhook(a, { resource: { id: "different" } })).toBe(false);
});

it.each(["DIRECT", "PLATFORM"] as const)(
  "uses only the frozen %s integration credentials for orders",
  async (integration) => {
    vi.stubEnv("PAYPAL_CLIENT_ID", "direct-order-client");
    vi.stubEnv("PAYPAL_CLIENT_SECRET", "direct-order-secret");
    vi.stubEnv("PAYPAL_PLATFORM_CLIENT_ID", "platform-order-client");
    vi.stubEnv("PAYPAL_PLATFORM_CLIENT_SECRET", "platform-order-secret");
    const a = agreement();
    a.mode = "sandbox";
    a.termsVersion = "2";
    a.payment.merchantId = "frozen-merchant";
    a.payment.integration = integration;
    freeze(a);
    // Mutable payment metadata cannot redirect a frozen agreement to another app.
    a.payment.integration = integration === "DIRECT" ? "PLATFORM" : "DIRECT";
    const calls: { url: string; headers: Headers }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, init) => {
        calls.push({ url: String(url), headers: new Headers(init?.headers) });
        if (String(url).endsWith("/token"))
          return Response.json({ access_token: "order-token", expires_in: 0 });
        return Response.json({
          id: "new-order",
          intent: "AUTHORIZE",
          purchase_units: [
            {
              reference_id: a.id,
              custom_id: a.id,
              amount: { currency_code: "USD", value: "180.00" },
              payee: { merchant_id: "frozen-merchant" },
            },
          ],
          links: [
            {
              rel: "approve",
              href: "https://www.sandbox.paypal.com/checkoutnow?token=new-order",
            },
          ],
        });
      }),
    );
    await paypal.createOrder(a, "order-request");
    const prefix = integration.toLowerCase();
    expect(calls[0].headers.get("authorization")).toBe(
      "Basic " +
        Buffer.from(`${prefix}-order-client:${prefix}-order-secret`).toString(
          "base64",
        ),
    );
    const assertion = calls[1].headers.get("paypal-auth-assertion");
    if (integration === "DIRECT") expect(assertion).toBeNull();
    else
      expect(
        JSON.parse(
          Buffer.from(assertion!.split(".")[1], "base64url").toString(),
        ),
      ).toEqual({ iss: "platform-order-client", payer_id: "frozen-merchant" });
  },
);

it("uses the platform app for onboarding before a merchant is known", async () => {
  vi.stubEnv("PAYPAL_PLATFORM_CLIENT_ID", "onboarding-client");
  vi.stubEnv("PAYPAL_PLATFORM_CLIENT_SECRET", "onboarding-secret");
  const fetch = vi.fn(async (url, init) => {
    if (String(url).endsWith("/token")) {
      expect(new Headers(init?.headers).get("authorization")).toBe(
        "Basic " +
          Buffer.from("onboarding-client:onboarding-secret").toString("base64"),
      );
      return Response.json({ access_token: "platform-token", expires_in: 0 });
    }
    expect(new Headers(init?.headers).get("paypal-auth-assertion")).toBeNull();
    return Response.json({});
  });
  vi.stubGlobal("fetch", fetch);
  await requestPayPal(
    "/v2/customer/partner-referrals",
    "POST",
    {},
    "referral",
    "sandbox",
    undefined,
    "PLATFORM",
  );
  expect(fetch).toHaveBeenCalledTimes(2);
});

it.each(["DIRECT", "PLATFORM"] as const)(
  "verifies %s webhook signatures against the matching app registration",
  async (integration) => {
    vi.stubEnv("PAYPAL_CLIENT_ID", "direct-webhook-client");
    vi.stubEnv("PAYPAL_CLIENT_SECRET", "direct-webhook-secret");
    vi.stubEnv("PAYPAL_PLATFORM_CLIENT_ID", "platform-webhook-client");
    vi.stubEnv("PAYPAL_PLATFORM_CLIENT_SECRET", "platform-webhook-secret");
    vi.stubEnv("PAYPAL_WEBHOOK_ID", "direct-hook");
    vi.stubEnv("PAYPAL_PLATFORM_WEBHOOK_ID", "platform-hook");
    const prefix = integration.toLowerCase();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, init) => {
        if (String(url).endsWith("/token")) {
          expect(new Headers(init?.headers).get("authorization")).toBe(
            "Basic " +
              Buffer.from(
                `${prefix}-webhook-client:${prefix}-webhook-secret`,
              ).toString("base64"),
          );
          return Response.json({ access_token: "hook-token", expires_in: 0 });
        }
        expect(JSON.parse(init.body).webhook_id).toBe(prefix + "-hook");
        return Response.json({ verification_status: "SUCCESS" });
      }),
    );
    expect(
      await verifyWebhook(
        new Headers({
          "paypal-auth-algo": "SHA256withRSA",
          "paypal-cert-url": "https://api.sandbox.paypal.com/cert",
          "paypal-transmission-id": "event",
          "paypal-transmission-sig": "signature",
          "paypal-transmission-time": new Date().toISOString(),
        }),
        { id: "event" },
        "sandbox",
        integration,
      ),
    ).toBe(true);
  },
);
it("rejects orders for another merchant, amount, agreement, or payment intent", () => {
  vi.stubEnv("PAYPAL_MERCHANT_ID", "sandbox-merchant");
  const a = agreement();
  a.mode = "sandbox";
  a.payment.merchantId = "sandbox-merchant";
  const unit = {
    reference_id: a.id,
    custom_id: a.id,
    amount: { currency_code: "USD", value: "180.00" },
    payee: { merchant_id: "sandbox-merchant" },
  };
  const order = {
    id: a.payment.orderId,
    intent: "AUTHORIZE",
    purchase_units: [unit],
  };
  expect(validateOrder(a, order)).toEqual(unit);
  for (const bad of [
    { ...order, intent: "CAPTURE" },
    { ...order, id: "different" },
    { ...order, purchase_units: [{ ...unit, reference_id: "different" }] },
    {
      ...order,
      purchase_units: [{ ...unit, payee: { merchant_id: "other" } }],
    },
    {
      ...order,
      purchase_units: [
        { ...unit, amount: { currency_code: "USD", value: "179.99" } },
      ],
    },
  ])
    expect(() => validateOrder(a, bad)).toThrow();
});
