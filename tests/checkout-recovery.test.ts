import { afterEach, expect, it, vi } from "vitest";
import { DomainError, type Actor } from "../packages/domain/src/index";
import { LocalStore } from "../apps/web/src/server/store";
import { checkout, refreshCheckout } from "../apps/web/src/server/service";
import { paypal } from "../apps/web/src/server/paypal";
import { agreement } from "./helpers";

afterEach(() => vi.restoreAllMocks());
async function setup() {
  const a = agreement();
  a.mode = "sandbox";
  a.state = "AWAITING_BUYER";
  a.events = [];
  a.payment = {
    mode: "sandbox",
    status: "ORDER_CREATED",
    orderId: "original-order",
  };
  const store = new LocalStore();
  await store.createAgreement(a);
  await store.putValue(
    "approval:" + a.id,
    "https://www.sandbox.paypal.com/checkoutnow?token=original-order",
  );
  const client: Actor = {
    id: "buyer",
    tenantId: a.tenantId,
    kind: "buyer",
    role: "buyer",
    agreementId: a.id,
  };
  return { a, store, client };
}

it("stops returning a missing PayPal checkout without replacing its payment automatically", async () => {
  const { a, store, client } = await setup();
  vi.spyOn(paypal, "readAuthorization").mockRejectedValue(
    new DomainError("PAYPAL_INVALID_RESOURCE_ID", "Not found", 404),
  );
  const createOrder = vi.spyOn(paypal, "createOrder");
  await expect(checkout(store, client, a.id)).rejects.toThrow(/new agreement/);
  const saved = (await store.getAgreement(a.id))!;
  expect(saved.payment).toMatchObject({
    status: "ORDER_CREATED",
    orderId: "original-order",
    checkoutUnavailable: true,
  });
  expect(saved.payment.authorizationId).toBeUndefined();
  expect(createOrder).not.toHaveBeenCalled();
});

it("recovers an existing provider authorization after an interrupted return without authorizing twice", async () => {
  const { a, store, client } = await setup();
  vi.spyOn(paypal, "readAuthorization").mockResolvedValue({
    id: "confirmed-auth",
    status: "CREATED",
    at: new Date().toISOString(),
    payerId: "client",
  });
  const authorize = vi.spyOn(paypal, "authorize");
  const createOrder = vi.spyOn(paypal, "createOrder");
  await checkout(store, client, a.id);
  await refreshCheckout(store, client, a.id);
  const saved = (await store.getAgreement(a.id))!;
  expect(saved.payment.status).toBe("AUTHORIZED");
  expect(saved.payment.authorizationId).toBe("confirmed-auth");
  expect(saved.events.filter((e) => e.type === "AUTHORIZED")).toHaveLength(1);
  expect(authorize).not.toHaveBeenCalled();
  expect(createOrder).not.toHaveBeenCalled();
});

it("does not mistake a transient provider failure for a missing order", async () => {
  const { a, store, client } = await setup();
  vi.spyOn(paypal, "readAuthorization").mockRejectedValue(
    new DomainError("PAYPAL_UNREACHABLE", "Network unavailable", 503),
  );
  await expect(refreshCheckout(store, client, a.id)).rejects.toThrow(
    "Network unavailable",
  );
  expect(
    (await store.getAgreement(a.id))!.payment.checkoutUnavailable,
  ).toBeUndefined();
});
