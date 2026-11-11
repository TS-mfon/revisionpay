import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { publicAgreement } from "../packages/domain/src/index";
import { sha256 } from "../packages/domain/src/crypto";
import { LocalStore, mutate } from "../apps/web/src/server/store";
import { invite } from "../apps/web/src/server/service";
import {
  invitationUrl,
  invitationUsable,
} from "../apps/web/src/server/invitations";
import { agreement, seller, buyer } from "./helpers";

beforeEach(() => vi.stubEnv("AUTH_SECRET", "test-invitation-secret"));
afterEach(() => vi.unstubAllEnvs());
const owner = { ...seller, kind: "owner" as const };
async function setup() {
  const store = new LocalStore(),
    a = agreement();
  a.mode = "sandbox";
  a.payment.mode = "sandbox";
  await store.createAgreement(a);
  return { store, a };
}
it("recovers the same link after reload and redemption without storing a bearer token", async () => {
  const { store, a } = await setup();
  const first = await invite(store, owner, a.id);
  const raw = first.invitationUrl!.split("#")[1];
  await mutate(store, a.id, (x) => {
    x.invitation!.redeemedAt = new Date().toISOString();
  });
  const saved = (await store.getAgreement(a.id))!;
  expect(invitationUrl(saved)).toBe(first.invitationUrl);
  expect(
    (await invite(store, { ...owner, id: "new-owner-session" }, a.id))
      .invitationUrl,
  ).toBe(first.invitationUrl);
  expect(invitationUsable(saved, raw)).toBe(true);
  expect(JSON.stringify(saved)).not.toContain(raw);
  expect(JSON.stringify(publicAgreement(saved))).not.toContain(
    saved.invitation!.nonce,
  );
  expect(JSON.stringify(publicAgreement(saved))).not.toContain(
    saved.invitation!.tokenHash,
  );
});
it("only the creator can retrieve or replace a link, including for a paid receipt", async () => {
  const { store, a } = await setup();
  await mutate(store, a.id, (x) => {
    x.state = "CLOSED";
    x.payment.status = "PAID";
  });
  await expect(
    invite(store, { ...buyer, kind: "buyer", agreementId: a.id }, a.id),
  ).rejects.toThrow();
  await expect(
    invite(store, { ...owner, tenantId: "other" }, a.id),
  ).rejects.toThrow();
  const before = (await store.getAgreement(a.id))!.payment;
  const first = await invite(store, owner, a.id);
  const second = await invite(store, owner, a.id, true);
  const saved = (await store.getAgreement(a.id))!;
  expect(second.invitationUrl).not.toBe(first.invitationUrl);
  expect(invitationUsable(saved, first.invitationUrl!.split("#")[1])).toBe(
    false,
  );
  expect(invitationUsable(saved, second.invitationUrl!.split("#")[1])).toBe(
    true,
  );
  expect(saved.payment).toEqual(before);
});
it("preserves expiry and single-use behavior for legacy links until the creator upgrades them", async () => {
  const a = agreement();
  a.state = "AWAITING_BUYER";
  a.invitation = {
    tokenHash: sha256("old-link"),
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  };
  expect(invitationUsable(a, "old-link")).toBe(true);
  a.invitation.redeemedAt = new Date().toISOString();
  expect(invitationUsable(a, "old-link")).toBe(false);
  a.invitation.redeemedAt = undefined;
  a.invitation.expiresAt = new Date(Date.now() - 1000).toISOString();
  expect(invitationUsable(a, "old-link")).toBe(false);
});
it("concurrent copy requests converge on one saved invitation", async () => {
  const { store, a } = await setup();
  const links = await Promise.all([
    invite(store, owner, a.id),
    invite(store, owner, a.id),
  ]);
  expect(links[0].invitationUrl).toBe(links[1].invitationUrl);
});
