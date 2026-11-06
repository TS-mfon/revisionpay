import { defineConfig, devices } from "@playwright/test";
import { randomUUID } from "node:crypto";

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3100";
// Workers evaluate this config again. Keep their fixture store identical to the server's.
const localDataPath = (process.env.REVISIONPAY_E2E_DATA_PATH ||=
  ".local/e2e-" + randomUUID() + ".json");
export default defineConfig({
  metadata: { localDataPath },
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: process.env.PLAYWRIGHT_BASE_URL ? 180000 : 90000,
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
        command: process.env.PLAYWRIGHT_PRODUCTION
          ? "pnpm --filter @revisionpay/web start --port 3100"
          : "pnpm --filter @revisionpay/web dev --port 3100",
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
          GOOGLE_CLIENT_ID: "",
          GOOGLE_CLIENT_SECRET: "",
          SETTLEMENT_PAUSED: "false",
          NEW_JOBS_PAUSED: "false",
          NEXT_TELEMETRY_DISABLED: "1",
          LOCAL_DATA_PATH: localDataPath,
          CAPTURE_SECRET: "",
          RESEND_API_KEY: "",
          PAYPAL_PARTNER_ID: "",
          LIVE_PAYMENTS_ENABLED: "false",
        },
      },
});
