import { afterEach, expect, it, vi } from "vitest";
import {
  isPublicAddress,
  validateCaptureUrl,
} from "../apps/capture/src/collector";
afterEach(() => vi.unstubAllEnvs());

it.each([
  "127.0.0.1",
  "10.0.0.1",
  "192.168.1.1",
  "169.254.169.254",
  "0.0.0.0",
  "::1",
  "fc00::1",
  "fe80::1",
  "::ffff:127.0.0.1",
  "not-an-ip",
])("rejects nonpublic address %s", (address) => {
  expect(isPublicAddress(address)).toBe(false);
});
it("allows a public address and an exact approved HTTPS host", () => {
  expect(isPublicAddress("1.1.1.1")).toBe(true);
  expect(
    validateCaptureUrl("https://northstar.example/pricing", [
      "northstar.example",
    ]).pathname,
  ).toBe("/pricing");
});
it.each([
  "http://northstar.example/",
  "https://northstar.example.evil.test/",
  "https://user:pass@northstar.example/",
  "https://northstar.example:8443/",
  "https://northstar.example/#hash",
  "https://127.0.0.1/",
  "file:///etc/passwd",
])("rejects unsupported capture URL %s", (url) => {
  expect(() => validateCaptureUrl(url, ["northstar.example"])).toThrow();
});
it("disables the localhost exception on Vercel", () => {
  vi.stubEnv("VERCEL", "1");
  expect(() =>
    validateCaptureUrl("http://localhost:3000/", ["localhost"], true),
  ).toThrow();
});
it("allows unlisted public HTTPS host names for the self-service collector", () => {
  expect(
    validateCaptureUrl("https://client.example/pricing", []).hostname,
  ).toBe("client.example");
  expect(() =>
    validateCaptureUrl("https://169.254.169.254/latest", []),
  ).toThrow();
  expect(() =>
    validateCaptureUrl("https://client.example:8443/", []),
  ).toThrow();
});
it("disables the localhost exception on Netlify", () => {
  vi.stubEnv("NETLIFY", "true");
  expect(() =>
    validateCaptureUrl("http://localhost:3000/", [], true),
  ).toThrow();
});
