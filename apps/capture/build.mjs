import { build } from "esbuild";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const output = path.resolve(".vercel/output");
const fn = path.join(output, "functions/api/snapshot.func");
await fs.mkdir(path.join(fn, "runtime"), { recursive: true });
await build({
  entryPoints: ["api/snapshot.ts"],
  outfile: path.join(fn, "runtime/index.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  banner: {
    js: 'import { createRequire as __revisionpayCreateRequire } from "node:module"; const require = __revisionpayCreateRequire(import.meta.url);',
  },
});
// Chromium resolves ../bin relative to the bundled runtime entry. Copy actual files,
// not pnpm workspace symlinks, into the self-contained Vercel function.
const chromiumEntry = fileURLToPath(import.meta.resolve("@sparticuz/chromium"));
await fs.cp(
  path.resolve(path.dirname(chromiumEntry), "../bin"),
  path.join(fn, "bin"),
  { recursive: true, dereference: true },
);
await fs.writeFile(
  path.join(fn, ".vc-config.json"),
  JSON.stringify({
    runtime: "nodejs24.x",
    handler: "runtime/index.mjs",
    launcherType: "Nodejs",
    maxDuration: 60,
  }),
);
await fs.writeFile(
  path.join(output, "config.json"),
  JSON.stringify({ version: 3 }),
);
console.log(
  "Built isolated Vercel capture function with bundled dependencies and Chromium assets.",
);
