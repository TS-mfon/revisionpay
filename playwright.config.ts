import { defineConfig, devices } from "@playwright/test";
import { randomUUID } from "node:crypto";

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3100";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90000,
  expect: { timeout: 20000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], channel: "chromium" },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "pnpm --filter @revisionpay/web dev --port 3100",
        url: baseURL + "/api/config",
        reuseExistingServer: false,
        timeout: 120000,
        env: {
          ...process.env,
          APP_URL: baseURL,
          REVISIONPAY_MODE: "demo",
          MONGODB_URI: "",
          GITHUB_CLIENT_ID: "",
          GITHUB_CLIENT_SECRET: "",
          SETTLEMENT_PAUSED: "false",
          NEW_JOBS_PAUSED: "false",
          NEXT_TELEMETRY_DISABLED: "1",
          LOCAL_DATA_PATH: ".local/e2e-" + randomUUID() + ".json",
        },
      },
});
