import { z } from "zod";

export type Mode = "demo" | "sandbox" | "live";
export interface MerchantConnection {
  tenantId: string;
  environment: "sandbox" | "live";
  status: "NOT_CONNECTED" | "PENDING" | "READY" | "REVOKED";
  trackingId: string;
  merchantId?: string;
  legalName?: string;
  country?: string;
  checkedAt?: string;
  checks?: {
    emailConfirmed: boolean;
    paymentsReceivable: boolean;
    permissionsGranted: boolean;
  };
}
export interface Tenant {
  id: string;
  userId: string;
  email: string;
  displayName: string;
}
export type Role = "seller" | "buyer";
export type DemoVariant =
  | "baseline"
  | "incomplete"
  | "corrected"
  | "ambiguous"
  | "injected"
  | "changed";
export const CriterionStatus = z.enum([
  "SATISFIED",
  "UNSATISFIED",
  "UNVERIFIABLE",
]);
export const Verdict = z.enum(["PASS", "REVISE", "REVIEW_REQUIRED"]);
export type VerdictName = z.infer<typeof Verdict>;
export const RequirementSchema = z
  .object({
    id: z.string().regex(/^R[1-5]$/),
    title: z.string().min(3).max(100),
    description: z.string().min(15).max(800),
  })
  .strict();
export type Requirement = z.infer<typeof RequirementSchema>;
export const CreateAgreementSchema = z
  .object({
    title: z.string().trim().min(3).max(120),
    clientName: z.string().trim().min(2).max(80),
    clientEmail: z.string().trim().email().max(254).optional(),
    amountMinor: z.number().int().min(2500).max(50000),
    sourceUrl: z.string().url().max(1000),
    requirements: z.array(RequirementSchema).min(3).max(5),
  })
  .strict()
  .refine(
    (v) =>
      new Set(v.requirements.map((r) => r.id)).size === v.requirements.length,
    "Requirement IDs must be unique",
  );
export type CreateAgreement = z.infer<typeof CreateAgreementSchema>;

export const EvidenceSchema = z
  .object({
    schemaVersion: z.literal("1"),
    requestId: z.string().min(1).max(100),
    sourceUrl: z.string().max(1000),
    finalUrl: z.string().max(1000),
    capturedAt: z.string().datetime(),
    policyVersion: z.literal("copy-v1"),
    viewport: z
      .object({ width: z.literal(1440), height: z.literal(1000) })
      .strict(),
    title: z.string().max(240),
    blocks: z
      .array(
        z
          .object({
            id: z.string().max(80),
            text: z.string().max(12000),
            kind: z.enum(["heading", "paragraph", "list", "button", "text"]),
          })
          .strict(),
      )
      .max(120),
    links: z
      .array(
        z
          .object({
            id: z.string().max(80),
            text: z.string().max(500),
            href: z.string().max(2000),
            primary: z.boolean(),
          })
          .strict(),
      )
      .max(80),
    complete: z.boolean(),
    warnings: z.array(z.string().max(300)).max(30),
    screenshotHash: z.string().nullable(),
    artifactHash: z.string(),
    contentHash: z.string(),
    collector: z.enum(["browser", "demo-fixture"]),
  })
  .strict();
export type Evidence = z.infer<typeof EvidenceSchema>;
export const FindingSchema = z
  .object({
    id: z.string().regex(/^R[1-5]$/),
    status: CriterionStatus,
    evidenceBlockIds: z.array(z.string()).max(8),
    reason: z.string().min(3).max(1000),
  })
  .strict();
export type Finding = z.infer<typeof FindingSchema>;
export const VerdictSchema = z
  .object({
    schemaVersion: z.literal("1"),
    agreementDigest: z.string(),
    submissionId: z.string(),
    artifactHash: z.string(),
    criteria: z.array(FindingSchema).min(3).max(5),
    verdict: Verdict,
  })
  .strict();
export type VerificationResult = z.infer<typeof VerdictSchema>;

