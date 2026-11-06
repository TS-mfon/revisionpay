import { randomUUID } from "node:crypto";
import type {
  Actor,
  Agreement,
  DemoVariant,
  Submission,
} from "../packages/domain/src/index";
import { DEFAULT_REQUIREMENTS } from "../packages/domain/src/fixtures";
import { draft, freeze } from "../apps/web/src/server/model";
import { fixtureEvidence } from "../apps/web/src/server/evidence";
import { simulatedVerdict } from "../apps/web/src/server/genlayer";
import { applyAuthorization } from "../apps/web/src/server/workflow";

export const seller: Actor = {
  id: "seller",
  tenantId: "test",
  kind: "demo",
  role: "seller",
};
export const buyer: Actor = {
  id: "buyer",
  tenantId: "test",
  kind: "demo",
  role: "buyer",
};
export function agreement(): Agreement {
  const a = draft(
    {
      title: "Northstar pricing revision",
      clientName: "Northstar",
      amountMinor: 18000,
      sourceUrl: "https://northstar.example/pricing",
      requirements: structuredClone(DEFAULT_REQUIREMENTS),
    },
    "test",
    "demo",
  );
  a.baseline = fixtureEvidence(a, true);
  a.baselineStatus = "READY";
  freeze(a);
  a.consents.push({
    id: randomUUID(),
    kind: "AGREEMENT",
    digest: a.digest!,
    at: new Date().toISOString(),
    actorId: buyer.id,
    copyVersion: "1",
  });
  a.payment.orderId = "DEMO-ORDER-" + a.id;
  applyAuthorization(a, {
    id: "DEMO-AUTH-" + a.id,
    status: "CREATED",
    payerId: buyer.id,
    at: new Date().toISOString(),
  });
  a.contract = { state: "READY", address: "DEMO-CONTRACT-" + a.id };
  return a;
}
export function revision(
  a: Agreement,
  variant: DemoVariant = "corrected",
  finalized = true,
): Submission {
  a.demoVariant = variant;
  const s: Submission = {
    id: randomUUID(),
    revision: a.submissions.length + 1,
    state: "READY",
    requestedAt: new Date().toISOString(),
    note: "",
    evidence: fixtureEvidence(a),
    verification: { mode: a.mode, status: "QUEUED" },
  };
  a.submissions.push(s);
  a.currentSubmissionId = s.id;
  if (finalized)
    s.verification = {
      mode: a.mode,
      status: "FINALIZED",
      protocolStatus: "FINALIZED",
      executionStatus: "FINISHED_WITH_RETURN",
      txId: "DEMO-TX-" + s.id,
      contractAddress: a.contract.address,
      result: simulatedVerdict(a, s),
    };
  a.freshEvidence = fixtureEvidence(a);
  return s;
}
