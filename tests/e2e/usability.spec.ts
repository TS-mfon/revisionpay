import {
  expect,
  test,
  type BrowserContext,
  type TestInfo,
} from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
import path from "node:path";

test.beforeEach(() => {
  test.skip(
    Boolean(process.env.PLAYWRIGHT_BASE_URL),
    "Local fixtures only; never seed hosted identities or payment records.",
  );
});

async function seed(
  context: BrowserContext,
  baseURL: string,
  info: TestInfo,
  invited = false,
) {
  const { LocalStore } = await import("../../apps/web/src/server/store");
  const { issueSession } = await import("../../apps/web/src/server/auth");
  const { draft, freeze } = await import("../../apps/web/src/server/model");
  const { fixtureEvidence } = await import(
    "../../apps/web/src/server/evidence"
  );
  const { DEFAULT_REQUIREMENTS } = await import(
    "../../packages/domain/src/fixtures"
  );
  const { sha256 } = await import("../../packages/domain/src/crypto");
  const store = new LocalStore(
    path.resolve(process.cwd(), info.config.metadata.localDataPath),
  );
  const tenantId = "owner:usability-" + randomUUID();
  const a = draft(
    {
      title: "My first website agreement",
      clientName: "Sample Client",
      amountMinor: 18000,
      sourceUrl: baseURL,
      requirements: structuredClone(DEFAULT_REQUIREMENTS),
    },
    tenantId,
    "sandbox",
  );
  a.termsVersion = "2";
  a.testTemplateId = "pricing-trial";
  a.sourceUrl = baseURL + "/test-site/" + a.id;
  a.baseline = fixtureEvidence(a, true);
  a.baselineStatus = "READY";
  const token = randomBytes(32).toString("base64url");
  if (invited) {
    freeze(a);
    a.invitation = {
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    };
  }
  await store.createAgreement(a);
  const owner = await issueSession(store, {
    tenantId,
    kind: "owner",
    role: "seller",
  });
  await context.addCookies([
    {
      name: "rp_session",
      value: owner.cookie.split(";")[0].split("=")[1],
      url: baseURL,
    },
  ]);
  return { store, a, token };
}

test("a new freelancer sees payment setup before sharing and returns to the same draft", async ({
  page,
  context,
  baseURL,
}, info) => {
  const { a, store } = await seed(context, baseURL!, info);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/agreements/" + a.id + "?view=freelancer");
  await expect(
    page.getByRole("region", { name: "Agreement progress" }),
  ).toContainText("freelancer");
  await expect(
    page.getByRole("button", { name: "Create client link", exact: true }),
  ).toBeDisabled();
  await page.getByRole("link", { name: "Connect PayPal and return" }).click();
  await expect(
    page.getByText("Your agreement is saved while you set up payments."),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Back to your agreement", exact: false })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: a.title, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("No email will be sent automatically.", { exact: false }),
  ).toBeVisible();
  expect((await store.getAgreement(a.id))!.invitation).toBeUndefined();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/first-agreement-mobile.png",
    fullPage: true,
  });
});