export interface Terms {
  schemaVersion: "1" | "2";
  settlementPolicy?: "BUYER_APPROVAL_REQUIRED";
  merchantId?: string;
  paymentIntegration?: "DIRECT" | "PLATFORM";
  agreementId: string;
  title: string;
  amountMinor: number;
  currency: "USD";
  sourceUrl: string;
  requirements: Requirement[];
  baselineHash: string;
  verifierVersion: "revisionpay-copy-v1";
  evidencePolicy: "copy-v1";
  network: "studionet";
  chainId: 61999;
  maxSubmissions: 3;
  submissionWindowHours: 48;
  settlementWindowHours: 70;
  manualAcceptanceAllowed: true;
  publicEvidenceAccepted: true;
}
export interface Consent {
  id: string;
  kind: "AGREEMENT" | "BUYER_ACCEPTED";
  digest: string;
  at: string;
  actorId: string;
  submissionId?: string;
  artifactHash?: string;
  copyVersion: "1" | "2";
}
export type VerificationStatus =
  | "QUEUED"
  | "SUBMITTING"
  | "SUBMITTED"
  | "AWAITING_FINALITY"
  | "FINALIZED"
  | "FAILED"
  | "UNKNOWN";
export interface Verification {
  status: VerificationStatus;
  mode: Mode;
  txId?: string;
  contractAddress?: string;
  submittedAt?: string;
  finalizedAt?: string;
  protocolStatus?: string;
  executionStatus?: string;
  result?: VerificationResult;
  error?: string;
}
export interface Submission {
  id: string;
  revision: number;
  requestedAt: string;
  state: "CAPTURING" | "READY" | "FAILED" | "SUPERSEDED";
  evidence?: Evidence;
  verification: Verification;
  note: string;
}
export type PaymentStatus =
  | "NONE"
  | "ORDER_CREATING"
  | "ORDER_CREATED"
  | "AUTHORIZING"
  | "AUTH_PENDING"
  | "AUTHORIZED"
  | "AUTH_DENIED"
  | "CAPTURE_RESERVED"
  | "CAPTURE_SUBMITTED"
  | "PENDING"
  | "PAID"
  | "FAILED"
  | "UNKNOWN"
  | "VOID_RESERVED"
  | "VOID_PENDING"
  | "VOIDED"
  | "EXPIRED";
