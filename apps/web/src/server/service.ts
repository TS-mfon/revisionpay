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
import { agreementTemplate } from "@revisionpay/domain/templates";
import { configuration, readiness } from "./config";
import { draft, freeze, audit } from "./model";
import { mutate, type Store } from "./store";
import { command, applyAuthorization } from "./workflow";
import { paypal, demoGateway } from "./paypal";
import { merchantStatus } from "./merchants";
import { queueMail, notifyAgreement } from "./mail";

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
      (who.kind !== "buyer" || who.agreementId === a.id) &&
      (who.kind === "demo" ? a.mode === "demo" : a.mode !== "demo"),
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
  useTemplate: boolean | string = false,
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
  const template =
    typeof useTemplate === "string"
      ? agreementTemplate(useTemplate)
      : undefined;
  if (typeof useTemplate === "string") {
    requireCondition(
      template,
      "TEMPLATE_NOT_FOUND",
      "Choose one of the available agreement templates.",
      404,
    );
    requireCondition(
      who.kind !== "demo" && configuration().mode !== "live",
      "SANDBOX_ONLY",
      "These test agreements are available in the sandbox workspace.",
      403,
    );
  }
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
    template
      ? {
          title: template.name,
          clientName: template.clientName,
          amountMinor: template.amountMinor,
          sourceUrl: configuration().appUrl + "/test-site/" + id,
          requirements: structuredClone(template.requirements),
        }
      : demo || useTemplate
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
    const url = new URL(data.sourceUrl);
    const localTestPage =
      template &&
      configuration().mode === "demo" &&
      !process.env.VERCEL &&
      !process.env.NETLIFY &&
      ["localhost", "127.0.0.1"].includes(url.hostname) &&
      url.origin === new URL(configuration().appUrl).origin;
    requireCondition(
      (localTestPage || (url.protocol === "https:" && !url.port)) &&
        !url.username &&
        !url.password &&
        !url.hash,
      "SOURCE_NOT_ALLOWED",
      "Enter a public HTTPS page without a password, port or fragment.",
    );
    if (who.kind === "seller" && !template)
      requireCondition(
        data.clientEmail,
        "EMAIL_REQUIRED",
        "Enter the client email for invitations and secure access.",
      );
  }
  const a = draft(
    data,
    who.tenantId,
    template
      ? "sandbox"
      : demo
        ? "demo"
        : configuration().mode === "live" ||
            (who.kind === "seller" && configuration().mode !== "sandbox")
          ? "live"
          : "sandbox",
    id,
  );
  a.termsVersion = "2";
  a.testTemplateId = template?.id;
  a.draftRevision = 0;
  a.sellerName = who.name || (demo ? "Alex Morgan" : "Your freelancer");
  a.sellerEmail = who.email;

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
export async function freezeAgreement(
  store: Store,
  who: Actor,
  id: string,
  expectedRevision?: number,
) {
  const before = await allowed(store, who, id, "seller");
  requireCondition(
    before.state === "DRAFT",
    "ALREADY_SENT",
    "This agreement has already been sent.",
  );
  requireCondition(
    before.baselineStatus === "READY" && before.baseline?.complete,
    "BASELINE_REQUIRED",
    "Wait for the complete page check before sending.",
  );
  requireCondition(
    before.termsVersion !== "2" ||
      expectedRevision === (before.draftRevision || 0),
    "DRAFT_CHANGED",
    "The draft changed. Reload and review the latest version before sending.",
  );
  let merchantId: string | undefined;
  let integration: "DIRECT" | "PLATFORM" | undefined;
  if (before.mode !== "demo") {
    const connection = await merchantStatus(store, who);
    requireCondition(
      connection.status === "READY" && connection.environment === before.mode,
      "CONNECT_PAYPAL",
      "Connect your PayPal account before sending this agreement.",
    );
    requireCondition(
      before.mode !== "live" || readiness().livePayments,
      "LIVE_UNAVAILABLE",
      "Live payments are not available yet. Your draft is saved.",
      503,
    );
    merchantId = connection.merchantId;
    integration =
      connection.trackingId === "legacy-owner" ? "DIRECT" : "PLATFORM";
  }
  const raw = token(),
    lease = randomUUID();
  const admission = before.mode === "live";
  if (admission)
    requireCondition(
      await store.leaseSlot("live-admission", lease, 15000),
      "CAPACITY_BUSY",
      "Another agreement is being prepared. Try again in a moment.",
    );
  try {
    if (admission) {
      const all = (await store.listAgreements()).filter(
        (a) =>
          a.mode === "live" &&
          a.state !== "DRAFT" &&
          !["CLOSED", "CANCELED"].includes(a.state),
      );
      requireCondition(
        all.length < 5 &&
          all.filter((a) => a.tenantId === who.tenantId).length < 2,
        "BETA_CAPACITY",
        "The beta is at capacity. Your draft is saved; existing agreements can finish.",
      );
      requireCondition(
        await store.consumeQuota(
          "live-admission:" + new Date().toISOString().slice(0, 7),
          10,
        ),
        "BETA_MONTHLY_LIMIT",
        "This month's beta capacity is full. Your draft is saved.",
      );
    }
    const a = await mutate(store, id, (x) => {
      requireCondition(
        x.state === "DRAFT" &&
          x.baselineStatus === "READY" &&
          x.baseline?.sourceUrl === x.sourceUrl,
        "BASELINE_REQUIRED",
        "Wait for the page check to finish before sending.",
      );
      requireCondition(
        (x.draftRevision || 0) === (before.draftRevision || 0),
        "DRAFT_CHANGED",
        "Review the latest draft before sending.",
      );
      if (x.termsVersion === "2") {
        x.payment.merchantId = merchantId;
        x.payment.integration = integration;
      }
      freeze(x);
      x.invitation = {
        tokenHash: sha256(raw),
        expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      };
      if (admission) x.admissionMonth = new Date().toISOString().slice(0, 7);
    });
    const invitationUrl = configuration().appUrl + "/invite#" + raw;
    const email = await invitationMail(store, a, invitationUrl);
    return { a, invitationUrl, email };
  } finally {
    if (admission) await store.releaseSlot("live-admission", lease);
  }
}
async function invitationMail(
  store: Store,
  a: Agreement,
  invitationUrl: string,
) {
  if (!a.clientEmail || a.mode === "demo") return "LINK_READY";
  if (!readiness().emailAuth) return "UNAVAILABLE";
  try {
    await queueMail(store, "invite:" + a.id + ":" + a.invitation?.tokenHash, {
      to: a.clientEmail,
      subject:
        (a.sellerName || "Your freelancer") + " sent a revision agreement",
      text:
        "Review the website changes and fixed fee before authorizing payment. You approve the finished work before payment is collected.\n\n" +
        invitationUrl,
    });
    return "QUEUED";
  } catch {
    return "UNAVAILABLE";
  }
}
export async function updateDraft(
  store: Store,
  who: Actor,
  id: string,
  input: unknown,
  version: number,
) {
  const before = await allowed(store, who, id, "seller");
  const data = CreateAgreementSchema.parse(input);
  const url = new URL(data.sourceUrl);
  const localTestPage =
    before.testTemplateId &&
    agreementTemplate(before.testTemplateId) &&
    configuration().mode === "demo" &&
    !process.env.VERCEL &&
    !process.env.NETLIFY &&
    ["localhost", "127.0.0.1"].includes(url.hostname) &&
    data.sourceUrl === configuration().appUrl + "/test-site/" + id;
  requireCondition(
    (localTestPage || (url.protocol === "https:" && !url.port)) &&
      !url.username &&
      !url.password &&
      !url.hash,
    "SOURCE_NOT_ALLOWED",
    "Enter a public HTTPS page.",
  );
  const a = await mutate(store, id, (x) => {
    requireCondition(
      x.state === "DRAFT" && !x.digest,
      "TERMS_LOCKED",
      "Sent agreements cannot be edited. Create a new agreement for new terms.",
    );
    requireCondition(
      (x.draftRevision || 0) === version,
      "DRAFT_CHANGED",
      "This draft changed in another tab. Reload it before editing.",
    );
    if (x.sourceUrl !== data.sourceUrl) {
      x.baseline = undefined;
      x.baselineStatus = "QUEUED";
      x.lastError = undefined;
    }
    Object.assign(x, data);
    x.draftRevision = version + 1;
  });
  await store.ensureJob(id);
  return a;
}

