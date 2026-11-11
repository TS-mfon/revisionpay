import {
  expect,
  test,
  type BrowserContext,
  type TestInfo,
} from "@playwright/test";
import { randomUUID } from "node:crypto";
import path from "node:path";

test.beforeEach(() =>
  test.skip(
    Boolean(process.env.PLAYWRIGHT_BASE_URL),
    "Local identities only; never publish test work or seed identities on the hosted platform.",
  ),
);
async function signIn(
  context: BrowserContext,
  baseURL: string,
  info: TestInfo,
  name: string,
) {
  const { LocalStore } = await import("../../apps/web/src/server/store");
  const { issueSession } = await import("../../apps/web/src/server/auth");
  const store = new LocalStore(
    path.resolve(process.cwd(), info.config.metadata.localDataPath),
  );
  const tenantId = "user:explorer-" + randomUUID();
  await store.putValue("tenant:" + tenantId, {
    id: tenantId,
    userId: tenantId,
    email: name.toLowerCase() + "@example.com",
    displayName: name,
  });
  const issued = await issueSession(store, {
    tenantId,
    kind: "seller",
    role: "seller",
  });
  await context.addCookies([
    {
      name: "rp_session",
      value: issued.cookie.split(";")[0].split("=")[1],
      url: baseURL,
    },
  ]);
  return { store, tenantId };
}
test("a client posts work, a freelancer applies and accepts, and both enter their own agreement roles", async ({
  page,
  context,
  browser,
  baseURL,
}, info) => {
  const { store } = await signIn(context, baseURL!, info, "Client");
  const freelancer = await browser.newContext();
  try {
    await signIn(freelancer, baseURL!, info, "Freelancer");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/explore/new");
    await page
      .getByLabel("Project title")
      .fill("Explain our trial and cancellation terms");
    await page
      .getByLabel("What’s the problem?")
      .fill(
        "Customers cannot tell if a card is required or how to cancel. We need clear pricing-page copy.",
      );
    await page
      .getByLabel("Public page URL")
      .fill("https://example.com/pricing");
    await page
      .getByLabel("Requirement 1")
      .fill("Say the free trial lasts 14 days without a credit card.");
    await page
      .getByLabel("Requirement 2")
      .fill("Keep the price at $29 per month and say cancel anytime.");
    await page
      .getByLabel("Requirement 3")
      .fill("Link the main start trial button to the signup page.");
    await expect(
      page.getByRole("button", { name: "Publish work" }),
    ).toBeDisabled();
    await page
      .getByRole("checkbox", {
        name: "I want to publish these details in the Explorer.",
      })
      .check();
    await page.getByRole("button", { name: "Publish work" }).click();
    await expect(
      page.getByRole("heading", { name: "Applications (0)" }),
    ).toBeVisible();
    const workId = new URL(page.url()).pathname.split("/").at(-1)!;
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const applicantPage = await freelancer.newPage();
    await applicantPage.goto("/explore");
    await applicantPage
      .getByRole("link", { name: /Explain our trial and cancellation terms/ })
      .click();
    await applicantPage
      .getByLabel("Your proposal")
      .fill(
        "I will update each line of copy and check all three outcomes before submitting.",
      );
    await applicantPage
      .getByRole("button", { name: "Send application" })
      .click();
    await expect(
      applicantPage.getByRole("heading", {
        name: "Application sent",
        exact: true,
      }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Applications (1)" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Invite Freelancer" }).click();
    await expect(
      page.getByRole("heading", { name: "Invitation sent in RevisionPay" }),
    ).toBeVisible();
    await applicantPage.goto("/explore?view=applications");
    await applicantPage
      .getByRole("link", { name: /You’re invited — respond/ })
      .click();
    await applicantPage
      .getByRole("button", { name: "Accept invitation" })
      .click();
    await expect(
      applicantPage.getByRole("link", { name: "Open agreement" }),
    ).toBeVisible();
    await applicantPage.getByRole("link", { name: "Open agreement" }).click();
    await expect(
      applicantPage.getByRole("region", { name: "Agreement progress" }),
    ).toContainText("freelancer");
    const a = (await store.listAgreements()).find(
      (a) => a.workPostId === workId,
    )!;
    expect(a.mode).toBe("sandbox");
    expect(a.payment.status).toBe("NONE");
    expect(a.invitation).toBeUndefined();
    await page.reload();
    await page.getByRole("link", { name: "Open agreement" }).click();
    await expect(
      page.getByRole("heading", {
        name: "Your freelancer is preparing the agreement.",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Agreement progress" }),
    ).toContainText("Next: your freelancer prepares the agreement");
    await expect(
      page.getByRole("link", { name: "Review and share" }),
    ).toHaveCount(0);
    expect(
      (
        await context.request.post(
          baseURL + "/api/agreements/" + a.id + "/freeze",
          { headers: { Origin: baseURL! }, data: { draftRevision: 0 } },
        )
      ).status(),
    ).toBe(403);
    await page.screenshot({
      path: "test-results/explorer-client-agreement-mobile.png",
      fullPage: true,
    });
    await applicantPage.goto("/explore?view=applications");
    await applicantPage.screenshot({
      path: "test-results/explorer-applications-desktop.png",
      fullPage: true,
    });
  } finally {
    await freelancer.close();
  }
});
test("the landing explains the decision and leads to both demo and connected product", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Agree on done/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Corrected version" }).click();
  await expect(
    page.getByText("The requirement is met", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Authorized · not charged", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "First submission" }).click();
  await expect(
    page.getByText("One requirement needs a change", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "For judges", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Open connected workspace" }),
  ).toHaveAttribute("href", "/workspace");
  await expect(
    page.getByRole("link", { name: "Start the guided demo" }),
  ).toHaveAttribute("href", "/demo");
  const card = await page.request.get("/opengraph-image");
  expect(card.ok()).toBe(true);
  expect(card.headers()["content-type"]).toContain("image/png");
});
