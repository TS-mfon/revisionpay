import { afterEach, beforeEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({
  getSession: vi.fn(),
  listUserAccounts: vi.fn(),
}));
vi.mock("../apps/web/node_modules/better-auth", () => ({
  betterAuth: () => ({ api }),
}));
vi.mock("../apps/web/src/server/store", async (original) => ({
  ...(await original<typeof import("../apps/web/src/server/store")>()),
  mongoClient: async () => ({ db: () => ({}) }),
}));
import {
  actor,
  issueSession,
  linkOwnerGoogle,
} from "../apps/web/src/server/auth";
import { LocalStore } from "../apps/web/src/server/store";
import { agreement } from "./helpers";
import { configuration } from "../apps/web/src/server/config";
beforeEach(() => {
  api.getSession.mockReset();
  api.listUserAccounts.mockReset();
  vi.stubEnv("AUTH_SECRET", "test-auth-secret");
  vi.stubEnv("MONGODB_URI", "mongodb://unused");
  vi.stubEnv("GOOGLE_CLIENT_ID", "google-client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "google-secret");
  vi.stubEnv("SELLER_GITHUB_ID", "owner123");
  vi.stubEnv("GITHUB_CLIENT_ID", "");
  api.getSession.mockResolvedValue({
    user: {
      id: "google-user",
      email: "owner@example.com",
      emailVerified: true,
      name: "Owner",
    },
  });
  api.listUserAccounts.mockResolvedValue([{ providerId: "google" }]);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
async function setup() {
  const store = new LocalStore();
  const owner = await issueSession(store, {
    kind: "owner",
    role: "seller",
    tenantId: "owner:owner123",
  });
  const request = new Request("https://app.example/api/profile/link-google", {
    headers: { cookie: owner.cookie.split(";")[0] },
  });
  return { store, request };
}
it("requires both the existing owner session and a verified Google account to link", async () => {
  const { store, request } = await setup();
  await expect(
    linkOwnerGoogle(new Request(request.url), store),
  ).rejects.toThrow(/private owner/);
  api.getSession.mockResolvedValueOnce({
    user: { id: "google-user", emailVerified: false },
  });
  await expect(linkOwnerGoogle(request, store)).rejects.toThrow(
    /Sign in with Google/,
  );
  api.listUserAccounts.mockResolvedValueOnce([{ providerId: "github" }]);
  await expect(linkOwnerGoogle(request, store)).rejects.toThrow(
    /Sign in with Google/,
  );
  expect(await store.getValue("owner-link:google-user")).toBeUndefined();
});
it("Google returns to the linked owner workspace after the private cookie is gone", async () => {
  const { store, request } = await setup();
  expect(configuration().googleClientId).toBe("google-client");
  expect(configuration().googleSecret).toBe("google-secret");
  expect(configuration().mongoUri).toBe("mongodb://unused");
  await linkOwnerGoogle(request, store);
  expect(
    await actor(new Request("https://app.example/api/me"), store),
  ).toMatchObject({
    kind: "owner",
    tenantId: "owner:owner123",
    email: "owner@example.com",
  });
  api.getSession.mockResolvedValueOnce({
    user: { id: "other-user", email: "owner@example.com", emailVerified: true },
  });
  expect(
    await actor(new Request("https://app.example/api/me"), store),
  ).toMatchObject({ kind: "seller", tenantId: "user:other-user" });
});
it("does not hide an existing Google workspace by remapping its agreements", async () => {
  const { store, request } = await setup();
  const a = agreement();
  a.tenantId = "user:google-user";
  await store.createAgreement(a);
  await expect(linkOwnerGoogle(request, store)).rejects.toThrow(
    /already has a workspace/,
  );
  expect(await store.getValue("owner-link:google-user")).toBeUndefined();
});
