import {
  randomUUID,
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { requireCondition, type Agreement } from "@revisionpay/domain";
import { sha256 } from "@revisionpay/domain/crypto";
import { configuration } from "./config";
import type { Store } from "./store";

interface Message {
  to: string;
  subject: string;
  text: string;
}
interface MailJob {
  id: string;
  encrypted: string;
  status: "PENDING" | "SENT" | "CANCELED";
  createdAt: string;
  lastAttempt?: string;
  error?: string;
}
function mailKey() {
  return createHash("sha256").update(configuration().authSecret).digest();
}
function seal(message: Message) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", mailKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(message)),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}
function unseal(value: string): Message {
  const data = Buffer.from(value, "base64"),
    decipher = createDecipheriv("aes-256-gcm", mailKey(), data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28));
  return JSON.parse(
    Buffer.concat([
      decipher.update(data.subarray(28)),
      decipher.final(),
    ]).toString(),
  );
}
export async function sendMail(message: Message, id: string) {
  const c = configuration();
  requireCondition(
    c.resendKey && c.mailFrom,
    "EMAIL_UNAVAILABLE",
    "Email delivery is not available yet. Please try again later.",
    503,
  );
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + c.resendKey,
      "Content-Type": "application/json",
      "Idempotency-Key": sha256(id),
    },
    body: JSON.stringify({
      from: c.mailFrom,
      to: [message.to],
      subject: message.subject,
      text: message.text,
    }),
    signal: AbortSignal.timeout(15000),
  });
  requireCondition(
    response.ok,
    "EMAIL_FAILED",
    "Email could not be delivered. Please retry in a minute.",
    503,
  );
}
export async function queueMail(store: Store, id: string, message: Message) {
  requireCondition(
    configuration().authSecret,
    "EMAIL_UNAVAILABLE",
    "Email delivery is not configured.",
    503,
  );
  return store.putValue<MailJob>(
    "mail:" + id,
    {
      id,
      encrypted: seal(message),
      status: "PENDING",
      createdAt: new Date().toISOString(),
    },
    true,
  );
}
export async function deliverMail(store: Store) {
  if (!configuration().resendKey || !configuration().mailFrom) return;
  const jobs = await store.listValues<MailJob>("mail:");
  for (const job of jobs.filter((j) => j.status === "PENDING").slice(0, 8)) {
    if (job.lastAttempt && Date.now() - Date.parse(job.lastAttempt) < 60000)
      continue;
    const lease = randomUUID();
    if (!(await store.leaseSlot("mail:" + job.id, lease, 60000))) continue;
    try {
      const current = await store.getValue<MailJob>("mail:" + job.id);
      if (!current || current.status !== "PENDING") continue;
      if (current.id.startsWith("invite:")) {
        const [, agreementId, tokenHash] = current.id.split(":");
        const agreement = await store.getAgreement(agreementId);
        if (
          agreement?.invitation?.tokenHash !== tokenHash ||
          agreement.invitation.redeemedAt ||
          Date.parse(agreement.invitation.expiresAt) <= Date.now() ||
          agreement.state !== "AWAITING_BUYER"
        ) {
          current.status = "CANCELED";
          current.encrypted = "";
          await store.putValue("mail:" + current.id, current);
          continue;
        }
      }
      if (
        !(await store.consumeQuota(
          "email:" + new Date().toISOString().slice(0, 10),
          85,
        ))
      )
        break;
      current.lastAttempt = new Date().toISOString();
      try {
        await sendMail(unseal(current.encrypted), current.id);
        current.status = "SENT";
        current.encrypted = "";
        current.error = undefined;
      } catch {
        current.error =
          "Delivery delayed. Use the private agreement link or retry sending.";
      }
      await store.putValue("mail:" + current.id, current);
    } finally {
      await store.releaseSlot("mail:" + job.id, lease);
    }
  }
}
export async function notifyAgreement(store: Store, a: Agreement) {
  if (a.mode === "demo" || !configuration().authSecret) return;
  const url = configuration().appUrl + "/agreements/" + a.id;
  const types = new Set([
    "AUTHORIZED",
    "REVISION_CAPTURED",
    "BUYER_REVIEW_HOLD",
    "CAPTURE_COMPLETED",
    "CANCELLATION_REQUESTED",
  ]);
  for (const e of a.events.filter((e) => types.has(e.type))) {
    const to = e.type === "REVISION_CAPTURED" ? a.clientEmail : a.sellerEmail;
    if (to)
      await queueMail(store, a.id + ":" + e.id, {
        to,
        subject:
          a.title +
          " — " +
          ({
            AUTHORIZED: "payment authorized",
            REVISION_CAPTURED: "ready for your review",
            BUYER_REVIEW_HOLD: "changes requested",
            CAPTURE_COMPLETED: "payment confirmed",
            CANCELLATION_REQUESTED: "cancellation requested",
          }[e.type] || "update"),
        text:
          e.message +
          "\n\n" +
          (e.type === "BUYER_REVIEW_HOLD"
            ? (a.changeRequest || "") + "\n\n"
            : "") +
          "Open your agreement: " +
          url +
          "\nUse your email to recover access if needed.",
      });
    if (e.type === "CAPTURE_COMPLETED" && a.clientEmail)
      await queueMail(store, a.id + ":receipt:" + e.id, {
        to: a.clientEmail,
        subject: "Your RevisionPay receipt",
        text:
          "PayPal confirmed your payment for " +
          a.title +
          ". View your receipt: " +
          url,
      });
  }
  if (
    a.payment.status === "AUTHORIZED" &&
    a.payment.captureDeadline &&
    Date.parse(a.payment.captureDeadline) - Date.now() < 6 * 3600000 &&
    a.clientEmail
  )
    await queueMail(store, a.id + ":deadline", {
      to: a.clientEmail,
      subject: "Your revision approval window ends soon",
      text:
        "Review " +
        a.title +
        " before " +
        a.payment.captureDeadline +
        ". Payment is still authorized, not charged. If the authorization expires, a new agreement is needed.\n\n" +
        url,
    });
}
