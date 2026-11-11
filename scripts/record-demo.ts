// Records the functioning local production build with isolated example accounts.
// No hosted identity, PayPal account, payment or public work post is created.
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { chromium, expect } from "@playwright/test";
import { parse } from "dotenv";

const root = process.cwd();
const directory = path.join(root, ".local", "demo-recording-" + randomUUID());
await fs.mkdir(directory, { recursive: true });
const baseURL = "http://localhost:3200";
const dataPath = path.join(directory, "example-data.json");
const env: Record<string, string> = {};
for (const key of ["PATH", "HOME", "LANG", "LD_LIBRARY_PATH", "TMPDIR"])
  if (process.env[key]) env[key] = process.env[key]!;
for (const file of [".env.example", ".env.local"]) {
  try {
    for (const key of Object.keys(
      parse(await fs.readFile(path.join(root, file))),
    ))
      env[key] = "";
  } catch {}
}
Object.assign(env, {
  APP_URL: baseURL,
  REVISIONPAY_MODE: "demo",
  LOCAL_DATA_PATH: dataPath,
  MONGODB_URI: "",
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
  GITHUB_CLIENT_ID: "",
  GITHUB_CLIENT_SECRET: "",
  CAPTURE_SECRET: "",
  CAPTURE_SERVICE_URL: "http://localhost:1",
  GENLAYER_PRIVATE_KEY: "",
  RESEND_API_KEY: "",
  AUTH_SECRET: "isolated-video-example-" + randomUUID(),
  SETTLEMENT_PAUSED: "false",
  NEW_JOBS_PAUSED: "false",
  NEXT_TELEMETRY_DISABLED: "1",
});
for (const [key, value] of Object.entries(env)) process.env[key] = value;
const { LocalStore } = await import("../apps/web/src/server/store");
const { issueSession } = await import("../apps/web/src/server/auth");
const { postWork } = await import("../apps/web/src/server/explorer");
const store = new LocalStore(dataPath);
const client = {
  id: "video-client",
  tenantId: "video:client",
  kind: "seller" as const,
  role: "seller" as const,
  name: "Northstar Studio",
  email: "client@example.com",
};
const freelancer = {
  id: "video-freelancer",
  tenantId: "video:freelancer",
  kind: "seller" as const,
  role: "seller" as const,
  name: "Alex Morgan",
  email: "freelancer@example.com",
};
for (const who of [client, freelancer])
  await store.putValue("tenant:" + who.tenantId, {
    id: who.tenantId,
    userId: who.id,
    email: who.email,
    displayName: who.name,
  });
