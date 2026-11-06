import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import type { Evidence } from "./index";

export function canonical(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value))
      throw new Error("Canonical data only supports safe integers");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    return (
      "{" +
      Object.keys(o)
        .filter((key) => o[key] !== undefined)
        .sort()
        .map((key) => JSON.stringify(key) + ":" + canonical(o[key]))
        .join(",") +
      "}"
    );
  }
  throw new Error("Unsupported canonical value");
}
export function sha256(value: string | Buffer): string {
  return "sha256:" + createHash("sha256").update(value).digest("hex");
}
export function digest(value: unknown): string {
  return sha256(canonical(value));
}
export function token(): string {
  return randomBytes(32).toString("base64url");
}
export function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}
export function equalSecret(a: string, b: string): boolean {
  const ab = Buffer.from(a),
    bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
export function contentOf(e: Evidence) {
  return {
    sourceUrl: e.sourceUrl,
    finalUrl: e.finalUrl,
    policyVersion: e.policyVersion,
    title: e.title,
    blocks: e.blocks,
    links: e.links,
  };
}
export function sealEvidence(
  input: Omit<Evidence, "artifactHash" | "contentHash">,
): Evidence {
  const e = { ...input, artifactHash: "", contentHash: "" };
  e.contentHash = digest(contentOf(e));
  const { artifactHash: _, ...artifact } = e;
  e.artifactHash = digest(artifact);
  return e;
}
export function verifyEvidence(e: Evidence): boolean {
  const { artifactHash, ...artifact } = e;
  return (
    artifactHash === digest(artifact) && e.contentHash === digest(contentOf(e))
  );
}