export async function invite(store: Store, who: Actor, id: string) {
  await allowed(store, who, id, "seller");
  const raw = token();
  const a = await mutate(store, id, (a) => {
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
  const url = configuration().appUrl + "/invite#" + raw;
  const email = await invitationMail(store, a, url);
  return { invitationUrl: url, email };
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
        copyVersion: a.terms?.schemaVersion === "2" ? "2" : "1",
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
  if (a.mode === "live") {
    requireCondition(
      readiness().livePayments,
      "LIVE_UNAVAILABLE",
      "Live payments are temporarily unavailable. Nothing has been charged.",
      503,
    );
    const connection = await merchantStatus(store, {
      ...who,
      role: "seller",
      kind: "seller",
    });
    requireCondition(
      connection.status === "READY" &&
        connection.merchantId === a.terms?.merchantId,
      "MERCHANT_UNAVAILABLE",
      "The freelancer needs to reconnect their payment account.",
    );
  }
  const previous = await store.getValue<string>("approval:" + id);
  if (a.payment.status === "ORDER_CREATED" && previous !== undefined) {
    a = await refreshCheckout(store, who, id);
    requireCondition(
      !a.payment.checkoutUnavailable,
      "CHECKOUT_UNAVAILABLE",
      "This PayPal checkout is no longer available. Ask your freelancer for a new agreement.",
      409,
    );
    if (a.payment.status !== "ORDER_CREATED")
      return { mode: a.mode, status: a.payment.status };
    return { approvalUrl: previous, orderId: a.payment.orderId, mode: a.mode };
  }
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
export async function refreshCheckout(store: Store, who: Actor, id: string) {
  const a = await allowed(store, who, id);
  if (a.mode === "demo" || a.payment.status !== "ORDER_CREATED") return a;
  try {
    const receipt = await paypal.readAuthorization(a);
    const saved = await mutate(store, id, (x) => {
      if (
        x.payment.status !== "ORDER_CREATED" ||
        x.payment.orderId !== a.payment.orderId
      )
        return;
      x.payment.checkoutUnavailable = undefined;
      x.payment.error = undefined;
      if (receipt) applyAuthorization(x, receipt);
    });
    if (receipt && saved.payment.authorizationId === receipt.id)
      await store.ensureJob(id);
    return saved;
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      error.code !== "PAYPAL_INVALID_RESOURCE_ID"
    )
      throw error;
    return mutate(store, id, (x) => {
      if (
        x.payment.status !== "ORDER_CREATED" ||
        x.payment.orderId !== a.payment.orderId
      )
        return;
      // Preserve provider IDs: a missing order does not prove a void or payment.
      x.payment.checkoutUnavailable = true;
      x.payment.error =
        "PayPal cannot find this checkout. Start a fresh agreement with a new client approval; this agreement stays in your history.";
    });
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
    if (x.holdReason === "CONTENT_CHANGED" || x.termsVersion === "2") {
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
  const testPage =
    a.mode === "sandbox" &&
    Boolean(a.testTemplateId && agreementTemplate(a.testTemplateId)) &&
    a.sourceUrl === configuration().appUrl + "/test-site/" + a.id;
  requireCondition(
    (a.sourceUrl === configuration().appUrl + "/demo-site/" + a.id ||
      testPage) &&
      VARIANTS.some((v) => v.id === variant),
    "DEMO_PAGE_ONLY",
    "The page editor is only available for the project-owned example page.",
  );
  if (testPage)
    requireCondition(
      a.payment.status === "AUTHORIZED" &&
        !a.cancelRequestedAt &&
        ["incomplete", "corrected"].includes(variant),
      "TEST_PAGE_NOT_READY",
      "Authorize the sandbox agreement before publishing a test revision.",
    );
  return mutate(store, id, (x) => {
    if (testPage)
      requireCondition(
        x.payment.status === "AUTHORIZED" && !x.cancelRequestedAt,
        "TEST_PAGE_NOT_READY",
        "This test page cannot change after payment collection starts.",
      );
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
export async function hold(store: Store, who: Actor, id: string, note = "") {
  await allowed(store, who, id, "buyer");
  return mutate(store, id, (a) => {
    requireCondition(
      a.payment.status === "AUTHORIZED",
      "PAYMENT_IN_FLIGHT",
      "Review must be requested before collection starts.",
    );
    a.state = "REVIEW_HOLD";
    a.changeRequest = note.slice(0, 1000);
    a.manualAcceptanceId = undefined;
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
        s.evidence?.artifactHash === artifactHash &&
        s.evidence.complete &&
        Date.parse(x.payment.captureDeadline || "") > Date.now(),
      "SUBMISSION_CHANGED",
      "Review the current submitted version before accepting it.",
    );
    if (
      x.manualAcceptanceId &&
      x.consents.some(
        (c) =>
          c.id === x.manualAcceptanceId &&
          c.submissionId === submissionId &&
          c.artifactHash === artifactHash,
      )
    )
      return;
    const id = randomUUID();
    x.consents.push({
      id,
      kind: "BUYER_ACCEPTED",
      digest: x.digest!,
      at: new Date().toISOString(),
      actorId: who.id,
      submissionId,
      artifactHash,
      copyVersion: x.terms?.schemaVersion === "2" ? "2" : "1",
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
