import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionHashVariant, type Hash } from "genlayer-js/types";
import { privateKeyToAccount } from "viem/accounts";
import {
  DomainError,
  type Agreement,
  type Finding,
  type Submission,
  type VerificationResult,
  aggregateFindings,
} from "@revisionpay/domain";
import { canonical, digest } from "@revisionpay/domain/crypto";
import { configuration } from "./config";

export function studioClient() {
  const c = configuration();
  if (!/^0x[0-9a-fA-F]{64}$/.test(c.studioKey))
    throw new DomainError(
      "GENLAYER_NOT_CONFIGURED",
      "Configure the dedicated Studionet relayer key.",
      503,
    );
  const endpoint = new URL(c.studioRpc);
  if (
    endpoint.protocol !== "https:" ||
    endpoint.hostname !== "studio.genlayer.com"
  )
    throw new DomainError(
      "WRONG_NETWORK",
      "This release is configured for GenLayer Studionet only.",
      503,
    );
  return createClient({
    chain: studionet,
    endpoint: c.studioRpc,
    account: privateKeyToAccount(c.studioKey as `0x${string}`),
  });
}
export async function assertStudionet() {
  const client = studioClient();
  const chain = await client.request({ method: "eth_chainId" });
  if (Number(BigInt(String(chain))) !== 61999)
    throw new DomainError(
      "WRONG_NETWORK",
      "The connected GenLayer network is not Studionet.",
    );
  return client;
}
export async function contractSource() {
  for (const candidate of [
    path.resolve(process.cwd(), "contracts/revision_agreement.py"),
    path.resolve(process.cwd(), "../../contracts/revision_agreement.py"),
  ]) {
    // next.config.ts explicitly includes this contract in server function traces.
    try {
      return await fs.readFile(/* turbopackIgnore: true */ candidate, "utf8");
    } catch {
      /* check traced monorepo location */
    }
  }
  throw new DomainError(
    "CONTRACT_SOURCE_MISSING",
    "The verifier source was not packaged with this deployment.",
    503,
  );
}
export async function deployAgreement(a: Agreement): Promise<string> {
  const client = await assertStudionet();
  if (!a.terms || !a.baseline || !a.digest || !a.payment.authorizationId)
    throw new DomainError(
      "AGREEMENT_NOT_READY",
      "A frozen, authorized agreement is required.",
    );
  return await client.deployContract({
    code: await contractSource(),
    args: [
      canonical(a.terms),
      canonical(a.baseline),
      a.digest,
      digest({
        agreementId: a.id,
        authorizationId: a.payment.authorizationId,
        salt: a.id,
      }),
    ],
    leaderOnly: false,
  });
}
export async function submitVerification(
  a: Agreement,
  s: Submission,
): Promise<string> {
  const client = await assertStudionet();
  if (!a.contract.address || !s.evidence)
    throw new DomainError(
      "VERIFIER_NOT_READY",
      "The agreement verifier is not ready.",
    );
  if (
    Buffer.byteLength(
      canonical(a.terms) + canonical(a.baseline) + canonical(s.evidence),
    ) > 32768
  )
    throw new DomainError(
      "EVIDENCE_TOO_LARGE",
      "The evidence exceeds this verifier's budget.",
    );
  return await client.writeContract({
    address: a.contract.address as `0x${string}`,
    functionName: "evaluate_submission",
    args: [s.id, s.revision, s.evidence.artifactHash, canonical(s.evidence)],
    value: 0n,
  });
}
export async function transaction(txId: string) {
  const client = await assertStudionet();
  const tx = await client.getTransaction({ hash: txId as Hash });
  const raw = tx as unknown as Record<string, unknown>;
  const consensus = raw.consensus_data as
    | {
        leader_receipt?:
          | { execution_result?: string; result?: { status?: string } }[]
          | { execution_result?: string; result?: { status?: string } };
      }
    | undefined;
  const receipt = Array.isArray(consensus?.leader_receipt)
    ? consensus.leader_receipt.at(-1)
    : consensus?.leader_receipt;
  // Studio 1.1.8 exposes the VM result in the leader receipt, unlike testnet RPCs.
  // Final consensus on an exception is still a failure, never a payment trigger.
  const execution =
    raw.txExecutionResultName ||
    raw.tx_execution_result_name ||
    (receipt?.execution_result === "SUCCESS" &&
    receipt.result?.status === "return"
      ? "FINISHED_WITH_RETURN"
      : receipt?.result?.status && receipt.result.status !== "return"
        ? "FINISHED_WITH_ERROR"
        : "");
  return {
    status: String(raw.statusName || raw.status || "").toUpperCase(),
    execution: String(execution),
    recipient: String(raw.recipient || raw.to_address || raw.to || ""),
    raw,
  };
}
export async function readVerdict(
  address: string,
  submissionId: string,
): Promise<unknown> {
  const client = await assertStudionet();
  const result = await client.readContract({
    address: address as `0x${string}`,
    functionName: "get_verdict",
    args: [submissionId],
    transactionHashVariant: TransactionHashVariant.LATEST_FINAL,
  });
  return typeof result === "string" ? JSON.parse(result) : result;
}
export function simulatedVerdict(
  a: Agreement,
  s: Submission,
): VerificationResult {
  if (!s.evidence) throw new Error("Missing demonstration evidence");
  const text = s.evidence.blocks.map((b) => b.text).join(" ");
  const unsafe = /SYSTEM OVERRIDE|ignore.*instructions/i.test(text);
  const unclear = /conditions will be provided/i.test(text);
  const annual = /mandatory 12-month|termination fee of|\$99 termination/i.test(
    text,
  );
  const wrongPrice = /\$39/.test(text);
  const trial = /14 days/i.test(text) && /No credit card required/i.test(text);
  const primary = s.evidence.links.find((l) => l.primary);
  const findings: Finding[] = a.requirements.map((r, i) => {
    if (unsafe)
      return {
        id: r.id,
        status: "UNVERIFIABLE",
        evidenceBlockIds: ["current:block:6"],
        reason:
          "The page contains instructions aimed at changing the verifier's decision. Human review is required.",
      };
    if (i === 0)
      return {
        id: r.id,
        status: trial ? "SATISFIED" : "UNSATISFIED",
        evidenceBlockIds: ["current:block:2"],
        reason: trial
          ? "The page explains the 14-day trial, no card requirement, and the absence of automatic charging."
          : "The page does not establish the agreed free-trial conditions.",
      };
    if (i === 1)
      return {
        id: r.id,
        status: unclear
          ? "UNVERIFIABLE"
          : annual || wrongPrice
            ? "UNSATISFIED"
            : "SATISFIED",
        evidenceBlockIds: ["current:block:3", "current:block:4"],
        reason: unclear
          ? "Cancellation conditions are deferred until after signup, so the agreed promise cannot be verified."
          : annual
            ? "The annual commitment and $99 termination fee contradict the agreed monthly, cancel-anytime terms."
            : wrongPrice
              ? "The price changed from the agreed $29 monthly offer."
              : "The $29 monthly price and cancel-anytime promise remain intact.",
      };
    const matches = Boolean(
      primary?.href.endsWith("/signup?plan=starter&trial=14") &&
        /free trial/i.test(primary.text),
    );
    return {
      id: r.id,
      status: matches ? "SATISFIED" : "UNSATISFIED",
      evidenceBlockIds: ["current:link:1"],
      reason: matches
        ? "The trial CTA points to the agreed signup destination."
        : "The main CTA does not match the agreed trial offer and destination.",
    };
  });
  return {
    schemaVersion: "1",
    agreementDigest: a.digest!,
    submissionId: s.id,
    artifactHash: s.evidence.artifactHash,
    criteria: findings,
    verdict: aggregateFindings(findings),
  };
}
