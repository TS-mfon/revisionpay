import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Actor, MerchantConnection } from "../packages/domain/src/index";
import { refreshMerchant } from "../apps/web/src/server/merchants";
import { requestPayPal } from "../apps/web/src/server/paypal";
import { LocalStore } from "../apps/web/src/server/store";

vi.mock("../apps/web/src/server/paypal", () => ({ requestPayPal: vi.fn() }));
const request = vi.mocked(requestPayPal);
const seller: Actor = {
  id: "seller",
  tenantId: "seller:email-confirmation",
  kind: "seller",
  role: "seller",
};
const connection: MerchantConnection = {
  tenantId: seller.tenantId,
  environment: "sandbox",
  trackingId: "rp-saved-tracking-id",
  status: "PENDING",
};
const key = "merchant:sandbox:" + seller.tenantId;
const permissions = [
  {
    oauth_third_party: [
      {
        scopes: [
          "https://uri.paypal.com/services/payments/payment/authcapture",
        ],
      },
    ],
  },
];
const ready = {
  merchant_id: "saved-merchant",
  primary_email_confirmed: true,
  payments_receivable: true,
  oauth_integrations: permissions,
};
beforeEach(() => {
  vi.stubEnv("REVISIONPAY_MODE", "sandbox");
  vi.stubEnv("PAYPAL_PARTNER_ID", "test-platform");
  request.mockReset();
});
afterEach(() => vi.unstubAllEnvs());
async function pendingStore() {
  const store = new LocalStore();
  await store.putValue(key, connection);
  return store;
}
function providerStatus(details: Record<string, unknown>) {
  request
    .mockResolvedValueOnce({
      merchant_id: ready.merchant_id,
      tracking_id: connection.trackingId,
    })
    .mockResolvedValueOnce(details);
}

it("keeps an unconfirmed seller pending, then connects only after PayPal confirms all requirements", async () => {
  const store = await pendingStore();
  providerStatus({ ...ready, primary_email_confirmed: false });
  const pending = await refreshMerchant(store, seller);
  expect(pending.status).toBe("PENDING");
  expect(pending.checks).toEqual({
    emailConfirmed: false,
    paymentsReceivable: true,
    permissionsGranted: true,
  });
  expect(request.mock.calls.map((call) => call[0])).toEqual([
    "/v1/customer/partners/test-platform/merchant-integrations?tracking_id=rp-saved-tracking-id",
    "/v1/customer/partners/test-platform/merchant-integrations/saved-merchant",
  ]);
  providerStatus(ready);
  const connected = await refreshMerchant(store, seller);
  expect(connected.status).toBe("READY");
  expect(connected.checks?.emailConfirmed).toBe(true);
  expect(await store.getValue(key)).toEqual(connected);
});

it.each([
  ["receiving payments", { ...ready, payments_receivable: false }],
  ["payment permission", { ...ready, oauth_integrations: [] }],
  [
    "missing email confirmation",
    { ...ready, primary_email_confirmed: undefined },
  ],
])("does not connect an account missing %s", async (_, details) => {
  const store = await pendingStore();
  providerStatus(details);
  expect((await refreshMerchant(store, seller)).status).toBe("PENDING");
});

it("rejects a different tracking ID before reading an account's status", async () => {
  const store = await pendingStore();
  request.mockResolvedValueOnce({ ...ready, tracking_id: "another-workspace" });
  await expect(refreshMerchant(store, seller)).rejects.toThrow(
    /Finish the steps/,
  );
  expect(request).toHaveBeenCalledTimes(1);
  expect(await store.getValue(key)).toEqual(connection);
});

it("rejects status for a merchant that was not resolved through the saved tracking ID", async () => {
  const store = await pendingStore();
  providerStatus({ ...ready, merchant_id: "another-merchant" });
  await expect(refreshMerchant(store, seller)).rejects.toThrow(
    /different account/,
  );
  expect(await store.getValue(key)).toEqual(connection);
});

it("does not turn a failed PayPal read into a connection or a new email diagnosis", async () => {
  const store = await pendingStore();
  request
    .mockResolvedValueOnce({
      merchant_id: ready.merchant_id,
      tracking_id: connection.trackingId,
    })
    .mockRejectedValueOnce(new Error("PayPal unavailable"));
  await expect(refreshMerchant(store, seller)).rejects.toThrow(/unavailable/);
  expect(await store.getValue(key)).toEqual(connection);
});