test("a seller waiting for email confirmation gets sandbox instructions and can recheck without losing their draft", async ({
  page,
  context,
  baseURL,
}, info) => {
  const { a, store } = await seed(context, baseURL!, info);
  // The local server runs in demo mode; merchantStatus uses the live namespace
  // there. These isolated fixtures never contact PayPal or the hosted database.
  const key = "merchant:live:" + a.tenantId;
  const pending = {
    tenantId: a.tenantId,
    environment: "sandbox",
    trackingId: "local-email-test",
    status: "PENDING",
    checks: {
      emailConfirmed: false,
      permissionsGranted: true,
      paymentsReceivable: true,
    },
  };
  await store.putValue(key, pending);
  let confirmed = false;
  let refreshes = 0;
  await page.route("**/api/merchant/refresh", async (route) => {
    refreshes++;
    const merchant = confirmed
      ? {
          ...pending,
          status: "READY",
          checks: { ...pending.checks, emailConfirmed: true },
        }
      : pending;
    await store.putValue(key, merchant);
    await route.fulfill({ json: { merchant } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const returnTo = "/agreements/" + a.id + "?view=freelancer";
  await page.goto(
    "/settings?paypal=connected&returnTo=" + encodeURIComponent(returnTo),
  );
  await expect.poll(() => refreshes).toBe(1);
  await expect(
    page.getByText("Confirm your PayPal email", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Sandbox Notifications" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Sandbox Notifications" }),
  ).toHaveAttribute(
    "href",
    "https://developer.paypal.com/dashboard/notifications",
  );
  await expect(
    page.getByText("Choose or create a", { exact: false }),
  ).toContainText("Business");
  await expect(
    page.getByText("Your agreement is saved while you set up payments."),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  confirmed = true;
  await page.getByRole("button", { name: "Check connection" }).click();
  await expect(
    page.getByText("PayPal is connected. Your agreement is ready to continue."),
  ).toBeVisible();
  await expect(
    page.getByText("Confirm your PayPal email", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("link", { name: "Back to your agreement", exact: false })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: a.title, exact: true }),
  ).toBeVisible();
  expect((await store.getAgreement(a.id))!.payment.status).toBe("NONE");
  expect((await store.getAgreement(a.id))!.invitation).toBeUndefined();
});

test("testing a client invitation in the same browser preserves both roles and allows client sign-out", async ({
  page,
  context,
  baseURL,
}, info) => {
  const { a, store } = await seed(context, baseURL!, info, true);
  await page.goto("/agreements/" + a.id + "?view=freelancer");
  await page
    .getByRole("button", { name: "Create a fresh invitation link" })
    .click();
  await expect(
    page.getByRole("region", { name: "Client invitation" }),
  ).toContainText("No email has been sent.");
  await page.getByRole("link", { name: "Open client view to test" }).click();
  await expect(
    page.getByRole("region", { name: "Agreement progress" }),
  ).toContainText("You’re viewing as the client");
  await expect(
    page.getByRole("button", { name: "Authorize $180 with PayPal" }),
  ).toBeDisabled();
  await page
    .getByText("Get the PayPal test account you need", { exact: true })
    .click();
  await expect(
    page.getByText("Choose or create a", { exact: false }),
  ).toContainText("Personal");
  await page.getByRole("link", { name: "Switch to freelancer view" }).click();
  await expect(
    page.getByRole("region", { name: "Agreement progress" }),
  ).toContainText("You’re viewing as the freelancer");
  await expect(
    page.getByRole("button", { name: "Create a fresh invitation link" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Your client has opened the invitation.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Switch to client view" }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(baseURL + "/");
  expect(
    (await context.cookies()).some((c) => c.name === "rp_buyer_" + a.id),
  ).toBe(false);
  expect(
    (await (await context.request.get(baseURL + "/api/me")).json()).actor.role,
  ).toBe("seller");
  const saved = (await store.getAgreement(a.id))!;
  expect(saved.payment.status).toBe("NONE");
  expect(saved.consents).toHaveLength(0);
});

test("a failed workspace request offers recovery instead of an endless spinner", async ({
  page,
  context,
  baseURL,
}, info) => {
  const { a } = await seed(context, baseURL!, info);
  let serviceAvailable = false;
  await page.route("**/api/agreements", (route) =>
    serviceAvailable
      ? route.continue()
      : route.fulfill({
          status: 503,
          json: { message: "Temporarily unavailable" },
        }),
  );
  await page.goto("/workspace");
  await expect(
    page.getByRole("button", { name: "Try again", exact: true }),
  ).toBeVisible();
  serviceAvailable = true;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("link", { name: new RegExp(a.title) }),
  ).toBeVisible();
});

test("an open agreement advances pending work and leads to the next role after provider updates", async ({
  page,
  context,
  request,
  baseURL,
}, info) => {
  const { a, store, token } = await seed(context, baseURL!, info, true);
  const { mutate } = await import("../../apps/web/src/server/store");
  const { applyAuthorization } = await import(
    "../../apps/web/src/server/workflow"
  );
  const { revision } = await import("../helpers");
  const apiPath = "/api/agreements/" + a.id;
  expect(
    (
      await request.post(apiPath + "/progress", {
        data: {},
        headers: { Origin: baseURL! },
      })
    ).status(),
  ).toBe(401);
  await page.goto("/invite#" + token);
  await expect(
    page.getByRole("region", { name: "Agreement progress" }),
  ).toContainText("client");
  await page.request.post(apiPath + "/consent", {
    data: { digest: a.digest },
    headers: { Origin: baseURL! },
  });
  // Local provider fixtures exercise the real screen/route handoffs. No test
  // writes to a hosted database or authorizes a payment with PayPal.
  await mutate(store, a.id, (current) =>
    applyAuthorization(current, {
      id: "test-authorization",
      status: "CREATED",
      at: new Date().toISOString(),
      payerId: "test-client",
    }),
  );
  await page
    .getByRole("link", { name: "Continue as freelancer", exact: false })
    .click();
  await expect(
    page.getByRole("region", { name: "Agreement progress" }),
  ).toContainText("freelancer");
  let progressRequests = 0;
  page.on("request", (req) => {
    if (req.url().endsWith(apiPath + "/progress") && req.method() === "POST")
      progressRequests++;
  });
  await store.ensureJob(a.id, new Date(Date.now() + 3600000).toISOString());
  await mutate(store, a.id, (current) => {
    const s = revision(current, "corrected", false);
    s.state = "CAPTURING";
    s.evidence = undefined;
  });
  await expect
    .poll(() => progressRequests, { timeout: 20000 })
    .toBeGreaterThan(0);
  // Progress must not bypass the future job time and run provider calls.
  expect((await store.getAgreement(a.id))!.submissions[0].state).toBe(
    "CAPTURING",
  );
  await mutate(store, a.id, (current) => {
    current.submissions = [];
    current.contract = { state: "READY", address: "0x" + "1".repeat(40) };
    revision(current, "corrected");
  });
  await page
    .getByRole("link", { name: "Continue as client", exact: false })
    .click();
  await expect(
    page.getByRole("button", { name: "Approve and pay $180", exact: false }),
  ).toBeVisible();
  const saved = (await store.getAgreement(a.id))!;
  expect(saved.payment.status).toBe("AUTHORIZED");
  expect(saved.manualAcceptanceId).toBeUndefined();
});