const post = await postWork(store, client, {
  title: "Make our pricing page clearer",
  description:
    "Customers ask whether our free trial needs a credit card and how cancellation works. Make the answers clear on one page.",
  sourceUrl: "https://example.com/pricing",
  amountMinor: 18000,
  publishConsent: true,
  requirements: [
    {
      id: "R1",
      title: "Explain the free trial",
      description:
        "Say the free trial lasts 14 days and requires no credit card.",
    },
    {
      id: "R2",
      title: "Keep flexible cancellation",
      description:
        "Keep the price at $29/month, with monthly billing and cancellation at any time.",
    },
    {
      id: "R3",
      title: "Link the trial button",
      description:
        "Link the main trial button to the signup page without implying an immediate purchase.",
    },
  ],
});
const sessions = {
  client: await issueSession(store, client),
  freelancer: await issueSession(store, freelancer),
};
const server = spawn(
  process.execPath,
  [
    path.join(root, "apps/web/node_modules/next/dist/bin/next"),
    "start",
    "--port",
    "3200",
  ],
  { cwd: path.join(root, "apps/web"), env, stdio: ["ignore", "pipe", "pipe"] },
);
let serverLog = "";
server.stdout.on("data", (d) => {
  serverLog += d;
});
server.stderr.on("data", (d) => {
  serverLog += d;
});
let browser;
try {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(baseURL + "/api/config")).ok) break;
    } catch {}
    if (i === 59)
      throw new Error(
        "Local recording server did not start: " + serverLog.slice(-1000),
      );
    await new Promise((r) => setTimeout(r, 500));
  }
  const config = await (await fetch(baseURL + "/api/config")).json();
  if (config.mode !== "demo" || config.database || config.googleAuth)
    throw new Error("Refusing to record with connected credentials.");
  browser = await chromium.launch({ headless: true, channel: "chromium" });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: directory, size: { width: 1280, height: 720 } },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const video = page.video()!;
  const started = Date.now();
  const chapters: {
    start: number;
    title: string;
    caption: string;
    kind: string;
  }[] = [];
  const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
  function chapter(
    title: string,
    caption: string,
    kind = "Product walkthrough · example accounts",
  ) {
    chapters.push({
      start: (Date.now() - started) / 1000,
      title,
      caption,
      kind,
    });
    console.log(title);
  }
  async function go(url: string) {
    await page.goto(baseURL + url);
    await page.addStyleTag({ content: "body{padding-bottom:140px!important}" });
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  }
  async function switchAccount(which: "client" | "freelancer") {
    await context.clearCookies();
    await context.addCookies([
      {
        name: "rp_session",
        value: sessions[which].cookie.split(";")[0].split("=")[1],
        url: baseURL,
      },
    ]);
  }

  await go("/");
  chapter(
    "Agree on done.",
    "Small revisions can become vague scope and payment follow-ups. RevisionPay makes the handoff clear.",
    "RevisionPay · PayPal + AI",
  );
  await pause(5500);
  await page.getByRole("button", { name: "Corrected version" }).click();
  await pause(4000);
  await switchAccount("client");
  await go("/explore/" + post.id);
  chapter(
    "A client posts a clear brief",
    "One public page. Three specific outcomes. A fixed fee. Freelancers can find the work in the Explorer.",
  );
  await pause(6000);
  await switchAccount("freelancer");
  await go("/explore/" + post.id);
  await page
    .getByLabel("Your proposal")
    .fill(
      "I’ll clarify the trial, preserve flexible cancellation, and check the signup link before submitting.",
    );
  chapter(
    "A freelancer applies",
    "Applications stay private between the freelancer and the client. The client chooses who to invite.",
  );
  await page.getByRole("button", { name: "Send application" }).click();
  await expect(
    page.getByRole("heading", { name: "Application sent", exact: true }),
  ).toBeVisible();
  await pause(4000);
  await switchAccount("client");
  await go("/explore/" + post.id);
  const invite = page.getByRole("button", { name: "Invite Alex Morgan" });
  await invite.scrollIntoViewIfNeeded();
  await pause(2000);
  await invite.click();
  await expect(
    page.getByRole("heading", { name: "Invitation sent in RevisionPay" }),
  ).toBeVisible();
  await pause(2500);
  await switchAccount("freelancer");
  await go("/explore/" + post.id);
  await expect(
    page.getByRole("button", { name: "Accept invitation" }),
  ).toBeVisible();
  chapter(
    "Both sides choose to work together",
    "Accepting the invitation creates one private agreement, with the client and freelancer in their correct roles.",
  );
  await page.getByRole("button", { name: "Accept invitation" }).click();
  await expect(
    page.getByRole("link", { name: "Open agreement" }),
  ).toBeVisible();
  await pause(5000);

  await context.clearCookies();
  await go("/demo");
  chapter(
    "Now follow a prepared agreement",
    "This guided example simulates PayPal payments and AI results. The connected workspace uses actual sandbox APIs.",
    "Guided demo · simulated payments and AI",
  );
  await pause(3500);
  await page.getByRole("button", { name: "Start guided demo" }).click();
  await expect(
    page.getByRole("heading", { name: "Northstar pricing page revision" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Continue to client review" })
    .scrollIntoViewIfNeeded();
  await pause(2500);
  await page.getByRole("button", { name: "Continue to client review" }).click();
  chapter(
    "Authorize first. Collect later.",
    "The client reviews the frozen checklist and authorizes the fee. Nothing is collected at this step.",
    "Guided demo · simulated payments and AI",
  );
  await page
    .getByRole("checkbox", { name: /I agree to these requirements/ })
    .check();
  await pause(2000);
  await page
    .getByRole("button", { name: "Simulate authorization", exact: true })
    .click();
  await expect(
    page.getByText("Authorized · not charged", { exact: true }),
  ).toBeVisible();
  await page
    .getByText("Authorized · not charged", { exact: true })
    .scrollIntoViewIfNeeded();
  await pause(4500);
  await page.getByRole("button", { name: "Submit first revision" }).click();
  await expect(page.getByText("Needs a change", { exact: true })).toBeVisible({
    timeout: 60000,
  });
  chapter(
    "Evidence makes the problem visible",
    "The first revision adds a 12-month commitment. That contradicts the requirement to keep cancellation flexible.",
    "Guided demo · simulated payments and AI",
  );
  await page
    .getByText("Needs a change", { exact: true })
    .scrollIntoViewIfNeeded();
  await pause(7000);
  await page
    .getByRole("button", { name: "Request changes", exact: true })
    .click();
  await page.getByRole("button", { name: "Send change request" }).click();
  chapter(
    "Request a correction",
    "The original checklist stays fixed. The freelancer submits a corrected version for another review.",
    "Guided demo · simulated payments and AI",
  );
  await pause(2000);
  await page.getByRole("button", { name: "Submit corrected page" }).click();
  await expect(page.getByText("Check met", { exact: true })).toHaveCount(3, {
    timeout: 60000,
  });
  await page
    .getByText("Check met", { exact: true })
    .first()
    .scrollIntoViewIfNeeded();
  chapter(
    "The work meets the checklist",
    "Each outcome is checked. Passing findings do not charge the client; the payment still waits for explicit approval.",
    "Guided demo · simulated payments and AI",
  );
  await pause(6500);
  const approve = page.getByRole("button", {
    name: "Simulate approval and payment",
  });
  await approve.scrollIntoViewIfNeeded();
  chapter(
    "The client makes the payment decision",
    "The client approves the delivered version. In the connected workspace, this requests PayPal capture.",
    "Guided demo · simulated payments and AI",
  );
  await pause(2500);
  await approve.click();
  await expect(
    page.getByRole("heading", { name: "Payment confirmed." }),
  ).toBeVisible({ timeout: 60000 });
  await page
    .getByRole("heading", { name: "Payment confirmed." })
    .scrollIntoViewIfNeeded();
  chapter(
    "One completed agreement. One receipt.",
    "This is the simulated receipt. The connected workflow records the result only after PayPal confirms it.",
    "Guided demo · simulated payments and AI",
  );
  await pause(6500);
  await go("/judges");
  await page
    .getByRole("heading", { name: "Each integration has a job." })
    .scrollIntoViewIfNeeded();
  chapter(
    "PayPal and AI each do real work",
    "PayPal handles authorization and capture. GenLayer checks captured evidence. The client controls approval.",
    "Implementation · connected sandbox available",
  );
  await pause(7500);
  await go("/");
  chapter(
    "Clear work. Evidence. Client approval.",
    "Explore the working prototype and public source: revisionpay.vercel.app",
    "RevisionPay · PayPal AI Hackathon",
  );
  await pause(8000);
  const duration = (Date.now() - started) / 1000;
  await context.close();
  const raw = await video.path();
  await fs.writeFile(
    path.join(directory, "timeline.json"),
    JSON.stringify({ raw, duration, chapters }, null, 2),
  );
  await fs.writeFile(
    path.join(root, ".local", "latest-demo-recording.json"),
    JSON.stringify({ directory, raw, duration }, null, 2),
  );
  console.log(JSON.stringify({ directory, raw, duration }));
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
