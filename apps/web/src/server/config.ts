import { config as loadEnv } from "dotenv";
import path from "node:path";
import type { Mode } from "@revisionpay/domain";
// Hosted deployments receive their configuration from Vercel. Never trace local secrets.
if (!process.env.VERCEL && !process.env.NETLIFY)
  loadEnv({
    path: [
      path.resolve(process.cwd(), ".env.local"),
      path.resolve(process.cwd(), "../../.env.local"),
    ],
    quiet: true,
  });
export const configuration = () => ({
  mode: (process.env.REVISIONPAY_MODE === "live"
    ? "live"
    : process.env.REVISIONPAY_MODE === "sandbox"
      ? "sandbox"
      : process.env.REVISIONPAY_MODE === "demo" || !process.env.VERCEL
        ? "demo"
        : "sandbox") as Mode,
  appUrl: (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, ""),
  mongoUri: process.env.MONGODB_URI || "",
  database: process.env.MONGODB_DATABASE || "revisionpay",
  authSecret: process.env.AUTH_SECRET || "",
  googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  googleSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  cronSecret: process.env.CRON_SECRET || "",
  captureSecret: process.env.CAPTURE_SECRET || "",
  captureUrl: (
    process.env.CAPTURE_SERVICE_URL || "http://localhost:3001"
  ).replace(/\/$/, ""),
  paypalClientId: process.env.PAYPAL_CLIENT_ID || "",
  paypalSecret: process.env.PAYPAL_CLIENT_SECRET || "",
  paypalWebhookId: process.env.PAYPAL_WEBHOOK_ID || "",
  paypalMerchantId: process.env.PAYPAL_MERCHANT_ID || "",
  liveClientId: process.env.PAYPAL_LIVE_CLIENT_ID || "",
  liveSecret: process.env.PAYPAL_LIVE_CLIENT_SECRET || "",
  liveWebhookId: process.env.PAYPAL_LIVE_WEBHOOK_ID || "",
  livePartnerId: process.env.PAYPAL_LIVE_PARTNER_ID || "",
  partnerId: process.env.PAYPAL_PARTNER_ID || "",
  platformClientId: process.env.PAYPAL_PLATFORM_CLIENT_ID || "",
  platformSecret: process.env.PAYPAL_PLATFORM_CLIENT_SECRET || "",
  platformWebhookId: process.env.PAYPAL_PLATFORM_WEBHOOK_ID || "",
  partnerCode: process.env.PAYPAL_PARTNER_ATTRIBUTION_ID || "",
  liveEnabled:
    process.env.LIVE_PAYMENTS_ENABLED === "true" &&
    process.env.PAYPAL_PARTNER_APPROVED === "true" &&
    process.env.LIVE_PAYMENT_VALIDATED === "true" &&
    process.env.CONTEXT !== "deploy-preview" &&
    process.env.CONTEXT !== "branch-deploy" &&
    (!process.env.VERCEL || process.env.VERCEL_ENV === "production"),
  resendKey: process.env.RESEND_API_KEY || "",
  mailFrom: process.env.MAIL_FROM || "",
  studioRpc: process.env.GENLAYER_RPC_URL || "https://studio.genlayer.com/api",
  studioKey: process.env.GENLAYER_PRIVATE_KEY || "",
  githubId: process.env.SELLER_GITHUB_ID || "",
  maxActive: Number(process.env.MAX_ACTIVE_AGREEMENTS || 10),
  maxDaily: Number(process.env.MAX_DAILY_VERIFICATIONS || 20),
  settlementPaused:
    process.env.SETTLEMENT_PAUSED === "true" ||
    (Boolean(process.env.NETLIFY) && process.env.CONTEXT !== "production") ||
    (Boolean(process.env.VERCEL) && process.env.VERCEL_ENV !== "production"),
  newJobsPaused: process.env.NEW_JOBS_PAUSED === "true",
});
export function readiness() {
  const c = configuration();
  return {
    mode: c.mode,
    network: "GenLayer Studionet",
    chainId: 61999,
    paypal: Boolean(c.paypalClientId && c.paypalSecret && c.paypalMerchantId),
    genlayer: Boolean(c.studioKey),
    database: Boolean(c.mongoUri),
    capture: Boolean(c.captureUrl && c.captureSecret),
    ownerAuth: Boolean(
      c.authSecret &&
        process.env.GITHUB_CLIENT_ID &&
        process.env.GITHUB_CLIENT_SECRET &&
        c.githubId,
    ),
    emailAuth: Boolean(c.authSecret && c.resendKey && c.mailFrom && c.mongoUri),
    googleAuth: Boolean(
      c.authSecret && c.googleClientId && c.googleSecret && c.mongoUri,
    ),
    livePayments: Boolean(
      c.liveEnabled &&
        c.liveClientId &&
        c.liveSecret &&
        c.liveWebhookId &&
        c.livePartnerId &&
        c.partnerCode,
    ),
    merchantOnboarding: Boolean(
      c.mode === "live"
        ? c.partnerCode && c.livePartnerId && c.liveClientId && c.liveSecret
        : c.partnerId && c.platformClientId && c.platformSecret,
    ),
    paused: c.settlementPaused || c.newJobsPaused,
    paypalClientId: c.mode === "sandbox" ? c.paypalClientId : "",
  };
}
