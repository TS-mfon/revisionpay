import { randomUUID } from "node:crypto";
import {
  CreateAgreementSchema,
  requireCondition,
  assertCanSubmit,
  assertCanCancel,
  currentSubmission,
  type Actor,
  type Agreement,
  type DemoVariant,
} from "@revisionpay/domain";
import { sha256, token } from "@revisionpay/domain/crypto";
import { DEFAULT_REQUIREMENTS, VARIANTS } from "@revisionpay/domain/fixtures";
import { configuration, readiness } from "./config";
import { draft, freeze, audit } from "./model";
import { mutate, type Store } from "./store";
import { command, applyAuthorization } from "./workflow";
import { paypal, demoGateway } from "./paypal";

export async function allowed(
  store: Store,
  who: Actor | undefined,
  id: string,
  role?: "seller" | "buyer",
): Promise<Agreement> {
  requireCondition(
    who,
    "SIGN_IN_REQUIRED",
    "Sign in or open your buyer invitation to continue.",
    401,
  );
  const a = await store.getAgreement(id);
  requireCondition(
    a &&
      who.tenantId === a.tenantId &&
      (who.kind !== "buyer" || who.agreementId === a.id),
    "NOT_FOUND",
    "Agreement not found.",
    404,
  );
  requireCondition(
    !role || who.role === role,
    "ROLE_REQUIRED",
    `This action is available to the ${role}.`,
    403,
  );
  return a;
}
export async function create(
  store: Store,
  who: Actor,
  input: unknown,
  useTemplate = false,
) {
  requireCondition(
    who.role === "seller",
    "SELLER_REQUIRED",
    "Switch to the seller role to create an agreement.",
    403,
  );
  requireCondition(
    !configuration().newJobsPaused,
    "PAUSED",
    "New agreements are temporarily paused.",
    503,
  );
  const existing = await store.listAgreements(who.tenantId);
  requireCondition(
    existing.filter((a) => !["CANCELED", "CLOSED"].includes(a.state)).length <
      (who.kind === "demo" ? 3 : configuration().maxActive),
    "AGREEMENT_LIMIT",
    "Finish or cancel an active agreement before creating another.",
  );
  requireCondition(
    await store.consumeQuota(
      "new-agreements:" + new Date().toISOString().slice(0, 10),
      100,
    ),
    "DAILY_LIMIT",
    "The daily demonstration limit has been reached.",
    429,
  );
  const id = randomUUID();
  const demo = who.kind === "demo";
  const data = CreateAgreementSchema.parse(
    demo || useTemplate
      ? {
          title: "Northstar pricing page revision",
          clientName: "Northstar Studio",
          amountMinor: 18000,
          sourceUrl: configuration().appUrl + "/demo-site/" + id,
          requirements: DEFAULT_REQUIREMENTS,
        }
      : input,
  );
  if (!demo) {
    const r = readiness();
    requireCondition(
      r.paypal && r.genlayer && r.capture,
      "SERVICES_NOT_READY",
      "Connect PayPal sandbox, Studionet, and the capture service before creating a sandbox agreement.",
      503,
    );
    const url = new URL(data.sourceUrl);
    const hosts = new Set(
      (
        process.env.CAPTURE_ALLOWED_HOSTS ||
        new URL(configuration().appUrl).hostname
      )
        .split(",")
        .map((v) => v.trim()),
    );
    requireCondition(
      url.protocol === "https:" &&
        hosts.has(url.hostname) &&
        !url.username &&
        !url.password &&
        !url.hash &&
        !url.port,
      "SOURCE_NOT_ALLOWED",
      "Use an HTTPS page on an approved website host.",
    );
  }
  const a = draft(data, who.tenantId, demo ? "demo" : "sandbox", id);
  audit(
    a,
    "AGREEMENT_CREATED",
    "A fixed-price website revision agreement was created.",
    "seller",
  );
  await store.createAgreement(a);
  await store.ensureJob(id);
  return a;
}
export async function freezeAgreement(store: Store, who: Actor, id: string) {
  await allowed(store, who, id, "seller");
  const raw = token();
  const a = await mutate(store, id, (x) => {
    requireCondition(
      x.state === "DRAFT" && x.baselineStatus === "READY",
      "BASELINE_REQUIRED",
      "Wait for a complete original-page capture before freezing the agreement.",
    );
    freeze(x);
    x.invitation = {
      tokenHash: sha256(raw),
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    };
  });
  return { a, invitationUrl: configuration().appUrl + "/invite#" + raw };
}
export async function invite(store: Store, who: Actor, id: string) {
  await allowed(store, who, id, "seller");
  const raw = token();
  await mutate(store, id, (a) => {
    requireCondition(
      a.state === "AWAITING_BUYER" &&
        !a.invitation?.redeemedAt &&
        a.payment.status === "NONE",
      "INVITATION_LOCKED",
      "The invitation cannot be replaced after redemption or checkout begins.",
    );
    a.invitation = {
      tokenHash: sha256(raw),
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    };
  });
  return configuration().appUrl + "/invite#" + raw;
}
export async function consent(
  store: Store,
  who: Actor,
  id: string,
  digest: string,
) {
  await allowed(store, who, id, "buyer");
  return mutate(store, id, (a) => {
    requireCondition(
      a.state === "AWAITING_BUYER" && a.digest === digest,
      "TERMS_CHANGED",
      "Read and accept the current frozen agreement.",
    );
    if (
      !a.consents.some(
        (v) =>
          v.kind === "AGREEMENT" && v.actorId === who.id && v.digest === digest,
      )
    ) {
      a.consents.push({
        id: randomUUID(),
        kind: "AGREEMENT",
        digest,
        at: new Date().toISOString(),
        actorId: who.id,
        copyVersion: "1",
      });
      audit(
        a,
        "BUYER_CONSENT",
        "The buyer accepted the exact fee, requirements, public-evidence policy, and collection conditions.",
        "buyer",
      );
    }
  });
}
export async function checkout(store: Store, who: Actor, id: string) {
  let a = await allowed(store, who, id, "buyer");
  requireCondition(
    a.consents.some(
      (v) =>
        v.kind === "AGREEMENT" && v.actorId === who.id && v.digest === a.digest,
    ),
    "CONSENT_REQUIRED",
    "Accept this agreement before authorizing payment.",
  );
  const previous = await store.getValue<string>("approval:" + id);
  if (a.payment.status === "ORDER_CREATED" && previous !== undefined)
    return { approvalUrl: previous, orderId: a.payment.orderId, mode: a.mode };
  a = await mutate(store, id, (x) => {
    requireCondition(
      x.state === "AWAITING_BUYER" && x.payment.status === "NONE",
      "CHECKOUT_IN_PROGRESS",
      "Checkout has already started. Refresh to see its confirmed state.",
    );
    x.payment.command = command("CREATE_ORDER", x);
    x.payment.status = "ORDER_CREATING";
  });
  try {
    const result = await (
      a.mode === "demo" ? demoGateway() : paypal
    ).createOrder(a, a.payment.command!.id);
    await store.putValue("approval:" + id, result.approvalUrl);
    await mutate(store, id, (x) => {
      requireCondition(
        x.payment.command?.id === a.payment.command!.id,
        "PAYMENT_IN_FLIGHT",
        "The payment state changed.",
      );
      x.payment.orderId = result.id;
      x.payment.status = "ORDER_CREATED";
      x.payment.command.state = "RESOLVED";
    });
    return { ...result, orderId: result.id, mode: a.mode };
  } catch (e) {
    await mutate(store, id, (x) => {
      if (x.payment.command?.id === a.payment.command?.id) {
        x.payment.status = "UNKNOWN";
        x.payment.command!.state = "UNKNOWN";
        x.payment.error =
          "Checkout did not return a confirmed order. Operator reconciliation is required before trying again.";
      }
    });
    throw e;
  }
}
export async function authorize(store: Store, who: Actor, id: string) {
  let a = await allowed(store, who, id, "buyer");
  requireCondition(
    a.consents.some(
      (v) =>
        v.kind === "AGREEMENT" && v.actorId === who.id && v.digest === a.digest,
    ),
    "CONSENT_REQUIRED",
    "The authorizing buyer must accept this agreement.",
  );
  if (a.payment.status === "AUTHORIZED") return a;
  a = await mutate(store, id, (x) => {
    requireCondition(
      x.payment.status === "ORDER_CREATED" && x.state === "AWAITING_BUYER",
      "ORDER_REQUIRED",
      "Complete the PayPal approval first.",
    );
    x.payment.command = command("AUTHORIZE", x);
    x.payment.status = "AUTHORIZING";
  });
  try {
    const receipt = await (
      a.mode === "demo" ? demoGateway() : paypal
    ).authorize(a, a.payment.command!.id);
    const saved = await mutate(store, id, (x) => {
      requireCondition(
        x.payment.command?.id === a.payment.command!.id,
        "PAYMENT_IN_FLIGHT",
        "The payment state changed.",
      );
      applyAuthorization(x, receipt);
    });
    await store.ensureJob(id);
    return saved;
  } catch (e) {
    const approvalMissing =
      e instanceof Error && "code" in e && e.code === "BUYER_APPROVAL_REQUIRED";
    await mutate(store, id, (x) => {
      if (x.payment.command?.id === a.payment.command?.id) {
        x.payment.status = approvalMissing ? "ORDER_CREATED" : "UNKNOWN";
        x.payment.command!.state = approvalMissing ? "RESOLVED" : "UNKNOWN";
        x.payment.error = approvalMissing
          ? undefined
          : "Authorization is awaiting confirmation. No work should begin yet.";
      }
    });
    if (!approvalMissing) await store.ensureJob(id);
    throw e;
  }
}
export async function submit(
  store: Store,
  who: Actor,
  id: string,
  note: string,
) {
  await allowed(store, who, id, "seller");
  const a = await mutate(store, id, (x) => {
    assertCanSubmit(x);
    const subId = randomUUID();
    x.submissions.push({
      id: subId,
      revision: x.submissions.length + 1,
      state: "CAPTURING",
      requestedAt: new Date().toISOString(),
      verification: { status: "QUEUED", mode: x.mode },
      note: note.slice(0, 500),
    });
    x.currentSubmissionId = subId;
    x.freshEvidence = undefined;
    x.manualAcceptanceId = undefined;
    if (x.holdReason === "CONTENT_CHANGED") {
      x.state = "ACTIVE";
      x.reviewHoldAt = undefined;
      x.holdReason = undefined;
    }
    x.lastError = undefined;
    audit(
      x,
      "REVISION_SUBMITTED",
      `Revision ${x.submissions.length} was submitted for the agreed checks.`,
      "seller",
    );
  });
  await store.ensureJob(id);
  return a;
}
export async function setVariant(
  store: Store,
  who: Actor,
  id: string,
  variant: DemoVariant,
) {
  const a = await allowed(store, who, id, "seller");
  requireCondition(
    a.sourceUrl === configuration().appUrl + "/demo-site/" + a.id &&
      VARIANTS.some((v) => v.id === variant),
    "DEMO_PAGE_ONLY",
    "The page editor is only available for the project-owned example page.",
  );
  return mutate(store, id, (x) => {
    requireCondition(
      x.state !== "CLOSED" && x.state !== "CANCELED",
      "AGREEMENT_CLOSED",
      "This agreement is closed.",
    );
    x.demoVariant = variant;
    audit(
      x,
      "PAGE_PUBLISHED",
      "The example page was updated to: " +
        VARIANTS.find((v) => v.id === variant)!.label +
        ".",
      "seller",
    );
  });
}
export async function hold(store: Store, who: Actor, id: string) {
  await allowed(store, who, id, "buyer");
  return mutate(store, id, (a) => {
    requireCondition(
      a.payment.status === "AUTHORIZED",
      "PAYMENT_IN_FLIGHT",
      "Review must be requested before collection starts.",
    );
    a.state = "REVIEW_HOLD";
    a.reviewHoldAt = new Date().toISOString();
    a.holdReason = "BUYER";
    audit(
      a,
      "BUYER_REVIEW_HOLD",
      "The buyer requested review. Automatic collection is paused.",
      "buyer",
    );
  });
}
export async function acceptSubmission(
  store: Store,
  who: Actor,
  id: string,
  submissionId: string,
  artifactHash: string,
) {
  await allowed(store, who, id, "buyer");
  const a = await mutate(store, id, (x) => {
    const s = currentSubmission(x);
    requireCondition(
      x.payment.status === "AUTHORIZED" &&
        !x.cancelRequestedAt &&
        s?.id === submissionId &&
        s.evidence?.artifactHash === artifactHash,
      "SUBMISSION_CHANGED",
      "Review the current submitted version before accepting it.",
    );
    const id = randomUUID();
    x.consents.push({
      id,
      kind: "BUYER_ACCEPTED",
      digest: x.digest!,
      at: new Date().toISOString(),
      actorId: who.id,
      submissionId,
      artifactHash,
      copyVersion: "1",
    });
    x.manualAcceptanceId = id;
    x.state = "ACTIVE";
    x.reviewHoldAt = undefined;
    x.holdReason = undefined;
    audit(
      x,
      "BUYER_ACCEPTED",
      "The buyer explicitly accepted this version. This is buyer approval, not an AI PASS.",
      "buyer",
      { submissionId, artifactHash },
    );
  });
  await store.ensureJob(id);
  return a;
}
export async function cancel(store: Store, who: Actor, id: string) {
  await allowed(store, who, id);
  const a = await mutate(store, id, (x) => {
    assertCanCancel(x);
    x.cancelRequestedAt = new Date().toISOString();
    x.state = "CANCELED";
    audit(
      x,
      "CANCELLATION_REQUESTED",
      "Cancellation was requested. Any uncollected authorization will be voided where possible.",
      who.role,
    );
  });
  await store.ensureJob(id);
  return a;
}
