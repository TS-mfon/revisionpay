import { afterEach, expect, it, vi } from "vitest";
import { matchesWebhook, validateOrder } from "../apps/web/src/server/paypal";
import { agreement } from "./helpers";
afterEach(() => vi.unstubAllEnvs());

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
it("rejects orders for another merchant, amount, agreement, or payment intent", () => {
  vi.stubEnv("PAYPAL_MERCHANT_ID", "sandbox-merchant");
  const a = agreement();
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
