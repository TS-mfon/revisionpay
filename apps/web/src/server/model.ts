import { randomUUID } from "node:crypto";
import type {
  Agreement,
  CreateAgreement,
  Mode,
  AuditEvent,
} from "@revisionpay/domain";
import { digest } from "@revisionpay/domain/crypto";

export function draft(
  input: CreateAgreement,
  tenantId: string,
  mode: Mode,
  id = randomUUID(),
): Agreement {
  const now = new Date().toISOString();
  return {
    ...input,
    sourceUrl: new URL(input.sourceUrl).href,
    id,
    tenantId,
    version: 0,
    mode,
    currency: "USD",
    createdAt: now,
    updatedAt: now,
    state: "DRAFT",
    baselineStatus: "QUEUED",
    consents: [],
    submissions: [],
    contract: { state: "NONE" },
    payment: { mode, status: "NONE" },
    events: [],
    demoVariant: "baseline",
  };
}
export function audit(
  a: Agreement,
  type: string,
  message: string,
  actor: AuditEvent["actor"] = "system",
  refs?: Record<string, string>,
) {
  a.events.push({
    id: randomUUID(),
    at: new Date().toISOString(),
    type,
    message,
    actor,
    ...(refs ? { refs } : {}),
  });
  if (a.events.length > 180) a.events.splice(0, a.events.length - 180);
}
export function freeze(a: Agreement) {
  if (!a.baseline?.complete) throw new Error("A complete baseline is required");
  a.terms = {
    schemaVersion: "1",
    agreementId: a.id,
    title: a.title,
    amountMinor: a.amountMinor,
    currency: "USD",
    sourceUrl: a.sourceUrl,
    requirements: a.requirements,
    baselineHash: a.baseline.artifactHash,
    verifierVersion: "revisionpay-copy-v1",
    evidencePolicy: "copy-v1",
    network: "studionet",
    chainId: 61999,
    maxSubmissions: 3,
    submissionWindowHours: 48,
    settlementWindowHours: 70,
    manualAcceptanceAllowed: true,
    publicEvidenceAccepted: true,
  };
  a.digest = digest(a.terms);
  a.frozenAt = new Date().toISOString();
  a.state = "AWAITING_BUYER";
  audit(
    a,
    "TERMS_FROZEN",
    "The page, requirements, fee, and payment policy were frozen.",
    "seller",
    { agreementDigest: a.digest },
  );
}