export interface PaymentCommand {
  id: string;
  kind: "CREATE_ORDER" | "AUTHORIZE" | "CAPTURE" | "VOID";
  state: "RESERVED" | "SENT" | "RESOLVED" | "UNKNOWN";
  createdAt: string;
  payloadHash: string;
  submissionId?: string;
  evidenceHash?: string;
  reason?: "AI_PASS" | "BUYER_ACCEPTED";
}
export interface Payment {
  mode: Mode;
  integration?: "DIRECT" | "PLATFORM";
  status: PaymentStatus;
  orderId?: string;
  checkoutUnavailable?: boolean;
  authorizationId?: string;
  captureId?: string;
  payerId?: string;
  authorizedAt?: string;
  capturedAt?: string;
  voidedAt?: string;
  submissionDeadline?: string;
  captureDeadline?: string;
  grossMinor?: number;
  currency?: string;
  merchantId?: string;
  command?: PaymentCommand;
  error?: string;
  adjustment?: "REFUNDED" | "PARTIALLY_REFUNDED" | "REVERSED";
  lastReconciledAt?: string;
}
export interface AuditEvent {
  id: string;
  at: string;
  type: string;
  actor: "seller" | "buyer" | "system" | "paypal" | "genlayer";
  message: string;
  refs?: Record<string, string>;
}
export interface Agreement {
  id: string;
  tenantId: string;
  clientTenantId?: string;
  workPostId?: string;
  version: number;
  mode: Mode;
  title: string;
  clientName: string;
  clientEmail?: string;
  sellerName?: string;
  sellerEmail?: string;
  termsVersion?: "2";
  testTemplateId?: string;
  draftRevision?: number;
  admissionMonth?: string;
  changeRequest?: string;
  amountMinor: number;
  currency: "USD";
  sourceUrl: string;
  requirements: Requirement[];
  createdAt: string;
  updatedAt: string;
  state:
    | "DRAFT"
    | "AWAITING_BUYER"
    | "ACTIVE"
    | "REVIEW_HOLD"
    | "CANCELED"
    | "CLOSED";
  baseline?: Evidence;
  baselineStatus: "QUEUED" | "READY" | "FAILED";
  terms?: Terms;
  digest?: string;
  frozenAt?: string;
  invitation?: {
    tokenHash: string;
    nonce?: string;
    expiresAt?: string;
    redeemedAt?: string;
  };
  consents: Consent[];
  submissions: Submission[];
  currentSubmissionId?: string;
  contract: {
    state: "NONE" | "DEPLOYING" | "SUBMITTED" | "READY" | "FAILED" | "UNKNOWN";
    txId?: string;
    address?: string;
    error?: string;
  };
  payment: Payment;
  cancelRequestedAt?: string;
  reviewHoldAt?: string;
  holdReason?: "BUYER" | "CONTENT_CHANGED";
  manualAcceptanceId?: string;
  freshEvidence?: Evidence;
  events: AuditEvent[];
  demoVariant?: DemoVariant;
  nextCheckAt?: string;
  lastError?: string;
}
export type PublicAgreement = Omit<Agreement, "invitation"> & {
  invitation?: { expiresAt?: string; redeemed: boolean };
};
export interface Session {
  id: string;
  tokenHash: string;
  tenantId: string;
  kind: "demo" | "buyer" | "owner" | "seller";
  role: Role;
  agreementId?: string;
  expiresAt: string;
}
export interface Actor {
  id: string;
  tenantId: string;
  kind: "owner" | "demo" | "buyer" | "seller";
  role: Role;
  agreementId?: string;
  email?: string;
  name?: string;
}
export interface Job {
  id: string;
  agreementId: string;
  status: "ready" | "running" | "done";
  dueAt: string;
  leaseUntil: string;
  leaseToken?: string;
  attempts: number;
  wakeAt?: string;
  lastError?: string;
}
export class DomainError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 409,
  ) {
    super(message);
    this.name = "DomainError";
  }
}
export function requireCondition(
  value: unknown,
  code: string,
  message: string,
  status = 409,
): asserts value {
  if (!value) throw new DomainError(code, message, status);
}
export function money(minor: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: minor % 100 === 0 ? 0 : 2,
  }).format(minor / 100);
}
export function decimalAmount(minor: number): string {
  requireCondition(
    Number.isSafeInteger(minor) && minor >= 0,
    "INVALID_AMOUNT",
    "Invalid payment amount.",
  );
  return Math.floor(minor / 100) + "." + String(minor % 100).padStart(2, "0");
}
export function parseAmount(value: string): number {
  requireCondition(
    /^\d+(\.\d{1,2})?$/.test(value),
    "INVALID_AMOUNT",
    "Invalid provider amount.",
  );
  const [whole, decimal = ""] = value.split(".");
  const result = Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
  requireCondition(
    Number.isSafeInteger(result),
    "INVALID_AMOUNT",
    "Invalid provider amount.",
  );
  return result;
}
export function currentSubmission(a: Agreement): Submission | undefined {
  return a.submissions.find((s) => s.id === a.currentSubmissionId);
}
export function aggregateFindings(findings: Finding[]): VerdictName {
  if (findings.some((f) => f.status === "UNVERIFIABLE"))
    return "REVIEW_REQUIRED";
  return findings.some((f) => f.status === "UNSATISFIED") ? "REVISE" : "PASS";
}
export function validateVerdict(
  raw: unknown,
  a: Agreement,
  s: Submission,
): VerificationResult {
  const result = VerdictSchema.parse(raw);
  requireCondition(
    result.agreementDigest === a.digest &&
      result.submissionId === s.id &&
      result.artifactHash === s.evidence?.artifactHash,
    "VERDICT_BINDING",
    "The verification does not match this submission.",
  );
  const expected = a.requirements
    .map((r) => r.id)
    .sort()
    .join(",");
  requireCondition(
    result.criteria
      .map((c) => c.id)
      .sort()
      .join(",") === expected,
    "VERDICT_CRITERIA",
    "The verifier must assess every agreed requirement exactly once.",
  );
  const ids = new Set([
    ...(s.evidence?.blocks.map((b) => "current:" + b.id) || []),
    ...(s.evidence?.links.map((b) => "current:" + b.id) || []),
    ...(a.baseline?.blocks.map((b) => "baseline:" + b.id) || []),
    ...(a.baseline?.links.map((b) => "baseline:" + b.id) || []),
  ]);
  for (const finding of result.criteria) {
    requireCondition(
      finding.evidenceBlockIds.every((id) => ids.has(id)),
      "INVALID_CITATION",
      "The verifier cited evidence that does not exist.",
    );
    requireCondition(
      finding.status !== "SATISFIED" || finding.evidenceBlockIds.length > 0,
      "MISSING_CITATION",
      "Passing findings need supporting evidence.",
    );
  }
  requireCondition(
    result.verdict === aggregateFindings(result.criteria),
    "INVALID_AGGREGATE",
    "The overall result does not match the requirements.",
  );
  return result;
}
export function hasFinalPass(a: Agreement): boolean {
  const s = currentSubmission(a);
  if (!s?.evidence || !s.verification.result || a.contract.state !== "READY")
    return false;
  const v = s.verification;
  if (
    v.mode !== a.mode ||
    v.contractAddress !== a.contract.address ||
    v.status !== "FINALIZED" ||
    v.protocolStatus !== "FINALIZED" ||
    v.executionStatus !== "FINISHED_WITH_RETURN"
  )
    return false;
  try {
    return validateVerdict(v.result, a, s).verdict === "PASS";
  } catch {
    return false;
  }
}
export function hasManualAcceptance(a: Agreement): boolean {
  const s = currentSubmission(a);
  return Boolean(
    s?.evidence &&
      a.consents.some(
        (c) =>
          c.id === a.manualAcceptanceId &&
          c.kind === "BUYER_ACCEPTED" &&
          c.digest === a.digest &&
          c.submissionId === s.id &&
          c.artifactHash === s.evidence?.artifactHash,
      ),
  );
}
export function assertCaptureEligible(
  a: Agreement,
  now = new Date(),
  requireFreshness = true,
): "AI_PASS" | "BUYER_ACCEPTED" {
  requireCondition(
    a.state === "ACTIVE" && !a.cancelRequestedAt && !a.reviewHoldAt,
    "PAYMENT_HELD",
    "This agreement is not eligible for automatic collection.",
  );
  requireCondition(
    a.digest &&
      a.terms &&
      a.consents.some((c) => c.kind === "AGREEMENT" && c.digest === a.digest),
    "CONSENT_MISSING",
    "The buyer must accept the frozen agreement.",
  );
  requireCondition(
    a.payment.status === "AUTHORIZED" && a.payment.authorizationId,
    "AUTHORIZATION_REQUIRED",
    "A confirmed authorization is required.",
  );
  requireCondition(
    a.payment.captureDeadline &&
      Date.parse(a.payment.captureDeadline) > now.getTime(),
    "AUTHORIZATION_EXPIRED",
    "The collection deadline has passed.",
  );
  requireCondition(
    !a.payment.command || a.payment.command.state === "RESOLVED",
    "PAYMENT_IN_FLIGHT",
    "Another payment operation is unresolved.",
  );
  const s = currentSubmission(a);
  requireCondition(
    s?.state === "READY" && s.evidence?.complete,
    "EVIDENCE_REQUIRED",
    "Complete evidence is required.",
  );
  const manual = hasManualAcceptance(a);
  requireCondition(
    !(
      a.mode === "live" ||
      a.terms.settlementPolicy === "BUYER_APPROVAL_REQUIRED"
    ) || manual,
    "CLIENT_APPROVAL_REQUIRED",
    "The client must approve this revision before payment is collected.",
  );
  requireCondition(
    manual || hasFinalPass(a),
    "VERIFICATION_REQUIRED",
    "Automatic collection requires finalized, successful verification.",
  );
  if (requireFreshness) {
    requireCondition(
      a.freshEvidence?.complete &&
        a.freshEvidence.contentHash === s.evidence.contentHash,
      "CONTENT_CHANGED",
      "The current page differs from the accepted submission.",
    );
    const age = now.getTime() - Date.parse(a.freshEvidence.capturedAt);
    requireCondition(
      age >= 0 && age < 120000,
      "EVIDENCE_STALE",
      "The page must be checked again before collection.",
    );
  }
  return manual ? "BUYER_ACCEPTED" : "AI_PASS";
}
export const MONEY_IN_FLIGHT: PaymentStatus[] = [
  "ORDER_CREATING",
  "AUTHORIZING",
  "AUTH_PENDING",
  "CAPTURE_RESERVED",
  "CAPTURE_SUBMITTED",
  "PENDING",
  "UNKNOWN",
  "VOID_RESERVED",
  "VOID_PENDING",
];
export function assertCanCancel(a: Agreement): void {
  requireCondition(
    !MONEY_IN_FLIGHT.includes(a.payment.status),
    "PAYMENT_IN_FLIGHT",
    "A payment operation is being reconciled. Cancellation will be available when its outcome is known.",
  );
  requireCondition(
    a.payment.status !== "PAID",
    "ALREADY_PAID",
    "This payment has been collected. Contact the seller about a refund.",
  );
}
export function assertCanSubmit(a: Agreement, now = new Date()): void {
  requireCondition(
    a.state === "ACTIVE" || a.state === "REVIEW_HOLD",
    "AGREEMENT_INACTIVE",
    "The buyer must authorize the agreement before work can be submitted.",
  );
  requireCondition(
    a.payment.status === "AUTHORIZED" && !a.cancelRequestedAt,
    "AUTHORIZATION_REQUIRED",
    "A usable authorization is required.",
  );
  requireCondition(
    a.submissions.length < 3,
    "REVISION_LIMIT",
    "This agreement allows three submissions.",
  );
  requireCondition(
    a.payment.submissionDeadline &&
      Date.parse(a.payment.submissionDeadline) > now.getTime(),
    "SUBMISSION_EXPIRED",
    "The submission deadline has passed.",
  );
  const current = currentSubmission(a);
  requireCondition(
    !current ||
      current.state === "FAILED" ||
      ["FINALIZED", "FAILED"].includes(current.verification.status),
    "VERIFICATION_IN_PROGRESS",
    "Wait for this verification to finish before submitting another version.",
  );
}
export function publicAgreement(a: Agreement): PublicAgreement {
  const { invitation, ...safe } = a;
  return {
    ...safe,
    invitation: invitation
      ? {
          expiresAt: invitation.expiresAt,
          redeemed: Boolean(invitation.redeemedAt),
        }
      : undefined,
  };
}
export function displayStatus(a: Agreement): {
  label: string;
  tone: "green" | "amber" | "blue" | "gray" | "red";
} {
  if (a.payment.adjustment)
    return {
      label: a.payment.adjustment.replaceAll("_", " ").toLowerCase(),
      tone: "amber",
    };
  if (a.payment.status === "PAID") return { label: "Paid", tone: "green" };
  if (
    a.state === "AWAITING_BUYER" &&
    a.payment.status === "ORDER_CREATED" &&
    a.payment.checkoutUnavailable
  )
    return { label: "Checkout unavailable", tone: "red" };
  if (
    a.state === "CANCELED" ||
    ["VOIDED", "EXPIRED"].includes(a.payment.status)
  )
    return { label: "Canceled", tone: "gray" };
  if (a.state === "REVIEW_HOLD")
    return { label: "Changes requested", tone: "amber" };
  if (
    ["UNKNOWN", "FAILED", "AUTH_DENIED"].includes(a.payment.status) ||
    a.lastError
  )
    return { label: "Needs attention", tone: "red" };
  if (a.payment.status === "PENDING")
    return { label: "Payment pending", tone: "blue" };
  const s = currentSubmission(a);
  if (
    s?.state === "READY" &&
    a.terms?.settlementPolicy === "BUYER_APPROVAL_REQUIRED"
  )
    return {
      label: a.manualAcceptanceId ? "Payment processing" : "Client review",
      tone: "blue",
    };
  if (s?.verification.status === "FINALIZED") {
    if (s.verification.result?.verdict === "REVISE")
      return { label: "Revision requested", tone: "amber" };
    if (s.verification.result?.verdict === "REVIEW_REQUIRED")
      return { label: "Review required", tone: "amber" };
    return { label: "Ready to collect", tone: "green" };
  }
  if (s && s.state !== "FAILED") return { label: "Verifying", tone: "blue" };
  if (a.state === "DRAFT") return { label: "Draft", tone: "gray" };
  if (a.payment.status === "AUTHORIZED")
    return { label: "Ready for work", tone: "blue" };
  return { label: "Waiting for client", tone: "amber" };
}

