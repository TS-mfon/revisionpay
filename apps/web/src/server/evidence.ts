import { randomUUID } from "node:crypto";
import {
  EvidenceSchema,
  DomainError,
  type Agreement,
  type Evidence,
} from "@revisionpay/domain";
import {
  canonical,
  sign,
  equalSecret,
  sealEvidence,
  verifyEvidence,
  sha256,
} from "@revisionpay/domain/crypto";
import { fixture } from "@revisionpay/domain/fixtures";
import { configuration } from "./config";
import type { Store } from "./store";

export function fixtureEvidence(a: Agreement, baseline = false): Evidence {
  const data = fixture(baseline ? "baseline" : a.demoVariant || "corrected");
  return sealEvidence({
    schemaVersion: "1",
    requestId: randomUUID(),
    sourceUrl: a.sourceUrl,
    finalUrl: a.sourceUrl,
    capturedAt: new Date().toISOString(),
    policyVersion: "copy-v1",
    viewport: { width: 1440, height: 1000 },
    title: "Northstar — your next chapter",
    blocks: [
      { id: "block:1", kind: "heading", text: data.title },
      { id: "block:2", kind: "paragraph", text: data.description },
      { id: "block:3", kind: "heading", text: data.price + " / month" },
      { id: "block:4", kind: "paragraph", text: data.terms },
      { id: "block:5", kind: "button", text: data.cta },
      ...(data.extra
        ? [{ id: "block:6", kind: "paragraph" as const, text: data.extra }]
        : []),
    ],
    links: [
      {
        id: "link:1",
        text: data.cta,
        href: new URL(data.href, a.sourceUrl).href,
        primary: true,
      },
    ],
    complete: true,
    warnings: [
      "This evidence comes from the explicitly simulated demonstration.",
    ],
    screenshotHash: null,
    collector: "demo-fixture",
  });
}
export async function captureEvidence(
  store: Store,
  a: Agreement,
  baseline = false,
): Promise<Evidence> {
  if (a.mode === "demo") return fixtureEvidence(a, baseline);
  const c = configuration();
  if (!c.captureSecret)
    throw new DomainError(
      "CAPTURE_NOT_CONFIGURED",
      "Configure the isolated capture service.",
      503,
    );
  const input = { url: a.sourceUrl, requestId: randomUUID() };
  const timestamp = String(Date.now());
  const response = await fetch(c.captureUrl + "/api/snapshot", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-RP-Timestamp": timestamp,
      "X-RP-Signature": sign(
        timestamp + "\n" + canonical(input),
        c.captureSecret,
      ),
    },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(45000),
  });
  const text = await response.text();
  if (Buffer.byteLength(text) > 1048576)
    throw new DomainError(
      "EVIDENCE_TOO_LARGE",
      "The capture response exceeds its size limit.",
    );
  const data = JSON.parse(text) as {
    evidence: unknown;
    screenshotBase64?: string;
    error?: string;
    message?: string;
  };
  if (!response.ok)
    throw new DomainError(
      data.error || "CAPTURE_FAILED",
      data.message || "The page could not be captured.",
    );
  if (
    !equalSecret(
      sign(canonical(data), c.captureSecret),
      response.headers.get("x-rp-signature") || "",
    )
  )
    throw new DomainError(
      "INVALID_CAPTURE_SIGNATURE",
      "The evidence collector's response could not be authenticated.",
    );
  const evidence = EvidenceSchema.parse(data.evidence);
  if (
    evidence.requestId !== input.requestId ||
    evidence.sourceUrl !== new URL(a.sourceUrl).href ||
    new URL(evidence.finalUrl).origin !== new URL(evidence.sourceUrl).origin ||
    !verifyEvidence(evidence)
  )
    throw new DomainError(
      "EVIDENCE_MISMATCH",
      "The evidence does not match the agreed page.",
    );
  if (!evidence.complete)
    throw new DomainError(
      "INCOMPLETE_EVIDENCE",
      "The page was only partly captured. Review the capture policy before continuing.",
    );
  if (data.screenshotBase64) {
    const image = Buffer.from(data.screenshotBase64, "base64");
    if (
      image.length > 524288 ||
      sha256(image) !== evidence.screenshotHash ||
      image[0] !== 0xff ||
      image[1] !== 0xd8
    )
      throw new DomainError(
        "INVALID_SCREENSHOT",
        "The screenshot could not be validated.",
      );
    await store.putValue(
      "image:" + evidence.screenshotHash,
      data.screenshotBase64,
      true,
    );
  }
  await store.putValue("evidence:" + evidence.artifactHash, evidence, true);
  return evidence;
}
