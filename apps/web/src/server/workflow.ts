import { randomUUID } from "node:crypto";
import {
  DomainError,
  assertCaptureEligible,
  currentSubmission,
  hasFinalPass,
  hasManualAcceptance,
  validateVerdict,
  type Agreement,
  type PaymentCommand,
  type Submission,
} from "@revisionpay/domain";
import { digest } from "@revisionpay/domain/crypto";
import { mutate, type Store } from "./store";
import { configuration } from "./config";
import { audit } from "./model";
import { notifyAgreement } from "./mail";
import { captureEvidence } from "./evidence";
import {
  deployAgreement,
  submitVerification,
  transaction,
  readVerdict,
  simulatedVerdict,
} from "./genlayer";
import {
  paypal,
  demoGateway,
  type PaymentGateway,
  type AuthorizationReceipt,
  type CaptureReceipt,
} from "./paypal";

const later = (seconds: number) =>
  new Date(Date.now() + seconds * 1000).toISOString();
export function command(
  kind: PaymentCommand["kind"],
  a: Agreement,
  extra: Partial<PaymentCommand> = {},
): PaymentCommand {
  return {
    id: randomUUID(),
    kind,
    state: "RESERVED",
    createdAt: new Date().toISOString(),
    payloadHash: digest({
      agreementId: a.id,
      digest: a.digest,
      amountMinor: a.amountMinor,
      kind,
      ...extra,
    }),
    ...extra,
  };
}
export function applyAuthorization(a: Agreement, auth: AuthorizationReceipt) {
  const p = a.payment;
  p.authorizationId = auth.id;
  p.payerId = auth.payerId;
  p.authorizedAt = auth.at;
  p.status =
    auth.status === "CREATED"
      ? "AUTHORIZED"
      : auth.status === "PENDING"
        ? "AUTH_PENDING"
        : auth.status === "VOIDED"
          ? "VOIDED"
          : auth.status === "DENIED"
            ? "AUTH_DENIED"
            : "UNKNOWN";
  if (p.command) p.command.state = "RESOLVED";
  p.submissionDeadline = new Date(
    Date.parse(auth.at) + 48 * 3600000,
  ).toISOString();
  const expiry = auth.expiresAt ? Date.parse(auth.expiresAt) : Infinity;
  p.captureDeadline = new Date(
    Math.min(
      Date.parse(auth.at) + 70 * 3600000,
      Number.isFinite(expiry) ? expiry : Infinity,
    ),
  ).toISOString();
  p.grossMinor = a.amountMinor;
  p.currency = a.currency;
  p.merchantId =
    a.mode === "demo"
      ? "simulated-merchant"
      : a.terms?.merchantId ||
        a.payment.merchantId ||
        configuration().paypalMerchantId;
  if (p.status === "AUTHORIZED") {
    a.state = "ACTIVE";
    audit(
      a,
      "AUTHORIZED",
      "The revision fee is authorized. Nothing has been charged.",
      a.mode === "demo" ? "system" : "paypal",
      { authorizationId: auth.id },
    );
  }
  p.error = undefined;
}
function applyCapture(a: Agreement, receipt: CaptureReceipt) {
  a.payment.captureId = receipt.id;
  if (receipt.status === "COMPLETED") {
    a.payment.status = "PAID";
    a.payment.capturedAt = receipt.at || new Date().toISOString();
    a.state = "CLOSED";
    audit(
      a,
      "CAPTURE_COMPLETED",
      a.mode === "demo"
        ? "Simulated payment completed. No money moved."
        : "PayPal confirmed the full revision payment.",
      a.mode === "demo" ? "system" : "paypal",
      { captureId: receipt.id },
    );
  } else if (receipt.status === "PENDING") a.payment.status = "PENDING";
  else if (["REFUNDED", "PARTIALLY_REFUNDED"].includes(receipt.status)) {
    a.payment.status = "PAID";
    a.payment.adjustment = receipt.status as "REFUNDED" | "PARTIALLY_REFUNDED";
  } else if (["DECLINED", "DENIED", "FAILED"].includes(receipt.status)) {
    a.payment.status = "FAILED";
    a.payment.error =
      "PayPal declined collection. No second collection will be attempted automatically.";
  } else {
    a.payment.status = "UNKNOWN";
    a.payment.error = "The capture has an unrecognized provider status.";
  }
  if (a.payment.command)
    a.payment.command.state = ["PAID", "FAILED"].includes(a.payment.status)
      ? "RESOLVED"
      : "SENT";
  a.payment.lastReconciledAt = new Date().toISOString();
}
export interface WorkflowServices {
  capture: typeof captureEvidence;
  deploy: typeof deployAgreement;
  submit: typeof submitVerification;
  tx: typeof transaction;
  verdict: typeof readVerdict;
  gateway: (a: Agreement) => PaymentGateway;
}
const defaults: WorkflowServices = {
  capture: captureEvidence,
  deploy: deployAgreement,
  submit: submitVerification,
  tx: transaction,
  verdict: readVerdict,
  gateway: (a) => (a.mode === "demo" ? demoGateway() : paypal),
};
export class Workflow {
  services: WorkflowServices;
  constructor(
    public store: Store,
    services: Partial<WorkflowServices> = {},
  ) {
    this.services = { ...defaults, ...services };
  }
  async run(id?: string): Promise<boolean> {
    const job = await this.store.claimJob(id);
    if (!job) return false;
    const slot = randomUUID();
    let acquired: string | undefined;
    for (const name of ["worker:0", "worker:1"])
      if (await this.store.leaseSlot(name, slot, 85000)) {
        acquired = name;
        break;
      }
    if (!acquired) {
      await this.store.finishJob(job, later(3));
      return false;
    }
    try {
      const next = await this.advance(job.agreementId);
      await this.store.finishJob(job, next);
      const current = await this.store.getAgreement(job.agreementId);
      if (current)
        await notifyAgreement(this.store, current).catch(() => undefined);
    } catch (e) {
      const message =
        e instanceof DomainError
          ? e.message
          : "A service could not finish this step. The saved job can be retried safely.";
      await mutate(this.store, job.agreementId, (a) => {
        a.lastError = message;
      });
      await this.store.finishJob(
        job,
        later(Math.min(300, 10 * Math.max(1, job.attempts))),
        message,
      );
    } finally {
      await this.store.releaseSlot(acquired, slot);
    }
    return true;
  }
  async reconcile(id: string) {
    const a = await this.store.getAgreement(id);
    if (!a || !a.payment.orderId) return;
    const gateway = this.services.gateway(a);
    if (
      [
        "CAPTURE_RESERVED",
        "CAPTURE_SUBMITTED",
        "PENDING",
        "PAID",
        "UNKNOWN",
      ].includes(a.payment.status) &&
      a.payment.command?.kind === "CAPTURE"
    ) {
      const receipt = await gateway.findCapture(a);
      await mutate(this.store, id, (x) => {
        if (x.payment.command?.id !== a.payment.command?.id) return;
        if (receipt) {
          if (x.payment.status !== "PAID" || receipt.status !== "COMPLETED")
            applyCapture(x, receipt);
        } else {
          x.payment.status = "UNKNOWN";
          x.payment.command!.state = "UNKNOWN";
          x.payment.error =
            "The capture outcome is not confirmed. Further payment actions are blocked while PayPal is checked.";
        }
        x.payment.lastReconciledAt = new Date().toISOString();
      });
      return;
    }
    if (
      [
        "AUTHORIZING",
        "AUTH_PENDING",
        "AUTHORIZED",
        "VOID_RESERVED",
        "VOID_PENDING",
        "UNKNOWN",
      ].includes(a.payment.status)
    ) {
      const auth = await gateway.readAuthorization(a);
      if (!auth) return;
      await mutate(this.store, id, (x) => {
        if (x.payment.command?.id !== a.payment.command?.id) return;
        x.payment.lastReconciledAt = new Date().toISOString();
        if (auth.status === "VOIDED") {
          x.payment.status = "VOIDED";
          x.payment.voidedAt = new Date().toISOString();
          x.state = "CANCELED";
          if (x.payment.command) x.payment.command.state = "RESOLVED";
          audit(
            x,
            "AUTHORIZATION_VOIDED",
            "PayPal confirmed that the uncollected authorization was canceled.",
            "paypal",
          );
        } else if (
          ["AUTHORIZING", "AUTH_PENDING"].includes(x.payment.status) ||
          (x.payment.command?.kind === "AUTHORIZE" &&
            x.payment.status === "UNKNOWN")
        )
          applyAuthorization(x, auth);
      });
    }
  }
  async advance(id: string): Promise<string | undefined> {
    const a = await this.store.getAgreement(id);
    if (!a) return;
    if (
      [
        "CAPTURE_RESERVED",
        "CAPTURE_SUBMITTED",
        "PENDING",
        "UNKNOWN",
        "AUTHORIZING",
        "AUTH_PENDING",
        "VOID_RESERVED",
        "VOID_PENDING",
      ].includes(a.payment.status)
    ) {
      await this.reconcile(id);
      return later(45);
    }
    if (["PAID", "VOIDED", "EXPIRED"].includes(a.payment.status)) return;
    if (
      a.payment.status === "AUTHORIZED" &&
      (a.cancelRequestedAt ||
        Date.parse(a.payment.captureDeadline || "") <= Date.now())
    ) {
      const cmd = command("VOID", a);
      const reserved = await mutate(this.store, id, (x) => {
        if (x.payment.status !== "AUTHORIZED")
          throw new DomainError(
            "PAYMENT_IN_FLIGHT",
            "A payment operation is already running.",
          );
        x.payment.status = "VOID_RESERVED";
        x.payment.command = cmd;
      });
      try {
        await this.services.gateway(reserved).void(reserved, cmd.id);
        await mutate(this.store, id, (x) => {
          if (x.payment.command?.id !== cmd.id) return;
          x.payment.status = "VOIDED";
          x.payment.command.state = "RESOLVED";
          x.payment.voidedAt = new Date().toISOString();
          x.state = "CANCELED";
          audit(
            x,
            "AUTHORIZATION_VOIDED",
            "The uncollected authorization was canceled.",
            a.mode === "demo" ? "system" : "paypal",
          );
        });
      } catch {
        await mutate(this.store, id, (x) => {
          if (x.payment.command?.id === cmd.id) {
            x.payment.status = "VOID_PENDING";
            x.payment.command.state = "UNKNOWN";
            x.payment.error =
              "Cancellation is awaiting confirmation from PayPal.";
          }
        });
      }
      return later(30);
    }
    if (a.state === "CANCELED") return;
    if (a.baselineStatus === "QUEUED") {
      try {
        const baseline = await this.services.capture(this.store, a, true);
        await mutate(this.store, id, (x) => {
          if (x.state !== "DRAFT" || x.sourceUrl !== a.sourceUrl) return;
          x.baseline = baseline;
          x.baselineStatus = "READY";
          x.lastError = undefined;
          audit(
            x,
            "BASELINE_CAPTURED",
            "The original page was captured for comparison.",
            "system",
            { artifactHash: baseline.artifactHash },
          );
        });
      } catch (e) {
        await mutate(this.store, id, (x) => {
          if (x.state !== "DRAFT" || x.sourceUrl !== a.sourceUrl) return;
          x.baselineStatus = "FAILED";
          x.lastError =
            e instanceof DomainError
              ? e.message
              : "The original page could not be captured. Check the URL and capture service.";
        });
      }
      return;
    }
    if (a.payment.status !== "AUTHORIZED") return;
    const s = currentSubmission(a);
    if (s?.state === "CAPTURING") {
      try {
        const evidence = await this.services.capture(this.store, a);
        if (
          a.submissions.some(
            (other) =>
              other.id !== s.id &&
              other.evidence?.contentHash === evidence.contentHash,
          )
        )
          throw new DomainError(
            "UNCHANGED_SUBMISSION",
            "This page matches an earlier submission. Publish a distinct revision before submitting again.",
          );
        await mutate(this.store, id, (x) => {
          const sub = x.submissions.find((v) => v.id === s.id)!;
          sub.evidence = evidence;
          sub.state = "READY";
          x.lastError = undefined;
          audit(
            x,
            "REVISION_CAPTURED",
            `Revision ${s.revision} was captured as immutable evidence.`,
            "system",
            { artifactHash: evidence.artifactHash },
          );
        });
      } catch (e) {
        await mutate(this.store, id, (x) => {
          const sub = x.submissions.find((v) => v.id === s.id)!;
          sub.state = "FAILED";
          sub.verification.status = "FAILED";
          sub.verification.error =
            e instanceof DomainError
              ? e.message
              : "The page could not be captured.";
        });
      }
      return later(0);
    }
    if (!s && a.termsVersion === "2") return a.payment.captureDeadline;
    const manuallyAccepted = hasManualAcceptance(a);
    if (!manuallyAccepted && a.contract.state === "NONE") {
      if (configuration().newJobsPaused) return later(60);
      if (a.mode === "demo") {
        await mutate(this.store, id, (x) => {
          x.contract = { state: "READY", address: "DEMO-CONTRACT-" + x.id };
          audit(x, "VERIFIER_READY", "The simulated verifier is ready.");
        });
        return later(0);
      }
      await mutate(this.store, id, (x) => {
        if (x.contract.state !== "NONE")
          throw new DomainError(
            "CONCURRENT_UPDATE",
            "The verifier is already being created.",
          );
        x.contract.state = "DEPLOYING";
      });
      try {
        const txId = await this.services.deploy(a);
        await mutate(this.store, id, (x) => {
          x.contract = { state: "SUBMITTED", txId };
          x.lastError = undefined;
          audit(
            x,
            "CONTRACT_SUBMITTED",
            "The frozen agreement was submitted to Studionet.",
            "genlayer",
            { txId },
          );
        });
      } catch {
        await mutate(this.store, id, (x) => {
          x.contract.state = "UNKNOWN";
          x.contract.error =
            "The deployment outcome is unknown. Recover its transaction ID before retrying.";
        });
      }
      return later(5);
    }
    if (!manuallyAccepted && a.contract.state === "DEPLOYING") {
      await mutate(this.store, id, (x) => {
        x.contract.state = "UNKNOWN";
        x.contract.error =
          "The deployment was interrupted before its transaction ID was saved. Operator reconciliation is required.";
      });
      return a.payment.captureDeadline;
    }
    if (
      !manuallyAccepted &&
      a.contract.state === "SUBMITTED" &&
      a.contract.txId
    ) {
      const tx = await this.services.tx(a.contract.txId);
      if (tx.status === "FINALIZED") {
        await mutate(this.store, id, (x) => {
          if (
            tx.execution !== "FINISHED_WITH_RETURN" ||
            !/^0x[0-9a-fA-F]{40}$/.test(tx.recipient)
          ) {
            x.contract.state = "FAILED";
            x.contract.error =
              "Studionet finalized an unsuccessful deployment. No payment can be collected.";
            return;
          }
          x.contract.state = "READY";
          x.contract.address = tx.recipient;
          x.lastError = undefined;
          audit(
            x,
            "VERIFIER_READY",
            "The agreement contract finalized successfully on Studionet.",
            "genlayer",
            { contractAddress: tx.recipient, txId: x.contract.txId! },
          );
        });
        return later(0);
      }
      if (["UNDETERMINED", "CANCELED"].includes(tx.status)) {
        await mutate(this.store, id, (x) => {
          x.contract.state = "FAILED";
          x.contract.error =
            "Studionet did not reach a successful final deployment.";
        });
        return a.payment.captureDeadline;
      }
      return later(8);
    }
    if (!s) return a.payment.captureDeadline;
    if (
      s.state !== "READY" ||
      (!manuallyAccepted && a.contract.state !== "READY")
    )
      return a.payment.captureDeadline;
    if (!manuallyAccepted && s.verification.status === "QUEUED") {
      if (configuration().newJobsPaused) return later(60);
      if (a.mode === "demo") {
        await mutate(this.store, id, (x) => {
          const sub = x.submissions.find((v) => v.id === s.id)!;
          sub.verification = {
            mode: "demo",
            status: "AWAITING_FINALITY",
            contractAddress: x.contract.address,
            txId: "DEMO-TX-" + s.id,
            submittedAt: new Date().toISOString(),
            result: simulatedVerdict(x, sub),
          };
          audit(
            x,
            "VERIFICATION_SUBMITTED",
            "Simulated requirement checks are running.",
          );
        });
        return later(2);
      }
      if (
        !(await this.store.consumeQuota(
          "verifications:" + new Date().toISOString().slice(0, 10),
          configuration().maxDaily,
        ))
      )
        throw new DomainError(
          "DAILY_LIMIT",
          "Today's verification limit has been reached. Funds remain uncollected.",
        );
      await mutate(this.store, id, (x) => {
        const sub = x.submissions.find((v) => v.id === s.id)!;
        if (sub.verification.status !== "QUEUED")
          throw new DomainError(
            "CONCURRENT_UPDATE",
            "Verification has already started.",
          );
        sub.verification.status = "SUBMITTING";
        sub.verification.submittedAt = new Date().toISOString();
      });
      // Failed earlier captures do not advance the on-chain revision counter.
      const contractRevision =
        a.submissions.filter(
          (v) => v.id !== s.id && v.verification.status === "FINALIZED",
        ).length + 1;
      try {
        const txId = await this.services.submit(a, {
          ...s,
          revision: contractRevision,
        });
        await mutate(this.store, id, (x) => {
          const sub = x.submissions.find((v) => v.id === s.id)!;
          sub.verification.status = "SUBMITTED";
          sub.verification.txId = txId;
          sub.verification.contractAddress = x.contract.address;
          audit(
            x,
            "VERIFICATION_SUBMITTED",
            "Evidence was submitted to the agreement's Studionet contract.",
            "genlayer",
            { txId },
          );
        });
      } catch {
        await mutate(this.store, id, (x) => {
          const sub = x.submissions.find((v) => v.id === s.id)!;
          sub.verification.status = "UNKNOWN";
          sub.verification.error =
            "The submission outcome is unknown. Recover its transaction ID before another attempt.";
        });
      }
      return later(6);
    }
    if (!manuallyAccepted && s.verification.status === "SUBMITTING") {
      await mutate(this.store, id, (x) => {
        const sub = x.submissions.find((v) => v.id === s.id)!;
        sub.verification.status = "UNKNOWN";
        sub.verification.error =
          "Submission was interrupted. Operator reconciliation is required.";
      });
      return a.payment.captureDeadline;
    }
    if (
      !manuallyAccepted &&
      ["SUBMITTED", "AWAITING_FINALITY"].includes(s.verification.status)
    ) {
      const tx =
        a.mode === "demo"
          ? {
              status: "FINALIZED",
              execution: "FINISHED_WITH_RETURN",
              recipient: a.contract.address,
            }
          : await this.services.tx(s.verification.txId!);
      if (tx.status === "FINALIZED") {
        if (
          tx.execution !== "FINISHED_WITH_RETURN" ||
          tx.recipient?.toLowerCase() !== a.contract.address?.toLowerCase()
        ) {
          await this.failVerification(
            id,
            s,
            "The transaction finalized without a successful result for this contract.",
          );
          return a.payment.captureDeadline;
        }
        let result;
        try {
          result = validateVerdict(
            a.mode === "demo"
              ? s.verification.result
              : await this.services.verdict(a.contract.address!, s.id),
            a,
            s,
          );
        } catch {
          await this.failVerification(
            id,
            s,
            "The finalized result does not match this agreement and evidence. Automatic collection is blocked.",
          );
          return a.payment.captureDeadline;
        }
        await mutate(this.store, id, (x) => {
          const sub = x.submissions.find((v) => v.id === s.id)!;
          sub.verification = {
            ...sub.verification,
            status: "FINALIZED",
            protocolStatus: "FINALIZED",
            executionStatus: "FINISHED_WITH_RETURN",
            result,
            finalizedAt: new Date().toISOString(),
          };
          x.lastError = undefined;
          audit(
            x,
            "VERIFICATION_FINALIZED",
            result.verdict === "PASS"
              ? "Every agreed requirement passed. Verification is final."
              : result.verdict === "REVISE"
                ? "A requirement needs revision. The authorization remains uncharged."
                : "The evidence needs human review. Nothing will be charged automatically.",
            a.mode === "demo" ? "system" : "genlayer",
            { submissionId: s.id, verdict: result.verdict },
          );
        });
        return later(a.mode === "demo" ? 2 : 0);
      }
      if (["UNDETERMINED", "CANCELED"].includes(tx.status)) {
        await this.failVerification(
          id,
          s,
          "Studionet did not reach a finalized successful decision.",
        );
        return a.payment.captureDeadline;
      }
      await mutate(this.store, id, (x) => {
        const sub = x.submissions.find((v) => v.id === s.id)!;
        sub.verification.status = "AWAITING_FINALITY";
        sub.verification.protocolStatus = tx.status;
      });
      return later(8);
    }
    if (
      ((a.terms?.settlementPolicy !== "BUYER_APPROVAL_REQUIRED" &&
        a.mode !== "live" &&
        hasFinalPass(a)) ||
        hasManualAcceptance(a)) &&
      a.state === "ACTIVE" &&
      !a.reviewHoldAt
    ) {
      if (configuration().settlementPaused) return later(60);
      assertCaptureEligible(a, new Date(), false);
      const fresh = await this.services.capture(this.store, a);
      if (fresh.contentHash !== s.evidence!.contentHash) {
        await mutate(this.store, id, (x) => {
          x.freshEvidence = fresh;
          x.state = "REVIEW_HOLD";
          x.holdReason = "CONTENT_CHANGED";
          x.reviewHoldAt = new Date().toISOString();
          audit(
            x,
            "CONTENT_CHANGED",
            "The page changed after verification. Collection is paused until a new revision is accepted.",
          );
        });
        return a.payment.captureDeadline;
      }
      let cmd: PaymentCommand;
      const reserved = await mutate(this.store, id, (x) => {
        x.freshEvidence = fresh;
        const reason = assertCaptureEligible(x);
        cmd = command("CAPTURE", x, {
          submissionId: s.id,
          evidenceHash: s.evidence!.artifactHash,
          reason,
        });
        x.payment.status = "CAPTURE_RESERVED";
        x.payment.command = cmd;
        audit(
          x,
          "CAPTURE_RESERVED",
          reason === "BUYER_ACCEPTED"
            ? "Collection started after explicit buyer acceptance and a matching page check."
            : "Collection started after finalized verification and a matching page check.",
        );
      });
      try {
        const receipt = await this.services
          .gateway(reserved)
          .capture(reserved, cmd!.id);
        await mutate(this.store, id, (x) => {
          if (x.payment.command?.id === cmd!.id) applyCapture(x, receipt);
        });
      } catch {
        await mutate(this.store, id, (x) => {
          if (x.payment.command?.id !== cmd!.id) return;
          x.payment.status = "UNKNOWN";
          x.payment.command.state = "UNKNOWN";
          x.payment.error =
            "The collection outcome is not confirmed. PayPal will be reconciled; a second charge will not be sent automatically.";
        });
      }
      return later(30);
    }
    return (
      a.payment.captureDeadline &&
      new Date(
        Math.min(
          Date.parse(a.payment.captureDeadline),
          Date.now() + 15 * 60000,
        ),
      ).toISOString()
    );
  }
  private async failVerification(id: string, s: Submission, message: string) {
    await mutate(this.store, id, (x) => {
      const sub = x.submissions.find((v) => v.id === s.id)!;
      sub.verification.status = "FAILED";
      sub.verification.error = message;
      audit(x, "VERIFICATION_FAILED", message, "genlayer");
    });
  }
}