export function nextAction(a: Agreement, role: Role = "seller") {
  const s = currentSubmission(a);
  if (a.payment.status === "PAID")
    return { label: "View receipt", group: "Completed" };
  if (
    a.state === "AWAITING_BUYER" &&
    a.payment.status === "ORDER_CREATED" &&
    a.payment.checkoutUnavailable
  )
    return {
      label:
        role === "seller"
          ? "Start a fresh agreement"
          : "Ask for a new agreement",
      group: "Needs your action",
    };
  if (
    a.state === "CANCELED" ||
    ["VOIDED", "EXPIRED"].includes(a.payment.status)
  )
    return { label: "View agreement", group: "Completed" };
  if (MONEY_IN_FLIGHT.includes(a.payment.status))
    return { label: "Checking payment", group: "Waiting" };
  if (a.state === "DRAFT")
    return role === "seller"
      ? { label: "Review and send", group: "Needs your action" }
      : { label: "Freelancer preparing agreement", group: "Waiting" };
  if (a.state === "AWAITING_BUYER")
    return {
      label: role === "buyer" ? "Review and authorize" : "View invitation",
      group: role === "buyer" ? "Needs your action" : "Waiting",
    };
  if (a.state === "REVIEW_HOLD")
    return {
      label:
        role === "seller" ? "Read requested changes" : "Waiting for changes",
      group: role === "seller" ? "Needs your action" : "Waiting",
    };
  if (s?.state === "READY")
    return {
      label: role === "buyer" ? "Review the work" : "Waiting for client review",
      group: role === "buyer" ? "Needs your action" : "Waiting",
    };
  if (s && s.state !== "FAILED")
    return { label: "Checking the page", group: "Waiting" };
  return {
    label: role === "seller" ? "Submit updated page" : "Waiting for the work",
    group: role === "seller" ? "Needs your action" : "Waiting",
  };
}

