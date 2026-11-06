import { expect, test } from "@playwright/test";

test("guided revision requires client approval and produces one receipt", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Get paid on approval/ }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/landing-desktop.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Try the guided demo" }).click();
  await page.getByRole("button", { name: "Start guided demo" }).click();
  await expect(
    page.getByRole("heading", { name: "Northstar pricing page revision" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue to client review" }).click();
  await expect(
    page.getByRole("button", { name: "Simulate authorization", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", { name: /I agree to these requirements/ })
    .check();
  await page
    .getByRole("button", { name: "Simulate authorization", exact: true })
    .click();
  await expect(
    page.getByText("Authorized · not charged", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Submit first revision" }).click();
  await expect(page.getByText("Needs a change", { exact: true })).toBeVisible({
    timeout: 40000,
  });
  await expect(
    page.getByText("Authorized · not charged", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/revision-requested.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Request changes", exact: true })
    .click();
  await page.getByRole("button", { name: "Send change request" }).click();
  await page.getByRole("button", { name: "Submit corrected page" }).click();
  await expect(page.getByText("Check met", { exact: true })).toHaveCount(3, {
    timeout: 40000,
  });
  await expect(
    page.getByText("Authorized · not charged", { exact: true }),
  ).toBeVisible();
  const id = new URL(page.url()).pathname.split("/").at(-1)!;
  const read = () =>
    page.request.get("/api/agreements/" + id, {
      headers: { "X-RevisionPay-Space": "demo" },
    });
  expect((await (await read()).json()).agreement.payment.status).toBe(
    "AUTHORIZED",
  );
  await page
    .getByRole("button", { name: "Simulate approval and payment" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Payment confirmed." }),
  ).toBeVisible({ timeout: 40000 });
  const record = (await (await read()).json()).agreement;
  expect(record.payment.status).toBe("PAID");
  expect(
    record.events.filter((e: any) => e.type === "CAPTURE_COMPLETED"),
  ).toHaveLength(1);
  expect(
    record.submissions.map((s: any) => s.verification.result.verdict),
  ).toEqual(["REVISE", "PASS"]);
  expect(record.terms.settlementPolicy).toBe("BUYER_APPROVAL_REQUIRED");
  await page.screenshot({
    path: "test-results/receipt-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/receipt-mobile.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Real workspace", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A clear agreement starts here." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Demo", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Continue your example" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("demo identities cannot access other tenants or the real workspace", async ({
  request,
  browser,
  baseURL,
}) => {
  expect(
    (
      await request.post("/api/demo", {
        data: {},
        headers: { Origin: "https://unrelated.example" },
      })
    ).status(),
  ).toBe(403);
  const first = await browser.newContext(),
    second = await browser.newContext();
  try {
    const created = await first.request.post(baseURL + "/api/demo", {
      data: {},
      headers: { Origin: baseURL! },
    });
    const { agreement } = await created.json();
    await second.request.post(baseURL + "/api/demo", {
      data: {},
      headers: { Origin: baseURL! },
    });
    expect(
      (
        await second.request.get(baseURL + "/api/agreements/" + agreement.id, {
          headers: { "X-RevisionPay-Space": "demo" },
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await first.request.get(baseURL + "/api/agreements/" + agreement.id)
      ).status(),
    ).toBe(401);
    const me = await first.request.get(baseURL + "/api/me");
    expect((await me.json()).actor).toBeNull();
  } finally {
    await first.close();
    await second.close();
  }
});

test("mobile entry and interrupted invitation explain the next step", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "Use RevisionPay", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/landing-mobile.png",
    fullPage: true,
  });
  await page.goto("/invite#invalid-token");
  await expect(
    page.getByRole("button", { name: "Try opening again" }),
  ).toBeVisible();
  expect(new URL(page.url()).hash).toBe("#invalid-token");
  await expect(
    page.getByRole("link", { name: "Sign in with Google" }),
  ).toBeVisible();
});

test("real draft starts empty, saves to the workspace and survives reload", async ({
  page,
  context,
  baseURL,
}, testInfo) => {
  test.skip(
    Boolean(process.env.PLAYWRIGHT_BASE_URL),
    "Local fixture only; never seed identities into a hosted database.",
  );
  const { LocalStore } = await import("../../apps/web/src/server/store");
  const { issueSession } = await import("../../apps/web/src/server/auth");
  const path = await import("node:path");
  const store = new LocalStore(
    path.resolve(process.cwd(), testInfo.config.metadata.localDataPath),
  );
  const { cookie } = await issueSession(store, {
    kind: "owner",
    role: "seller",
    tenantId: "owner:e2e-draft",
  });
  await context.addCookies([
    {
      name: "rp_session",
      value: cookie.split(";")[0].split("=")[1],
      url: baseURL!,
    },
  ]);
  await page.goto("/agreements/new");
  await expect(
    page.getByRole("heading", { name: "What needs to change?" }),
  ).toBeVisible();
  await expect(page.getByLabel("Public page URL")).toHaveValue("");
  await expect(page.getByLabel("Change 1", { exact: true })).toHaveValue("");
  await page.getByLabel("Public page URL").fill("https://example.com/pricing");
  await page.getByLabel("Client or business name").fill("Acme Studio");
  await page.getByLabel("Client email").fill("client@example.com");
  await page.getByLabel("Revision fee · USD").fill("125");
  await page
    .getByLabel("Change 1", { exact: true })
    .fill("Explain that the trial lasts for fourteen days.");
  await page
    .getByLabel("Change 2", { exact: true })
    .fill("Preserve the existing monthly price and cancellation policy.");
  await page
    .getByLabel("Change 3", { exact: true })
    .fill("Link the primary button to the existing trial signup.");
  await expect(page.getByRole("status")).toHaveText(/Saved to your workspace/);
  const url = page.url();
  expect(url).toContain("?draft=");
  await page.reload();
  await expect(page.getByLabel("Client or business name")).toHaveValue(
    "Acme Studio",
  );
  await page.getByRole("button", { name: "Review agreement" }).click();
  await expect(
    page.getByRole("heading", { name: "example.com page revision" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Payment status" }),
  ).toContainText("$125");
  await page.screenshot({
    path: "test-results/real-draft-desktop.png",
    fullPage: true,
  });
  const records = await store.listAgreements("owner:e2e-draft");
  expect(records).toHaveLength(1);
  expect(records[0].clientEmail).toBe("client@example.com");
});

test("workspace templates open separate editable sandbox drafts with working sample pages", async ({
  page,
  context,
  baseURL,
}, testInfo) => {
  test.skip(
    Boolean(process.env.PLAYWRIGHT_BASE_URL),
    "Local owner fixture; hosted account access remains private.",
  );
  const { LocalStore } = await import("../../apps/web/src/server/store");
  const { issueSession } = await import("../../apps/web/src/server/auth");
  const { AGREEMENT_TEMPLATES } = await import(
    "../../packages/domain/src/templates"
  );
  const path = await import("node:path");
  const store = new LocalStore(
    path.resolve(process.cwd(), testInfo.config.metadata.localDataPath),
  );
  const { cookie } = await issueSession(store, {
    kind: "owner",
    role: "seller",
    tenantId: "owner:e2e-templates",
  });
  await context.addCookies([
    {
      name: "rp_session",
      value: cookie.split(";")[0].split("=")[1],
      url: baseURL!,
    },
  ]);
  await page.goto("/workspace");
  await expect(
    page.getByRole("button", { name: /^Use template:/ }),
  ).toHaveCount(5);
  await page.screenshot({
    path: "test-results/workspace-templates-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/workspace-templates-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const template of AGREEMENT_TEMPLATES) {
    await page
      .getByRole("button", {
        name: "Use template: " + template.name,
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("heading", { name: template.name, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Nothing charged", { exact: true }),
    ).toBeVisible();
    const source = await page
      .getByRole("link", { name: "Open page", exact: true })
      .getAttribute("href");
    const sample = await context.newPage();
    await sample.goto(source!);
    await expect(
      sample.getByRole("heading", {
        name: template.page.original.headline,
        exact: true,
      }),
    ).toBeVisible();
    await sample.close();
    await page.goto("/workspace");
  }
  const saved = await store.listAgreements("owner:e2e-templates");
  expect(saved).toHaveLength(5);
  expect(
    saved.every(
      (a) =>
        a.mode === "sandbox" && a.payment.status === "NONE" && !a.invitation,
    ),
  ).toBe(true);
  await page.goto("/agreements/new?draft=" + saved[0].id);
  await page.getByLabel("Revision fee · USD").fill("135");
  await page.getByRole("button", { name: "Review agreement" }).click();
  await expect(
    page.getByRole("region", { name: "Payment status" }),
  ).toContainText("$135");
  expect(await store.listAgreements("owner:e2e-templates")).toHaveLength(5);
});
