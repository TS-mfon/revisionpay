import { afterEach, expect, it, vi } from "vitest";
import {
  hasPendingWork,
  MONEY_IN_FLIGHT,
  type Actor,
} from "../packages/domain/src/index";
import { LocalStore } from "../apps/web/src/server/store";
import { Workflow } from "../apps/web/src/server/workflow";
import { fixtureEvidence } from "../apps/web/src/server/evidence";
import { simulatedVerdict } from "../apps/web/src/server/genlayer";
import { demoGateway, paypal } from "../apps/web/src/server/paypal";
import {
  acceptSubmission,
  authorize,
  checkout,
  consent,
  create,
  freezeAgreement,
  hold,
  setVariant,
  submit,
} from "../apps/web/src/server/service";
import { agreement } from "./helpers";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it("runs a sandbox template through both roles, two revisions and one approved payment using provider test doubles", async () => {
  vi.useFakeTimers();
  vi.stubEnv("REVISIONPAY_MODE", "sandbox");
  vi.stubEnv("APP_URL", "https://revisionpay.example");
  vi.stubEnv("PAYPAL_MERCHANT_ID", "flow-test-merchant");
  vi.stubEnv("NEW_JOBS_PAUSED", "false");
  vi.stubEnv("SETTLEMENT_PAUSED", "false");
  const store = new LocalStore();
  const owner: Actor = {
    id: "flow-owner",
    tenantId: "owner:flow",
    kind: "owner",
    role: "seller",
  };
  const a = await create(store, owner, undefined, "pricing-trial");
  const client: Actor = {
    id: "flow-client",
    tenantId: a.tenantId,
    kind: "buyer",
    role: "buyer",
    agreementId: a.id,
  };
  const gateway = demoGateway();
  const capture = vi.fn(gateway.capture);
  const createOrder = vi
    .spyOn(paypal, "createOrder")
    .mockImplementation(gateway.createOrder);
  vi.spyOn(paypal, "authorize").mockImplementation(gateway.authorize);
  vi.spyOn(paypal, "readAuthorization").mockImplementation(
    gateway.readAuthorization,
  );
  const workflow = new Workflow(store, {
    capture: async (_, current, baseline) => fixtureEvidence(current, baseline),
    deploy: async () => "test-deployment",
    tx: async () => ({
      status: "FINALIZED",
      execution: "FINISHED_WITH_RETURN",
      recipient: "0x" + "1".repeat(40),
      raw: {},
    }),
    submit: async () => "test-verification",
    verdict: async () => {
      const current = (await store.getAgreement(a.id))!;
      return simulatedVerdict(current, current.submissions.at(-1)!);
    },
    gateway: () => ({ ...gateway, capture }),
  });
  async function advancePending() {
    for (
      let n = 0;
      n < 12 && hasPendingWork((await store.getAgreement(a.id))!);
      n++
    ) {
      await workflow.run(a.id);
      vi.advanceTimersByTime(9000);
    }
    const current = (await store.getAgreement(a.id))!;
    expect(hasPendingWork(current)).toBe(false);
    return current;
  }
  expect((await advancePending()).baselineStatus).toBe("READY");
  const frozen = await freezeAgreement(store, owner, a.id, 0);
  expect(frozen.invitationUrl).toContain("/invite#");
  expect(hasPendingWork(frozen.a)).toBe(false);
  await consent(store, client, a.id, frozen.a.digest!);
  await checkout(store, client, a.id);
  await checkout(store, client, a.id);
  expect(createOrder).toHaveBeenCalledTimes(1);
  expect(hasPendingWork((await store.getAgreement(a.id))!)).toBe(false);
  await authorize(store, client, a.id);
  expect((await store.getAgreement(a.id))!.payment.status).toBe("AUTHORIZED");
  expect(capture).not.toHaveBeenCalled();

  await setVariant(store, owner, a.id, "incomplete");
  await submit(store, owner, a.id, "First revision");
  const first = await advancePending();
  expect(first.submissions[0].verification.result?.verdict).toBe("REVISE");
  expect(capture).not.toHaveBeenCalled();
  await hold(store, client, a.id, "Please fix the annual commitment.");
  await setVariant(store, owner, a.id, "corrected");
  await submit(store, owner, a.id, "Corrected revision");
  const corrected = await advancePending();
  expect(corrected.submissions[1].verification.result?.verdict).toBe("PASS");
  expect(corrected.payment.status).toBe("AUTHORIZED");
  expect(capture).not.toHaveBeenCalled();

  const s = corrected.submissions[1];
  await acceptSubmission(store, client, a.id, s.id, s.evidence!.artifactHash);
  await Promise.allSettled([workflow.run(a.id), workflow.run(a.id)]);
  const paid = (await store.getAgreement(a.id))!;
  expect(paid.payment.status).toBe("PAID");
  expect(hasPendingWork(paid)).toBe(false);
  expect(capture).toHaveBeenCalledTimes(1);
  expect(
    paid.events.filter((e) => e.type === "CAPTURE_COMPLETED"),
  ).toHaveLength(1);
});

it("pending authorizations keep reconciling, without offering another payment action", () => {
  const a = agreement();
  a.state = "AWAITING_BUYER";
  a.payment.status = "AUTH_PENDING";
  expect(hasPendingWork(a)).toBe(true);
  expect(MONEY_IN_FLIGHT).toContain("AUTH_PENDING");
});

it("repeated progress attempts respect worker leases and saved retry times", async () => {
  vi.useFakeTimers();
  const store = new LocalStore();
  const a = agreement();
  await store.createAgreement(a);
  await store.ensureJob(a.id, new Date(Date.now() + 45000).toISOString());
  const workflow = new Workflow(store);
  const advance = vi.spyOn(workflow, "advance").mockResolvedValue(undefined);
  expect(await workflow.run(a.id)).toBe(false);
  vi.advanceTimersByTime(45000);
  await Promise.allSettled([
    workflow.run(a.id),
    workflow.run(a.id),
    workflow.run(a.id),
  ]);
  expect(advance).toHaveBeenCalledTimes(1);
});
