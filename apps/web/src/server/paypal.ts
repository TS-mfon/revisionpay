import {
  DomainError,
  decimalAmount,
  parseAmount,
  requireCondition,
  type Agreement,
} from "@revisionpay/domain";
import { configuration } from "./config";

// All money calls are pinned to PayPal's sandbox. There is no live-mode switch.
const BASE = "https://api-m.sandbox.paypal.com";
type Resource = Record<string, any>;
export class ProviderError extends DomainError {
  constructor(
    code: string,
    message: string,
    public uncertain: boolean,
    public providerStatus?: number,
  ) {
    super(code, message, 502);
  }
}
let cached: { key: string; token: string; until: number } | undefined;
async function token(): Promise<string> {
  const c = configuration();
  requireCondition(
    c.paypalClientId && c.paypalSecret,
    "PAYPAL_NOT_CONFIGURED",
    "PayPal sandbox credentials are not configured.",
    503,
  );
  if (cached?.key === c.paypalClientId && cached.until > Date.now())
    return cached.token;
  const response = await fetch(BASE + "/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(c.paypalClientId + ":" + c.paypalSecret).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(15000),
  });
  const body = await response.json();
  if (!response.ok || !body.access_token)
    throw new ProviderError(
      "PAYPAL_AUTH_FAILED",
      "PayPal sandbox could not authenticate this application.",
      false,
      response.status,
    );
  cached = {
    key: c.paypalClientId,
    token: body.access_token,
    until: Date.now() + Math.max(0, Number(body.expires_in) - 120) * 1000,
  };
  return cached.token;
}
async function request(
  path: string,
  method = "GET",
  body?: unknown,
  requestId?: string,
): Promise<Resource> {
  const access = await token();
  let response: Response;
  try {
    response = await fetch(BASE + path, {
      method,
      headers: {
        Authorization: "Bearer " + access,
        "Content-Type": "application/json",
        Prefer: "return=representation",
        ...(requestId ? { "PayPal-Request-Id": requestId } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new ProviderError(
      "PAYPAL_UNREACHABLE",
      "PayPal did not return a confirmed outcome. The payment will be reconciled before another action is allowed.",
      method !== "GET",
    );
  }
  if (response.status === 204) return {};
  let data: Resource = {};
  try {
    data = await response.json();
  } catch {
    throw new ProviderError(
      "PAYPAL_RESPONSE_INVALID",
      "PayPal returned an unreadable response. Reconciliation is required.",
      method !== "GET",
      response.status,
    );
  }
  if (!response.ok) {
    const issue = String(data.details?.[0]?.issue || data.name || "ERROR")
      .replace(/[^A-Z0-9_]/g, "")
      .slice(0, 100);
    throw new ProviderError(
      "PAYPAL_" + issue,
      `PayPal sandbox returned ${issue.toLowerCase().replaceAll("_", " ")}.`,
      response.status >= 500 || response.status === 429,
      response.status,
    );
  }
  return data;
}
export function validateOrder(a: Agreement, order: Resource): Resource {
  requireCondition(
    order.id === a.payment.orderId && order.intent === "AUTHORIZE",
    "PAYPAL_ORDER_MISMATCH",
    "PayPal returned a different order.",
  );
  requireCondition(
    Array.isArray(order.purchase_units) && order.purchase_units.length === 1,
    "PAYPAL_ORDER_MISMATCH",
    "The order must contain exactly one purchase unit.",
  );
  const unit = order.purchase_units[0];
  requireCondition(
    unit.reference_id === a.id &&
      unit.custom_id === a.id &&
      unit.amount?.currency_code === "USD" &&
      parseAmount(unit.amount.value) === a.amountMinor,
    "PAYPAL_AMOUNT_MISMATCH",
    "The PayPal order does not match the agreed amount.",
  );
  requireCondition(
    configuration().paypalMerchantId &&
      unit.payee?.merchant_id === configuration().paypalMerchantId,
    "PAYPAL_MERCHANT_MISMATCH",
    "The PayPal order belongs to a different merchant.",
  );
  return unit;
}
export function validateAmount(a: Agreement, value: Resource) {
  requireCondition(
    value.amount?.currency_code === "USD" &&
      parseAmount(value.amount.value) === a.amountMinor,
    "PAYPAL_AMOUNT_MISMATCH",
    "The payment amount does not match the agreement.",
  );
}
export function matchesWebhook(a: Agreement, event: Resource): boolean {
  if (a.mode !== "sandbox") return false;
  const resource = event.resource || {};
  const related = resource.supplementary_data?.related_ids || {};
  const same = (saved: string | undefined, incoming: unknown) =>
    typeof incoming === "string" && incoming.length > 0 && saved === incoming;
  return (
    same(a.payment.captureId, resource.id) ||
    same(a.payment.authorizationId, resource.id) ||
    same(a.payment.authorizationId, related.authorization_id) ||
    same(a.payment.orderId, related.order_id)
  );
}
export interface AuthorizationReceipt {
  id: string;
  status: string;
  at: string;
  expiresAt?: string;
  payerId: string;
}
export interface CaptureReceipt {
  id: string;
  status: string;
  at?: string;
}
export interface PaymentGateway {
  createOrder(
    a: Agreement,
    requestId: string,
  ): Promise<{ id: string; approvalUrl: string }>;
  authorize(a: Agreement, requestId: string): Promise<AuthorizationReceipt>;
  readAuthorization(a: Agreement): Promise<AuthorizationReceipt | undefined>;
  capture(a: Agreement, requestId: string): Promise<CaptureReceipt>;
  findCapture(a: Agreement): Promise<CaptureReceipt | undefined>;
  void(a: Agreement, requestId: string): Promise<void>;
}
export const paypal: PaymentGateway = {
  async createOrder(a, requestId) {
    const c = configuration();
    requireCondition(
      c.paypalMerchantId,
      "PAYPAL_NOT_CONFIGURED",
      "Configure the PayPal sandbox merchant ID.",
      503,
    );
    const order = await request(
      "/v2/checkout/orders",
      "POST",
      {
        intent: "AUTHORIZE",
        purchase_units: [
          {
            reference_id: a.id,
            custom_id: a.id,
            invoice_id: "rp-" + a.id,
            description: a.title,
            amount: {
              currency_code: "USD",
              value: decimalAmount(a.amountMinor),
            },
            payee: { merchant_id: c.paypalMerchantId },
          },
        ],
        payment_source: {
          paypal: {
            experience_context: {
              brand_name: "RevisionPay",
              shipping_preference: "NO_SHIPPING",
              user_action: "CONTINUE",
              return_url: `${c.appUrl}/agreements/${a.id}?paypal=approved`,
              cancel_url: `${c.appUrl}/agreements/${a.id}?paypal=canceled`,
            },
          },
        },
      },
      requestId,
    );
    requireCondition(
      typeof order.id === "string",
      "PAYPAL_ORDER_INVALID",
      "PayPal did not return an order ID.",
    );
    validateOrder(
      { ...a, payment: { ...a.payment, orderId: order.id } },
      order,
    );
    const link = order.links?.find((l: Resource) =>
      ["payer-action", "approve"].includes(l.rel),
    )?.href;
    const url = new URL(String(link));
    requireCondition(
      url.protocol === "https:" &&
        ["www.sandbox.paypal.com", "sandbox.paypal.com"].includes(url.hostname),
      "PAYPAL_APPROVAL_INVALID",
      "PayPal did not return a sandbox approval link.",
    );
    return { id: order.id, approvalUrl: url.href };
  },
  async authorize(a, requestId) {
    const current = await request(`/v2/checkout/orders/${a.payment.orderId}`);
    const unit = validateOrder(a, current);
    if (unit.payments?.authorizations?.[0])
      return authFrom(a, current, unit.payments.authorizations[0]);
    requireCondition(
      current.status === "APPROVED",
      "BUYER_APPROVAL_REQUIRED",
      "Complete approval in PayPal sandbox, then return here.",
    );
    const order = await request(
      `/v2/checkout/orders/${a.payment.orderId}/authorize`,
      "POST",
      {},
      requestId,
    );
    const approved = validateOrder(a, order);
    requireCondition(
      approved.payments?.authorizations?.length === 1,
      "PAYPAL_AUTHORIZATION_MISSING",
      "PayPal has not confirmed a single authorization.",
    );
    return authFrom(a, order, approved.payments.authorizations[0]);
  },
  async readAuthorization(a) {
    const order = await request(`/v2/checkout/orders/${a.payment.orderId}`);
    const unit = validateOrder(a, order);
    const auth = unit.payments?.authorizations?.[0];
    if (!auth) return undefined;
    if (a.payment.authorizationId)
      requireCondition(
        auth.id === a.payment.authorizationId,
        "PAYPAL_AUTHORIZATION_MISMATCH",
        "The authorization changed unexpectedly.",
      );
    const fresh = await request(`/v2/payments/authorizations/${auth.id}`);
    return authFrom(a, order, fresh);
  },
  async capture(a, requestId) {
    const result = await request(
      `/v2/payments/authorizations/${a.payment.authorizationId}/capture`,
      "POST",
      {
        amount: { currency_code: "USD", value: decimalAmount(a.amountMinor) },
        invoice_id: "rp-" + a.id,
        final_capture: true,
        note_to_payer: "Revision accepted under your RevisionPay agreement.",
      },
      requestId,
    );
    validateAmount(a, result);
    requireCondition(
      result.supplementary_data?.related_ids?.authorization_id ===
        a.payment.authorizationId,
      "PAYPAL_CAPTURE_MISMATCH",
      "The capture does not belong to this authorization.",
    );
    return { id: result.id, status: result.status, at: result.create_time };
  },
  async findCapture(a) {
    if (a.payment.captureId) {
      const result = await request(
        `/v2/payments/captures/${a.payment.captureId}`,
      );
      validateAmount(a, result);
      requireCondition(
        result.supplementary_data?.related_ids?.authorization_id ===
          a.payment.authorizationId,
        "PAYPAL_CAPTURE_MISMATCH",
        "The capture does not belong to this authorization.",
      );
      return { id: result.id, status: result.status, at: result.create_time };
    }
    const order = await request(`/v2/checkout/orders/${a.payment.orderId}`);
    const unit = validateOrder(a, order);
    const captures: Resource[] = unit.payments?.captures || [];
    requireCondition(
      captures.length <= 1,
      "PAYPAL_CAPTURE_MISMATCH",
      "More than one capture requires operator review.",
    );
    const capture = captures[0];
    if (!capture) return undefined;
    validateAmount(a, capture);
    return { id: capture.id, status: capture.status, at: capture.create_time };
  },
  async void(a, requestId) {
    await request(
      `/v2/payments/authorizations/${a.payment.authorizationId}/void`,
      "POST",
      undefined,
      requestId,
    );
  },
};
function authFrom(
  a: Agreement,
  order: Resource,
  auth: Resource,
): AuthorizationReceipt {
  validateAmount(a, auth);
  const payerId =
    order.payer?.payer_id || order.payment_source?.paypal?.account_id;
  requireCondition(
    typeof payerId === "string" &&
      typeof auth.id === "string" &&
      Number.isFinite(Date.parse(auth.create_time)),
    "PAYPAL_AUTHORIZATION_INVALID",
    "PayPal returned an incomplete authorization.",
  );
  return {
    id: auth.id,
    status: auth.status,
    at: auth.create_time,
    expiresAt: auth.expiration_time,
    payerId,
  };
}
export function demoGateway(): PaymentGateway {
  return {
    async createOrder(a) {
      return { id: "DEMO-ORDER-" + a.id, approvalUrl: "" };
    },
    async authorize(a) {
      return {
        id: "DEMO-AUTH-" + a.id,
        status: "CREATED",
        at: new Date().toISOString(),
        payerId: "simulated-buyer",
      };
    },
    async readAuthorization(a) {
      return a.payment.authorizationId
        ? {
            id: a.payment.authorizationId,
            status: a.payment.status === "VOIDED" ? "VOIDED" : "CREATED",
            at: a.payment.authorizedAt!,
            payerId: "simulated-buyer",
          }
        : undefined;
    },
    async capture(a) {
      return {
        id: "DEMO-CAPTURE-" + a.id,
        status: "COMPLETED",
        at: new Date().toISOString(),
      };
    },
    async findCapture(a) {
      return a.payment.captureId
        ? {
            id: a.payment.captureId,
            status: "COMPLETED",
            at: a.payment.capturedAt,
          }
        : undefined;
    },
    async void() {},
  };
}
export async function verifyWebhook(
  headers: Headers,
  event: unknown,
): Promise<boolean> {
  const id = configuration().paypalWebhookId;
  if (!id) return false;
  const keys = [
    "paypal-auth-algo",
    "paypal-cert-url",
    "paypal-transmission-id",
    "paypal-transmission-sig",
    "paypal-transmission-time",
  ];
  if (keys.some((k) => !headers.get(k))) return false;
  const cert = new URL(headers.get("paypal-cert-url")!);
  if (
    cert.protocol !== "https:" ||
    (cert.hostname !== "api.sandbox.paypal.com" &&
      cert.hostname !== "api-m.sandbox.paypal.com")
  )
    return false;
  const result = await request(
    "/v1/notifications/verify-webhook-signature",
    "POST",
    {
      auth_algo: headers.get(keys[0]),
      cert_url: cert.href,
      transmission_id: headers.get(keys[2]),
      transmission_sig: headers.get(keys[3]),
      transmission_time: headers.get(keys[4]),
      webhook_id: id,
      webhook_event: event,
    },
  );
  return result.verification_status === "SUCCESS";
}
