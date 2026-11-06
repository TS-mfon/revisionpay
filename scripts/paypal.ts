import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { configuration } from "../apps/web/src/server/config";
import { saveEnv } from "./env";

const base = "https://api-m.sandbox.paypal.com";
async function main() {
  const c = configuration();
  if (!c.paypalClientId || !c.paypalSecret)
    throw new Error(
      "Save PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in .env.local first.",
    );
  const auth = await fetch(base + "/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(c.paypalClientId + ":" + c.paypalSecret).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(20000),
  });
  if (!auth.ok)
    throw new Error(
      "PayPal sandbox authentication failed (HTTP " + auth.status + ").",
    );
  const credentials = await auth.json();
  const headers = {
    Authorization: "Bearer " + credentials.access_token,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  console.log("PayPal sandbox credentials verified.");
  if (process.argv[2] === "webhook") {
    const url = c.appUrl + "/api/webhooks/paypal";
    if (!url.startsWith("https://"))
      throw new Error(
        "Set APP_URL to the hosted HTTPS application before registering a webhook.",
      );
    const list = await fetch(base + "/v1/notifications/webhooks", {
      headers,
      signal: AbortSignal.timeout(20000),
    });
    if (!list.ok) throw new Error("Could not read PayPal webhooks.");
    const hooks = (await list.json()).webhooks || [];
    const existing = hooks.find((hook: { url: string }) => hook.url === url);
    let id = existing?.id;
    const previous = hooks.find(
      (hook: { id: string }) => hook.id === c.paypalWebhookId,
    );
    if (!id && previous) {
      const response = await fetch(
        base + "/v1/notifications/webhooks/" + previous.id,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify([{ op: "replace", path: "/url", value: url }]),
          signal: AbortSignal.timeout(20000),
        },
      );
      if (!response.ok)
        throw new Error("Could not update the configured webhook URL.");
      id = previous.id;
    }
    if (!id) {
      const response = await fetch(base + "/v1/notifications/webhooks", {
        method: "POST",
        headers,
        body: JSON.stringify({
          url,
          event_types: [
            "PAYMENT.AUTHORIZATION.CREATED",
            "PAYMENT.AUTHORIZATION.VOIDED",
            "PAYMENT.CAPTURE.COMPLETED",
            "PAYMENT.CAPTURE.PENDING",
            "PAYMENT.CAPTURE.DENIED",
            "PAYMENT.CAPTURE.REFUNDED",
            "PAYMENT.CAPTURE.REVERSED",
          ].map((name) => ({ name })),
        }),
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok)
        throw new Error(
          "Webhook registration failed (HTTP " + response.status + ").",
        );
      id = (await response.json()).id;
    }
    if (typeof id !== "string")
      throw new Error("PayPal did not return a webhook ID.");
    await saveEnv({ PAYPAL_WEBHOOK_ID: id });
    console.log("PayPal sandbox webhook configured for " + url);
    return;
  }
  if (c.paypalMerchantId) {
    console.log("Merchant ID is already configured.");
    return;
  }
  // An unapproved sandbox order reveals this application's merchant ID. No authorization or charge occurs.
  const response = await fetch(base + "/v2/checkout/orders", {
    method: "POST",
    headers: { ...headers, "PayPal-Request-Id": randomUUID() },
    body: JSON.stringify({
      intent: "AUTHORIZE",
      purchase_units: [
        {
          reference_id: "revisionpay-setup",
          description: "RevisionPay setup check; do not approve",
          amount: { currency_code: "USD", value: "25.00" },
        },
      ],
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok)
    throw new Error(
      "Sandbox setup order failed (HTTP " + response.status + ").",
    );
  const order = await response.json();
  const merchant = order.purchase_units?.[0]?.payee?.merchant_id;
  if (typeof merchant !== "string")
    throw new Error(
      "PayPal did not return a merchant ID; copy the sandbox business merchant ID into PAYPAL_MERCHANT_ID.",
    );
  await saveEnv({ PAYPAL_MERCHANT_ID: merchant });
  await fs.mkdir(".local", { recursive: true });
  await fs.writeFile(
    ".local/paypal-check.json",
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        orderId: order.id,
        status: order.status,
        merchantId: merchant,
        authorized: false,
        captured: false,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  console.log(
    "Sandbox merchant ID saved. Setup order is unapproved; no funds were authorized or charged.",
  );
}
main().catch(() => {
  console.error(
    "PayPal setup could not complete. Check sandbox credentials, connectivity, and APP_URL. Secret values were not logged.",
  );
  process.exitCode = 1;
});
