import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, expect, it } from "vitest";
import { collect } from "../apps/capture/src/collector";
import { verifyEvidence } from "../packages/domain/src/crypto";

let server: Server;
let origin: string;
beforeAll(async () => {
  server = createServer((req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.end(
      `<!doctype html><html><head><title>Capture fixture</title>${req.url === "/blocked" ? '<script src="https://blocked.invalid/main.js"></script>' : ""}</head><body><header>Northstar</header><main><h1>A clear offer</h1><p>14 days free. No credit card.</p><p hidden>This should not be evidence.</p><a data-primary href="/signup?plan=starter&trial=14">Start your trial</a></main><footer aria-hidden="true">Mandatory annual commitment and a $99 termination fee.</footer></body></html>`,
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = "http://127.0.0.1:" + (server.address() as { port: number }).port;
});
afterAll(async () => {
  if (server)
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
});

it("captures visible contradictions outside main and binds real screenshots", async () => {
  const first = await collect(origin + "/", "first", {
    allowedHosts: [],
    allowLocal: true,
  });
  const second = await collect(origin + "/", "second", {
    allowedHosts: [],
    allowLocal: true,
  });
  const text = first.evidence.blocks.map((b) => b.text).join(" ");
  expect(text).toContain("Mandatory annual commitment");
  expect(text).not.toContain("This should not be evidence");
  expect(first.evidence.links.find((l) => l.primary)?.href).toBe(
    origin + "/signup?plan=starter&trial=14",
  );
  expect(first.evidence.complete).toBe(true);
  expect(verifyEvidence(first.evidence)).toBe(true);
  expect(first.evidence.contentHash).toBe(second.evidence.contentHash);
  expect(Buffer.from(first.screenshotBase64, "base64").subarray(0, 2)).toEqual(
    Buffer.from([0xff, 0xd8]),
  );
});

it("marks evidence incomplete when a required cross-origin script is blocked", async () => {
  const result = await collect(origin + "/blocked", "blocked", {
    allowedHosts: [],
    allowLocal: true,
  });
  expect(result.evidence.complete).toBe(false);
  expect(result.evidence.warnings.join(" ")).toContain("script");
});
