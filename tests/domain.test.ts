import { describe, expect, it } from "vitest";
import {
  assertCaptureEligible,
  assertCanSubmit,
  decimalAmount,
  hasFinalPass,
  parseAmount,
  validateVerdict,
  type Agreement,
} from "../packages/domain/src/index";
import { sealEvidence, verifyEvidence } from "../packages/domain/src/crypto";
import { agreement, revision } from "./helpers";

describe("collection eligibility", () => {
  it("permits only the current final successful PASS", () => {
    const a = agreement();
    revision(a);
    expect(assertCaptureEligible(a)).toBe("AI_PASS");
    revision(a, "incomplete");
    expect(hasFinalPass(a)).toBe(false);
    expect(() => assertCaptureEligible(a)).toThrow();
  });
  const blocked: [string, (a: Agreement) => void][] = [
    [
      "provisional consensus",
      (a) => {
        a.submissions[0].verification.protocolStatus = "ACCEPTED";
      },
    ],
    [
      "VM exception",
      (a) => {
        a.submissions[0].verification.executionStatus = "FINISHED_WITH_ERROR";
      },
    ],
    [
      "wrong contract",
      (a) => {
        a.submissions[0].verification.contractAddress = "other";
      },
    ],
    [
      "simulation presented as sandbox",
      (a) => {
        a.mode = "sandbox";
      },
    ],
    [
      "different agreement",
      (a) => {
        a.submissions[0].verification.result!.agreementDigest = "other";
      },
    ],
    [
      "different evidence",
      (a) => {
        a.submissions[0].verification.result!.artifactHash = "other";
      },
    ],
    [
      "missing consent",
      (a) => {
        a.consents = [];
      },
    ],
    [
      "buyer hold",
      (a) => {
        a.reviewHoldAt = new Date().toISOString();
      },
    ],
    [
      "cancellation",
      (a) => {
        a.cancelRequestedAt = new Date().toISOString();
      },
    ],
    [
      "expired authorization",
      (a) => {
        a.payment.captureDeadline = new Date(Date.now() - 1).toISOString();
      },
    ],
    [
      "pending authorization",
      (a) => {
        a.payment.status = "AUTH_PENDING";
      },
    ],
    [
      "incomplete evidence",
      (a) => {
        a.submissions[0].evidence!.complete = false;
      },
    ],
    [
      "changed current page",
      (a) => {
        a.freshEvidence!.contentHash = "other";
      },
    ],
    [
      "stale current page",
      (a) => {
        a.freshEvidence!.capturedAt = new Date(
          Date.now() - 120001,
        ).toISOString();
      },
    ],
    [
      "future capture timestamp",
      (a) => {
        a.freshEvidence!.capturedAt = new Date(
          Date.now() + 60000,
        ).toISOString();
      },
    ],
  ];
  it.each(blocked)("blocks %s", (_, change) => {
    const a = agreement();
    revision(a);
    change(a);
    expect(() => assertCaptureEligible(a)).toThrow();
  });
  it("rejects invented citations, duplicate criteria, and inconsistent verdicts", () => {
    const a = agreement();
    const s = revision(a);
    const result = s.verification.result!;
    for (const bad of [
      {
        ...result,
        criteria: result.criteria.map((c) => ({
          ...c,
          evidenceBlockIds: ["current:invented"],
        })),
      },
      {
        ...result,
        criteria: [result.criteria[0], result.criteria[0], result.criteria[2]],
      },
      { ...result, verdict: "REVISE" },
    ])
      expect(() => validateVerdict(bad, a, s)).toThrow();
  });
  it("binds manual acceptance to the exact current submission", () => {
    const a = agreement();
    const s = revision(a, "incomplete");
    a.manualAcceptanceId = "manual";
    a.consents.push({
      id: "manual",
      kind: "BUYER_ACCEPTED",
      digest: a.digest!,
      at: new Date().toISOString(),
      actorId: "buyer",
      copyVersion: "1",
      submissionId: s.id,
      artifactHash: s.evidence!.artifactHash,
    });
    expect(assertCaptureEligible(a)).toBe("BUYER_ACCEPTED");
    revision(a, "ambiguous");
    expect(() => assertCaptureEligible(a)).toThrow();
  });
  it("enforces the submission window and three-submission limit", () => {
    const a = agreement();
    a.payment.submissionDeadline = new Date(Date.now() - 1).toISOString();
    expect(() => assertCanSubmit(a)).toThrow();
    a.payment.submissionDeadline = new Date(Date.now() + 10000).toISOString();
    revision(a);
    revision(a);
    revision(a);
    expect(() => assertCanSubmit(a)).toThrow();
  });
});

it("preserves content identity across captures while sealing metadata", () => {
  const a = agreement();
  const e = revision(a).evidence!;
  const next = sealEvidence({
    ...e,
    requestId: "new-capture",
    capturedAt: new Date(Date.now() + 1000).toISOString(),
  });
  expect(next.contentHash).toBe(e.contentHash);
  expect(next.artifactHash).not.toBe(e.artifactHash);
  expect(verifyEvidence(next)).toBe(true);
  next.blocks[0].text = "tampered";
  expect(verifyEvidence(next)).toBe(false);
});

it("uses integer cents and rejects malformed provider amounts", () => {
  expect(decimalAmount(18001)).toBe("180.01");
  expect(parseAmount("180.01")).toBe(18001);
  for (const value of ["1e2", "-1", "NaN", "25.001", "9007199254740992"])
    expect(() => parseAmount(value)).toThrow();
});
