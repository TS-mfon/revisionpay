import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { getStore } from "../apps/web/src/server/store";
import { configuration } from "../apps/web/src/server/config";
import { token, sha256 } from "../packages/domain/src/crypto";
const id = execFileSync(
  process.env.GH_BIN || "gh",
  ["api", "user", "--jq", ".id"],
  { encoding: "utf8" },
).trim();
if (!configuration().githubId || id !== configuration().githubId)
  throw new Error(
    "Sign into the configured owner's GitHub account before generating a login link.",
  );
const raw = token();
await (
  await getStore()
).putValue(
  "owner-login:" + sha256(raw),
  {
    tenantId: "owner:" + id,
    expiresAt: new Date(Date.now() + 15 * 60000).toISOString(),
  },
  true,
);
await fs.mkdir(".local", { recursive: true });
await fs.writeFile(
  ".local/owner-login.html",
  `<!doctype html><meta name="referrer" content="no-referrer"><title>RevisionPay owner sign-in</title><p>This one-time link expires in 15 minutes.</p><a href="${configuration().appUrl}/owner#${raw}">Sign in to RevisionPay</a>`,
  { mode: 0o600 },
);
console.log(
  "Open .local/owner-login.html in your browser. The one-time sign-in token was saved privately, not printed.",
);
process.exit(0);
