import { expect, test } from "@playwright/test";

test("a failed revision stays uncharged; a corrected revision produces a receipt", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Good work/ })).toBeVisible();
  await page.screenshot({
    path: "test-results/landing-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Try the working demo" }).click();
  await expect(
    page.getByRole("heading", { name: "Northstar pricing page revision" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Freeze & create invitation" }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Freeze & create invitation" })
    .click();
  await page.getByRole("button", { name: "Continue as buyer" }).click();
  await expect(
    page.getByRole("button", { name: "Simulate authorization" }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", { name: /I accept these exact requirements/ })
    .check();
  await page.getByRole("button", { name: "Simulate authorization" }).click();
  await expect(
    page.getByText("Authorized · not charged", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Switch to seller", exact: true })
    .click();
  await page.getByLabel("Example page version").selectOption("incomplete");
  await page.getByRole("button", { name: "Submit for verification" }).click();
  await expect(
    page.getByRole("heading", { name: "One more revision. Same agreement." }),
  ).toBeVisible();
  await expect(page.getByTestId("charged-amount")).toHaveText("$0");
  await expect(page.getByText("Needs revision", { exact: true })).toBeVisible();
  await page.screenshot({
    path: "test-results/revision-requested.png",
    fullPage: true,
  });
  await page.getByLabel("Example page version").selectOption("corrected");
  await page.getByRole("button", { name: "Submit for verification" }).click();
  await expect(
    page.getByRole("heading", { name: "The loop is closed." }),
  ).toBeVisible({ timeout: 40000 });
  await expect(page.getByTestId("charged-amount")).toHaveText("$180");
  await page.getByRole("tab", { name: "Receipt", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Good work, accounted for." }),
  ).toBeVisible();
  const response = await page.request.get(
    page.url().replace("/agreements/", "/api/agreements/") + "/receipt",
  );
  const record = await response.json();
  expect(record.agreement.payment.status).toBe("PAID");
  expect(
    record.agreement.events.filter(
      (e: { type: string }) => e.type === "CAPTURE_COMPLETED",
    ),
  ).toHaveLength(1);
  expect(
    record.agreement.submissions.map(
      (s: { verification: { result: { verdict: string } } }) =>
        s.verification.result.verdict,
    ),
  ).toEqual(["REVISE", "PASS"]);
  expect(record.environment).toContain("SIMULATION");
  await page.screenshot({
    path: "test-results/receipt-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "Good work, accounted for." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/receipt-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("rejects cross-origin mutations and keeps demo tenants private", async ({
  request,
  browser,
  baseURL,
}) => {
  const rejected = await request.post("/api/demo", {
    data: {},
    headers: { Origin: "https://unrelated.example" },
  });
  expect(rejected.status()).toBe(403);
  const first = await browser.newContext();
  const second = await browser.newContext();
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
    const hidden = await second.request.get(
      baseURL + "/api/agreements/" + agreement.id,
    );
    expect(hidden.status()).toBe(404);
  } finally {
    await first.close();
    await second.close();
  }
});
