import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocalStore, mutate } from "../apps/web/src/server/store";
import { Workflow } from "../apps/web/src/server/workflow";
import { demoGateway } from "../apps/web/src/server/paypal";
import { fixtureEvidence } from "../apps/web/src/server/evidence";
import {
  acceptSubmission,
  allowed,
  cancel,
  hold,
  submit,
} from "../apps/web/src/server/service";
import { agreement, buyer, revision, seller } from "./helpers";

beforeEach(() => {
  vi.stubEnv("SETTLEMENT_PAUSED", "false");
  vi.stubEnv("NEW_JOBS_PAUSED", "false");
});
function setup() {
  const store = new LocalStore();
  const capture = vi.fn(demoGateway().capture);
  const gateway = { ...demoGateway(), capture };
  const workflow = new Workflow(store, { gateway: () => gateway });
  return { store, capture, gateway, workflow };
}
describe("durable payment workflow", () => {
  it("leaves REVISE uncharged, then collects the corrected revision exactly once", async () => {
    const { store, workflow, capture } = setup();
    const a = agreement();
    revision(a, "incomplete");
    await store.createAgreement(a);
    await workflow.advance(a.id);
    expect(capture).not.toHaveBeenCalled();
    await mutate(store, a.id, (x) => {
      x.demoVariant = "corrected";
    });
    await submit(store, seller, a.id, "Removed annual commitment");
    for (let n = 0; n < 7; n++) await workflow.advance(a.id);
    const saved = (await store.getAgreement(a.id))!;
    expect(saved.payment.status).toBe("PAID");
    expect(
      saved.submissions.map((s) => s.verification.result?.verdict),
    ).toEqual(["REVISE", "PASS"]);
    expect(capture).toHaveBeenCalledTimes(1);
  });
  it("reserves a single capture across competing workers", async () => {
    const { store, workflow, capture } = setup();
    const a = agreement();
    revision(a);
    await store.createAgreement(a);
    await Promise.allSettled([
      workflow.advance(a.id),
      workflow.advance(a.id),
      workflow.advance(a.id),
    ]);
    expect(capture).toHaveBeenCalledTimes(1);
    expect((await store.getAgreement(a.id))!.payment.status).toBe("PAID");
  });
  it("reconciles an ambiguous capture without issuing another charge", async () => {
    const { store, workflow, capture, gateway } = setup();
    const a = agreement();
    revision(a);
    await store.createAgreement(a);
    capture.mockRejectedValueOnce(
      new Error("response lost after provider accepted capture"),
    );
    await workflow.advance(a.id);
    expect((await store.getAgreement(a.id))!.payment.status).toBe("UNKNOWN");
    await workflow.advance(a.id);
    gateway.findCapture = async () => ({
      id: "confirmed-capture",
      status: "COMPLETED",
    });
    await workflow.advance(a.id);
    await workflow.advance(a.id);
    expect((await store.getAgreement(a.id))!.payment.status).toBe("PAID");
    expect(capture).toHaveBeenCalledTimes(1);
  });
  it("keeps pending capture pending until PayPal confirms completion", async () => {
    const { store, workflow, gateway, capture } = setup();
    const a = agreement();
    revision(a);
    await store.createAgreement(a);
    capture.mockResolvedValueOnce({ id: "pending-capture", status: "PENDING" });
    gateway.findCapture = async () => ({
      id: "pending-capture",
      status: "PENDING",
    });
    await workflow.advance(a.id);
    await workflow.advance(a.id);
    expect((await store.getAgreement(a.id))!.payment.status).toBe("PENDING");
    await expect(cancel(store, buyer, a.id)).rejects.toThrow();
    gateway.findCapture = async () => ({
      id: "pending-capture",
      status: "COMPLETED",
    });
    await workflow.advance(a.id);
    expect((await store.getAgreement(a.id))!.payment.status).toBe("PAID");
    expect(capture).toHaveBeenCalledTimes(1);
  });
  it("holds collection if the page changes after final verification", async () => {
    const { store, workflow, capture } = setup();
    const a = agreement();
    revision(a);
    a.demoVariant = "changed";
    await store.createAgreement(a);
    await workflow.advance(a.id);
    expect((await store.getAgreement(a.id))!.holdReason).toBe(
      "CONTENT_CHANGED",
    );
    expect(capture).not.toHaveBeenCalled();
  });
  it("honors a buyer hold arriving during the fresh capture", async () => {
    const { store, capture, gateway } = setup();
    const a = agreement();
    revision(a);
    await store.createAgreement(a);
    const workflow = new Workflow(store, {
      gateway: () => gateway,
      capture: async (_, current) => {
        await hold(store, buyer, a.id);
        return fixtureEvidence(current);
      },
    });
    await expect(workflow.advance(a.id)).rejects.toThrow();
    expect(capture).not.toHaveBeenCalled();
    expect((await store.getAgreement(a.id))!.state).toBe("REVIEW_HOLD");
  });
  it("voids an expired authorization without collecting", async () => {
    const { store, workflow, capture, gateway } = setup();
    const a = agreement();
    revision(a);
    a.payment.captureDeadline = new Date(Date.now() - 1000).toISOString();
    await store.createAgreement(a);
    gateway.void = vi.fn(async () => {});
    await workflow.advance(a.id);
    expect(gateway.void).toHaveBeenCalledTimes(1);
    expect(capture).not.toHaveBeenCalled();
    expect((await store.getAgreement(a.id))!.payment.status).toBe("VOIDED");
  });
  it("supports explicit buyer acceptance when the verifier failed", async () => {
    const { store, workflow, capture } = setup();
    const a = agreement();
    const s = revision(a, "incomplete");
    a.contract = { state: "FAILED", error: "network unavailable" };
    s.verification.status = "FAILED";
    await store.createAgreement(a);
    await acceptSubmission(store, buyer, a.id, s.id, s.evidence!.artifactHash);
    await workflow.advance(a.id);
    expect(capture).toHaveBeenCalledTimes(1);
    const saved = (await store.getAgreement(a.id))!;
    expect(saved.payment.command?.reason).toBe("BUYER_ACCEPTED");
    expect(saved.submissions[0].verification.result?.verdict).toBe("REVISE");
  });
  it("keeps authorization expiry scheduled after deployment consensus fails", async () => {
    const { store, workflow, capture } = setup();
    const a = agreement();
    a.mode = "sandbox";
    a.contract = { state: "SUBMITTED", txId: "test-deployment" };
    workflow.services.tx = async () => ({
      status: "UNDETERMINED",
      execution: "",
      recipient: "",
      raw: {},
    });
    await store.createAgreement(a);
    expect(await workflow.advance(a.id)).toBe(a.payment.captureDeadline);
    expect((await store.getAgreement(a.id))!.contract.state).toBe("FAILED");
    expect(capture).not.toHaveBeenCalled();
  });
  it("isolates tenants and enforces seller/buyer roles", async () => {
    const { store } = setup();
    const a = agreement();
    await store.createAgreement(a);
    await expect(
      allowed(store, { ...seller, tenantId: "other" }, a.id),
    ).rejects.toThrow();
    await expect(submit(store, buyer, a.id, "")).rejects.toThrow();
    await expect(hold(store, seller, a.id)).rejects.toThrow();
  });
});