// Only already-requested work can advance in the background. Awaiting a client
// decision is idle; observing an agreement never supplies consent or approval.
export function hasPendingWork(a: Agreement, now = Date.now()): boolean {
  if (MONEY_IN_FLIGHT.includes(a.payment.status)) return true;
  if (
    a.state === "CANCELED" ||
    ["PAID", "VOIDED", "EXPIRED", "FAILED", "AUTH_DENIED"].includes(
      a.payment.status,
    )
  )
    return false;
  if (a.state === "DRAFT") return a.baselineStatus === "QUEUED";
  if (a.payment.status !== "AUTHORIZED") return false;
  if (a.cancelRequestedAt || Date.parse(a.payment.captureDeadline || "") <= now)
    return true;
  const submission = currentSubmission(a);
  if (submission?.state === "CAPTURING") return true;
  if (!submission)
    return (
      a.termsVersion !== "2" &&
      ["NONE", "DEPLOYING", "SUBMITTED"].includes(a.contract.state)
    );
  if (hasManualAcceptance(a) && a.state === "ACTIVE" && !a.reviewHoldAt)
    return true;
  if (["NONE", "DEPLOYING", "SUBMITTED"].includes(a.contract.state))
    return true;
  if (a.contract.state !== "READY" || submission.state !== "READY")
    return false;
  if (
    ["QUEUED", "SUBMITTING", "SUBMITTED", "AWAITING_FINALITY"].includes(
      submission.verification.status,
    )
  )
    return true;
  return (
    a.terms?.settlementPolicy !== "BUYER_APPROVAL_REQUIRED" &&
    a.mode !== "live" &&
    a.state === "ACTIVE" &&
    !a.reviewHoldAt &&
    hasFinalPass(a)
  );
}
