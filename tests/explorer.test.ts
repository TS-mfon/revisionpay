import { randomUUID } from "node:crypto";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import type { Actor } from "../packages/domain/src/index";
import { DEFAULT_REQUIREMENTS } from "../packages/domain/src/fixtures";
import { LocalStore } from "../apps/web/src/server/store";
import { agreementActor } from "../apps/web/src/server/auth";
import { allowed, updateDraft } from "../apps/web/src/server/service";
import {
  postWork,
  listWork,
  workDetail,
  applyToWork,
  inviteFreelancer,
  respondToWork,
  closeWork,
  withdrawApplication,
} from "../apps/web/src/server/explorer";

const client: Actor = {
  id: "client",
  tenantId: "client-account",
  kind: "seller",
  role: "seller",
  name: "Client Team",
  email: "client@example.com",
};
const freelancer: Actor = {
  id: "freelancer",
  tenantId: "freelancer-account",
  kind: "seller",
  role: "seller",
  name: "Freelancer",
  email: "freelancer@example.com",
};
const other: Actor = {
  ...freelancer,
  id: "other",
  tenantId: "other-account",
  email: "other@example.com",
};
const brief = {
  title: "Clarify our pricing page",
  description:
    "Visitors need clear information about the trial, monthly price, and cancellation terms.",
  sourceUrl: "https://example.com/pricing",
  amountMinor: 18000,
  requirements: structuredClone(DEFAULT_REQUIREMENTS),
  publishConsent: true,
};
beforeEach(() => {
  vi.stubEnv("REVISIONPAY_MODE", "sandbox");
  vi.stubEnv("NEW_JOBS_PAUSED", "false");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
async function setup() {
  const store = new LocalStore();
  const post = await postWork(store, client, brief);
  await applyToWork(store, freelancer, post.id, {
    message: "I will implement and check each pricing-page requirement.",
  });
  const application = (await workDetail(store, client, post.id))
    .applications![0];
  return { store, post, application };
}
it("takes an application through invitation and acceptance into one private, unpaid agreement", async () => {
  const { store, post, application } = await setup();
  await inviteFreelancer(store, client, post.id, application.id);
  const [a, b] = await Promise.all([
    respondToWork(store, freelancer, post.id, true),
    respondToWork(store, freelancer, post.id, true),
  ]);
  expect(a!.id).toBe(b!.id);
  expect(await store.listAgreements()).toHaveLength(1);
  expect(a).toMatchObject({
    tenantId: freelancer.tenantId,
    clientTenantId: client.tenantId,
    workPostId: post.id,
    state: "DRAFT",
    mode: "sandbox",
    payment: { status: "NONE" },
    consents: [],
  });
  expect(a!.invitation).toBeUndefined();
  const clientActor = await agreementActor(store, client, a!.id);
  expect(clientActor.role).toBe("buyer");
  await expect(
    allowed(store, clientActor, a!.id, "buyer"),
  ).resolves.toBeDefined();
  await expect(allowed(store, clientActor, a!.id, "seller")).rejects.toThrow();
  const intruder = await agreementActor(
    store,
    { ...other, email: client.email },
    a!.id,
  );
  await expect(allowed(store, intruder, a!.id)).rejects.toThrow();
  expect((await workDetail(store, client, post.id)).agreementRole).toBe(
    "buyer",
  );
  expect((await workDetail(store, freelancer, post.id)).agreementRole).toBe(
    "seller",
  );
});
it("public discovery never exposes proposals, contact emails, account IDs or private agreement links", async () => {
  const { store, post } = await setup();
  const anonymous = await workDetail(store, undefined, post.id);
  expect(anonymous.applications).toBeUndefined();
  expect(anonymous.application).toBeUndefined();
  const listed = await listWork(store, undefined, new URLSearchParams());
  const json = JSON.stringify([anonymous, listed]);
  for (const privateValue of [
    client.email!,
    freelancer.email!,
    client.tenantId,
    freelancer.tenantId,
    "I will implement",
  ])
    expect(json).not.toContain(privateValue);
  const applicant = await workDetail(store, freelancer, post.id);
  expect(applicant.application?.message).toContain("I will implement");
  expect(applicant.applications).toBeUndefined();
  expect((await workDetail(store, other, post.id)).application).toBeUndefined();
});
it("rejects self-applications, anonymous personal lists and demo publications", async () => {
  const { store, post } = await setup();
  await expect(
    applyToWork(store, client, post.id, {
      message: "I want to apply to my own public job.",
    }),
  ).rejects.toThrow(/own work/);
  await expect(
    listWork(store, undefined, new URLSearchParams("view=posts")),
  ).rejects.toThrow(/Sign in/);
  await expect(
    postWork(store, { ...client, kind: "demo" }, brief),
  ).rejects.toThrow(/Sign in/);
  await expect(
    postWork(store, client, { ...brief, publishConsent: false }),
  ).rejects.toThrow();
});
it("only the posting client can invite and only the chosen freelancer can accept", async () => {
  const { store, post, application } = await setup();
  await expect(
    inviteFreelancer(store, other, post.id, application.id),
  ).rejects.toThrow(/Only the client/);
  await inviteFreelancer(store, client, post.id, application.id);
  await expect(respondToWork(store, other, post.id, true)).rejects.toThrow(
    /Only the invited/,
  );
  await expect(closeWork(store, other, post.id)).rejects.toThrow(
    /Only the client/,
  );
  expect(await store.listAgreements()).toHaveLength(0);
});
it("competing invitations reserve one freelancer and duplicate applications do not multiply", async () => {
  const { store, post, application } = await setup();
  await applyToWork(store, freelancer, post.id, {
    message: "Retrying the same application after a lost response.",
  });
  await applyToWork(store, other, post.id, {
    message: "I can implement all three changes on your public page.",
  });
  const applications = (await workDetail(store, client, post.id)).applications!;
  expect(applications).toHaveLength(2);
  const results = await Promise.allSettled([
    inviteFreelancer(store, client, post.id, application.id),
    inviteFreelancer(store, client, post.id, applications[1].id),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(
    (await store.getWorkPost(post.id))!.applications.filter(
      (a) => a.status === "INVITED",
    ),
  ).toHaveLength(1);
});
it("declining reopens the listing and closing prevents a pending invitation from creating an agreement", async () => {
  const { store, post, application } = await setup();
  await inviteFreelancer(store, client, post.id, application.id);
  await respondToWork(store, freelancer, post.id, false);
  expect((await store.getWorkPost(post.id))!.status).toBe("OPEN");
  await applyToWork(store, other, post.id, {
    message: "I can complete these requirements for the fixed fee.",
  });
  const next = (await workDetail(store, other, post.id)).application!;
  await inviteFreelancer(store, client, post.id, next.id);
  await closeWork(store, client, post.id);
  await expect(respondToWork(store, other, post.id, true)).rejects.toThrow(
    /no longer/,
  );
  expect(await store.listAgreements()).toHaveLength(0);
});
it("recovers an accepted invitation after agreement creation fails without creating duplicates", async () => {
  const { store, post, application } = await setup();
  await inviteFreelancer(store, client, post.id, application.id);
  vi.spyOn(store, "createAgreement").mockRejectedValueOnce(
    new Error("temporary write failure"),
  );
  await expect(respondToWork(store, freelancer, post.id, true)).rejects.toThrow(
    /temporary/,
  );
  expect(
    (await workDetail(store, freelancer, post.id)).preparingAgreement,
  ).toBe(true);
  const a = await respondToWork(store, freelancer, post.id, true);
  expect(a!.id).toBe((await store.getWorkPost(post.id))!.agreementId);
  expect(await store.listAgreements()).toHaveLength(1);
});
it("withdrawn applicants cannot be invited, and assigned clients cannot be replaced by draft edits", async () => {
  const { store, post, application } = await setup();
  await withdrawApplication(store, freelancer, post.id);
  await expect(
    inviteFreelancer(store, client, post.id, application.id),
  ).rejects.toThrow(/current application/);
  await applyToWork(store, other, post.id, {
    message: "I can deliver this pricing-page revision for the stated fee.",
  });
  const next = (await workDetail(store, other, post.id)).application!;
  await inviteFreelancer(store, client, post.id, next.id);
  const a = (await respondToWork(store, other, post.id, true))!;
  await expect(
    updateDraft(
      store,
      other,
      a.id,
      {
        title: a.title,
        clientName: "Different client",
        clientEmail: "different@example.com",
        amountMinor: a.amountMinor,
        sourceUrl: a.sourceUrl,
        requirements: a.requirements,
      },
      0,
    ),
  ).rejects.toThrow(/client is fixed/);
});
it("paginates all open work and keeps private histories limited to the signed-in account", async () => {
  const { store, post } = await setup();
  const original = (await store.getWorkPost(post.id))!;
  for (let i = 0; i < 22; i++)
    await store.createWorkPost({
      ...original,
      id: randomUUID(),
      title: "Searchable work " + i,
      applications: [],
      clientTenantId: other.tenantId,
    });
  const page1 = await listWork(
    store,
    undefined,
    new URLSearchParams("q=Searchable"),
  );
  const page2 = await listWork(
    store,
    undefined,
    new URLSearchParams("q=Searchable&page=2"),
  );
  expect(page1.posts).toHaveLength(20);
  expect(page1.hasMore).toBe(true);
  expect(page2.posts).toHaveLength(2);
  expect(page2.hasMore).toBe(false);
  expect(new Set([...page1.posts, ...page2.posts].map((p) => p.id)).size).toBe(
    22,
  );
  expect(
    (await listWork(store, client, new URLSearchParams("view=posts"))).posts,
  ).toHaveLength(1);
});
