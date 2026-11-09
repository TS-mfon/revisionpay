import { randomUUID } from "node:crypto";
import {
  requireCondition,
  type Actor,
  type MerchantConnection,
} from "@revisionpay/domain";
import { sha256 } from "@revisionpay/domain/crypto";
import { configuration, readiness } from "./config";
import { requestPayPal } from "./paypal";
import type { Store } from "./store";
import { safeReturnPath } from "../lib/navigation";

export const merchantEnvironment = () =>
  configuration().mode === "sandbox" ? ("sandbox" as const) : ("live" as const);
const key = (tenant: string, environment = merchantEnvironment()) =>
  "merchant:" + environment + ":" + tenant;
export async function merchantStatus(
  store: Store,
  who: Actor,
): Promise<MerchantConnection> {
  const environment = merchantEnvironment();
  if (
    who.kind === "owner" &&
    environment === "sandbox" &&
    configuration().paypalMerchantId
  )
    return {
      tenantId: who.tenantId,
      environment,
      status: "READY",
      trackingId: "legacy-owner",
      merchantId: configuration().paypalMerchantId,
    };
  return (
    (await store.getValue<MerchantConnection>(key(who.tenantId))) || {
      tenantId: who.tenantId,
      environment,
      status: "NOT_CONNECTED",
      trackingId: "rp-" + sha256(who.tenantId + environment).slice(0, 32),
    }
  );
}
export async function connectMerchant(
  store: Store,
  who: Actor,
  returnTo?: string,
) {
  requireCondition(
    who.role === "seller" && who.kind !== "demo",
    "SELLER_REQUIRED",
    "Sign in to connect your PayPal account.",
    403,
  );
  requireCondition(
    readiness().merchantOnboarding,
    "ONBOARDING_UNAVAILABLE",
    "PayPal account connections are not available yet. Your draft is saved.",
    503,
  );
  const connection = await merchantStatus(store, who);
  const result = await requestPayPal(
    "/v2/customer/partner-referrals",
    "POST",
    {
      tracking_id: connection.trackingId,
      operations: [
        {
          operation: "API_INTEGRATION",
          api_integration_preference: {
            rest_api_integration: {
              integration_method: "PAYPAL",
              integration_type: "THIRD_PARTY",
              third_party_details: { features: ["PAYMENT", "REFUND"] },
            },
          },
        },
      ],
      products: ["EXPRESS_CHECKOUT"],
      legal_consents: [{ type: "SHARE_DATA_CONSENT", granted: true }],
      partner_config_override: {
        return_url:
          configuration().appUrl +
          "/settings?paypal=connected&returnTo=" +
          encodeURIComponent(safeReturnPath(returnTo)),
        return_url_description: "Return to RevisionPay",
      },
    },
    randomUUID(),
    connection.environment,
    undefined,
    "PLATFORM",
  );
  const link = result.links?.find(
    (l: { rel: string }) => l.rel === "action_url",
  )?.href;
  const url = new URL(String(link));
  requireCondition(
    url.protocol === "https:" &&
      (connection.environment === "live"
        ? ["www.paypal.com", "paypal.com"]
        : ["www.sandbox.paypal.com", "sandbox.paypal.com"]
      ).includes(url.hostname),
    "INVALID_ONBOARDING_LINK",
    "PayPal did not return a valid connection link.",
  );
  await store.putValue(key(who.tenantId), { ...connection, status: "PENDING" });
  return { url: url.href };
}
export function onboardingComplete(result: Record<string, any>) {
  const scopes = (result.oauth_integrations || []).flatMap((v: any) =>
    (v.oauth_third_party || []).flatMap((p: any) => p.scopes || []),
  );
  return (
    result.payments_receivable === true &&
    result.primary_email_confirmed === true &&
    scopes.some((s: string) => s.endsWith("/payment/authcapture"))
  );
}
export async function refreshMerchant(store: Store, who: Actor) {
  const connection = await merchantStatus(store, who),
    c = configuration();
  requireCondition(
    connection.trackingId !== "legacy-owner",
    "ALREADY_CONNECTED",
    "Your sandbox merchant account is already connected.",
  );
  const partner =
    connection.environment === "live" ? c.livePartnerId : c.partnerId;
  requireCondition(
    partner,
    "ONBOARDING_UNAVAILABLE",
    "PayPal account connections are not configured yet.",
    503,
  );
  // Resolve the merchant by our own saved tracking ID; never trust redirect parameters.
  const result = await requestPayPal(
    "/v1/customer/partners/" +
      encodeURIComponent(partner) +
      "/merchant-integrations?tracking_id=" +
      encodeURIComponent(connection.trackingId),
    "GET",
    undefined,
    undefined,
    connection.environment,
    undefined,
    "PLATFORM",
  );
  requireCondition(
    result.tracking_id === connection.trackingId &&
      typeof result.merchant_id === "string",
    "MERCHANT_PENDING",
    "Finish the steps in PayPal, then check your connection again.",
  );
  const saved: MerchantConnection = {
    ...connection,
    merchantId: result.merchant_id,
    legalName: result.legal_name,
    country: result.country,
    checkedAt: new Date().toISOString(),
    status: onboardingComplete(result) ? "READY" : "PENDING",
  };
  await store.putValue(key(who.tenantId), saved);
  return saved;
}
export async function onboardingWebhook(
  store: Store,
  event: Record<string, any>,
  environment: "live" | "sandbox",
) {
  if (
    ![
      "MERCHANT.ONBOARDING.COMPLETED",
      "MERCHANT.PARTNER-CONSENT.REVOKED",
    ].includes(event.event_type)
  )
    return;
  const connections = await store.listValues<MerchantConnection>(
    "merchant:" + environment + ":",
  );
  const resource = event.resource || {};
  const match = connections.find(
    (c) =>
      (c.merchantId && c.merchantId === resource.merchant_id) ||
      (c.trackingId && c.trackingId === resource.tracking_id),
  );
  if (!match) return;
  if (event.event_type === "MERCHANT.PARTNER-CONSENT.REVOKED")
    await store.putValue(key(match.tenantId, environment), {
      ...match,
      status: "REVOKED",
      checkedAt: new Date().toISOString(),
    });
  // Completion is verified with a provider read when the seller returns. A webhook alone never enables payments.
}
