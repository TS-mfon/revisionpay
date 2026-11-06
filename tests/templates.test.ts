import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Actor } from "../packages/domain/src/index";
import {
  AGREEMENT_TEMPLATES,
  templatePage,
} from "../packages/domain/src/templates";
import { create, setVariant } from "../apps/web/src/server/service";
import { LocalStore, mutate } from "../apps/web/src/server/store";
import { captureEvidence } from "../apps/web/src/server/evidence";

const seller: Actor = {
  id: "template-tester",
  tenantId: "user:template-tester",
  role: "seller",
  kind: "seller",
};
beforeEach(() => {
  vi.stubEnv("REVISIONPAY_MODE", "sandbox");
  vi.stubEnv("APP_URL", "https://revisionpay.example");
  vi.stubEnv("NEW_JOBS_PAUSED", "false");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("creates five distinct sandbox drafts without a payment or recipient email", async () => {
  const store = new LocalStore();
  for (const template of AGREEMENT_TEMPLATES) {
    const a = await create(store, seller, undefined, template.id);
    expect(a).toMatchObject({
      state: "DRAFT",
      mode: "sandbox",
      testTemplateId: template.id,
      baselineStatus: "QUEUED",
      payment: { status: "NONE" },
    });
    expect(a.clientEmail).toBeUndefined();
    expect(a.sourceUrl).toBe("https://revisionpay.example/test-site/" + a.id);
    expect(a.invitation).toBeUndefined();
    expect(a.requirements).toHaveLength(3);
    expect(templatePage(template, "corrected")).not.toEqual(
      templatePage(template, "baseline"),
    );
  }
  const drafts = await store.listAgreements(seller.tenantId);
  expect(drafts).toHaveLength(5);
  expect(new Set(drafts.map((a) => a.title)).size).toBe(5);
  expect(new Set(drafts.map((a) => a.sourceUrl)).size).toBe(5);
});

it("blocks unknown, buyer-created and live test agreements", async () => {
  const store = new LocalStore();
  await expect(create(store, seller, undefined, "unknown")).rejects.toThrow(
    /available agreement templates/,
  );
  await expect(
    create(
      store,
      { ...seller, role: "buyer", kind: "buyer" },
      undefined,
      "pricing-trial",
    ),
  ).rejects.toThrow(/seller role/);
  vi.stubEnv("REVISIONPAY_MODE", "live");
  await expect(
    create(store, seller, undefined, "pricing-trial"),
  ).rejects.toThrow(/sandbox workspace/);
  expect(await store.listAgreements()).toHaveLength(0);
});

it("isolates test-page publishing and only permits it during an authorization", async () => {
  const store = new LocalStore();
  const a = await create(store, seller, undefined, "delivery-returns");
  await expect(setVariant(store, seller, a.id, "corrected")).rejects.toThrow(
    /Authorize/,
  );
  await mutate(store, a.id, (x) => {
    x.state = "ACTIVE";
    x.payment.status = "AUTHORIZED";
  });
  await expect(
    setVariant(
      store,
      { ...seller, tenantId: "another-user" },
      a.id,
      "corrected",
    ),
  ).rejects.toThrow(/not found/);
  await setVariant(store, seller, a.id, "incomplete");
  expect((await store.getAgreement(a.id))?.demoVariant).toBe("incomplete");
  await setVariant(store, seller, a.id, "corrected");
  expect((await store.getAgreement(a.id))?.demoVariant).toBe("corrected");
  await mutate(store, a.id, (x) => {
    x.payment.status = "CAPTURE_RESERVED";
  });
  await expect(setVariant(store, seller, a.id, "incomplete")).rejects.toThrow();
});

it("uses the signed capture service for test pages, never demo evidence", async () => {
  vi.stubEnv("CAPTURE_SECRET", "test-capture-secret");
  vi.stubEnv("CAPTURE_SERVICE_URL", "https://capture.example");
  const store = new LocalStore();
  const a = await create(store, seller, undefined, "webinar-signup");
  const fetch = vi.fn(async () =>
    Response.json(
      { error: "TEST_CAPTURE_FAILURE", message: "Collector unavailable" },
      { status: 502 },
    ),
  );
  vi.stubGlobal("fetch", fetch);
  await expect(captureEvidence(store, a)).rejects.toThrow(
    "Collector unavailable",
  );
  expect(fetch).toHaveBeenCalledWith(
    "https://capture.example/api/snapshot",
    expect.objectContaining({
      method: "POST",
      body: expect.stringContaining(a.sourceUrl),
    }),
  );
});
