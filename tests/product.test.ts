import { afterEach, expect, it, vi } from "vitest";
import {
  assertCaptureEligible,
  type Actor,
} from "../packages/domain/src/index";
import { freeze } from "../apps/web/src/server/model";
import { LocalStore } from "../apps/web/src/server/store";
import { Workflow } from "../apps/web/src/server/workflow";
import {
  acceptSubmission,
  allowed,
  updateDraft,
  hold,
} from "../apps/web/src/server/service";
import { actor, issueSession } from "../apps/web/src/server/auth";
import {
  demoGateway,
  paypal,
  validateOrder,
} from "../apps/web/src/server/paypal";
import { onboardingComplete } from "../apps/web/src/server/merchants";
import { fixtureEvidence } from "../apps/web/src/server/evidence";
import { agreement, revision, buyer, seller } from "./helpers";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
function clientAgreement() {
  const a = agreement();
  a.termsVersion = "2";
  freeze(a);
  a.state = "ACTIVE";
  a.consents[0].digest = a.digest!;
  return a;
}

it("a final PASS on a new agreement waits for client approval, then captures once", async () => {
  const a = clientAgreement(),
    s = revision(a),
    store = new LocalStore(),
    capture = vi.fn(demoGateway().capture);
  await store.createAgreement(a);
  const workflow = new Workflow(store, {
    gateway: () => ({ ...demoGateway(), capture }),
  });
  expect(() => assertCaptureEligible(a)).toThrow(/client must approve/i);
  for (let i = 0; i < 3; i++) await workflow.advance(a.id);
  expect(capture).not.toHaveBeenCalled();
  await acceptSubmission(store, buyer, a.id, s.id, s.evidence!.artifactHash);
  await acceptSubmission(store, buyer, a.id, s.id, s.evidence!.artifactHash);
  expect(
    (await store.getAgreement(a.id))!.consents.filter(
      (c) => c.kind === "BUYER_ACCEPTED",
    ),
  ).toHaveLength(1);
  await Promise.allSettled([workflow.advance(a.id), workflow.advance(a.id)]);
  expect(capture).toHaveBeenCalledTimes(1);
});
it("client review still receives complete evidence when contract deployment stalls", async () => {
  const a = clientAgreement(),
    s = revision(a, "incomplete", false);
  s.state = "CAPTURING";
  s.evidence = undefined;
  a.contract = { state: "UNKNOWN" };
  const store = new LocalStore();
  await store.createAgreement(a);
  const capture = vi.fn(demoGateway().capture);
  const workflow = new Workflow(store, {
    gateway: () => ({ ...demoGateway(), capture }),
    capture: async (_, x) => fixtureEvidence(x),
  });
  await workflow.advance(a.id);
  const saved = (await store.getAgreement(a.id))!;
  expect(saved.submissions[0].evidence?.complete).toBe(true);
  expect(capture).not.toHaveBeenCalled();
  await acceptSubmission(
    store,
    buyer,
    a.id,
    s.id,
    saved.submissions[0].evidence!.artifactHash,
  );
  await workflow.advance(a.id);
  expect(capture).toHaveBeenCalledTimes(1);
});
it("expired or incomplete work cannot be approved", async () => {
  const a = clientAgreement(),
    s = revision(a),
    store = new LocalStore();
  a.payment.captureDeadline = new Date(Date.now() - 1000).toISOString();
  await store.createAgreement(a);
  await expect(
    acceptSubmission(store, buyer, a.id, s.id, s.evidence!.artifactHash),
  ).rejects.toThrow();
});
it("live settlement is disabled even if the caller supplies a ready agreement", async () => {
  vi.stubEnv("LIVE_PAYMENTS_ENABLED", "false");
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const a = clientAgreement();
  a.mode = "live";
  await expect(paypal.createOrder(a, "test")).rejects.toThrow(/Live payments/);
  await expect(paypal.capture(a, "test")).rejects.toThrow(/Live payments/);
  expect(fetch).not.toHaveBeenCalled();
});
it("orders remain bound to the merchant in frozen terms", () => {
  vi.stubEnv("PAYPAL_MERCHANT_ID", "new-merchant");
  const a = clientAgreement();
  a.mode = "live";
  a.terms!.merchantId = "agreed-merchant";
  const unit = {
    reference_id: a.id,
    custom_id: a.id,
    amount: { currency_code: "USD", value: "180.00" },
    payee: { merchant_id: "agreed-merchant" },
  };
  const order = {
    id: a.payment.orderId,
    intent: "AUTHORIZE",
    purchase_units: [unit],
  };
  expect(validateOrder(a, order)).toEqual(unit);
  expect(() =>
    validateOrder(a, {
      ...order,
      purchase_units: [{ ...unit, payee: { merchant_id: "new-merchant" } }],
    }),
  ).toThrow();
});
it("onboarding requires confirmed receiving capability and auth/capture permission", () => {
  expect(
    onboardingComplete({
      payments_receivable: true,
      primary_email_confirmed: true,
    }),
  ).toBe(false);
  expect(
    onboardingComplete({
      payments_receivable: true,
      primary_email_confirmed: true,
      oauth_integrations: [
        {
          oauth_third_party: [
            {
              scopes: [
                "https://uri.paypal.com/services/payments/payment/authcapture",
              ],
            },
          ],
        },
      ],
    }),
  ).toBe(true);
});
it("demo and owner sessions coexist without crossing payment environments", async () => {
  vi.stubEnv("MONGODB_URI", "");
  const store = new LocalStore();
  const owner = await issueSession(store, {
    tenantId: "owner:test",
    kind: "owner",
    role: "seller",
  });
  const demo = await issueSession(store, {
    tenantId: "demo:test",
    kind: "demo",
    role: "seller",
  });
  const cookie = [owner.cookie.split(";")[0], demo.cookie.split(";")[0]].join(
    "; ",
  );
  expect(
    (
      await actor(
        new Request("https://app.example/api/me", { headers: { cookie } }),
        store,
      )
    )?.kind,
  ).toBe("owner");
  expect(
    (
      await actor(
        new Request("https://app.example/api/me", {
          headers: { cookie, "x-revisionpay-space": "demo" },
        }),
        store,
      )
    )?.kind,
  ).toBe("demo");
  const a = agreement();
  a.tenantId = "owner:test";
  a.mode = "sandbox";
  await store.createAgreement(a);
  await expect(
    allowed(store, { ...seller, tenantId: "owner:test" }, a.id),
  ).rejects.toThrow();
});
it("saved draft edits reject stale tabs and invalidate captures when the URL changes", async () => {
  const a = agreement();
  a.state = "DRAFT";
  a.digest = undefined;
  a.terms = undefined;
  a.termsVersion = "2";
  a.draftRevision = 0;
  const store = new LocalStore();
  await store.createAgreement(a);
  const data = {
    title: a.title,
    clientName: a.clientName,
    amountMinor: a.amountMinor,
    sourceUrl: "https://new.example/pricing",
    requirements: a.requirements,
  };
  const saved = await updateDraft(store, seller, a.id, data, 0);
  expect(saved.baseline).toBeUndefined();
  expect(saved.baselineStatus).toBe("QUEUED");
  await expect(updateDraft(store, seller, a.id, data, 0)).rejects.toThrow(
    /another tab/,
  );
});
it("requesting changes withdraws prior acceptance before capture starts", async () => {
  const a = clientAgreement(),
    s = revision(a),
    store = new LocalStore();
  await store.createAgreement(a);
  await acceptSubmission(store, buyer, a.id, s.id, s.evidence!.artifactHash);
  await hold(store, buyer, a.id, "The cancellation wording needs fixing.");
  const saved = (await store.getAgreement(a.id))!;
  expect(saved.manualAcceptanceId).toBeUndefined();
  expect(saved.changeRequest).toContain("wording");
  expect(() => assertCaptureEligible(saved)).toThrow();
});
it("a capture returning for an old draft URL cannot overwrite the edited draft", async () => {
  const a = agreement();
  a.state = "DRAFT";
  a.digest = undefined;
  a.terms = undefined;
  a.baseline = undefined;
  a.baselineStatus = "QUEUED";
  const store = new LocalStore();
  await store.createAgreement(a);
  const workflow = new Workflow(store, {
    capture: async (_, old) => {
      const { mutate } = await import("../apps/web/src/server/store");
      await mutate(store, a.id, (x) => {
        x.sourceUrl = "https://new.example/";
        x.baselineStatus = "QUEUED";
      });
      return fixtureEvidence(old, true);
    },
  });
  await workflow.advance(a.id);
  const saved = (await store.getAgreement(a.id))!;
  expect(saved.sourceUrl).toBe("https://new.example/");
  expect(saved.baseline).toBeUndefined();
  expect(saved.baselineStatus).toBe("QUEUED");
});
