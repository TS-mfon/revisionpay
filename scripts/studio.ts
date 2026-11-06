import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
  assertStudionet,
  deployAgreement,
  transaction,
  submitVerification,
  readVerdict,
} from "../apps/web/src/server/genlayer";
import { draft, freeze } from "../apps/web/src/server/model";
import { fixtureEvidence } from "../apps/web/src/server/evidence";
import { DEFAULT_REQUIREMENTS } from "../packages/domain/src/fixtures";
import { validateVerdict, type Submission } from "../packages/domain/src/index";

const client = await assertStudionet();
console.log(
  "Connected to GenLayer Studionet (61999). Relayer:",
  client.account?.address,
);
if (process.argv[2] !== "smoke") process.exit(0);
const rpc = await fetch("https://studio.genlayer.com/api", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "sim_fundAccount",
    params: [client.account!.address, 1000000000000000000],
  }),
  signal: AbortSignal.timeout(20000),
});
const funding = await rpc.json();
if (funding.error)
  throw new Error("Studionet faucet: " + JSON.stringify(funding.error));
console.log("Dedicated development relayer funded on Studionet.");
const a = draft(
  {
    title: "Northstar pricing page revision",
    clientName: "Northstar",
    amountMinor: 18000,
    sourceUrl: "https://revisionpay.example/demo",
    requirements: DEFAULT_REQUIREMENTS,
  },
  "smoke",
  "sandbox",
);
a.baseline = fixtureEvidence(a, true);
a.baselineStatus = "READY";
freeze(a);
a.payment.authorizationId = "synthetic-smoke-authorization";
await fs.mkdir(".local", { recursive: true });
const proof: Record<string, unknown> = {
  network: "studionet",
  chainId: 61999,
  startedAt: new Date().toISOString(),
  agreementDigest: a.digest,
  payment: "synthetic; no PayPal call",
  evidence: "synthetic fixtures; real contract execution",
};
async function save() {
  await fs.writeFile(
    ".local/studio-smoke.json",
    JSON.stringify(proof, null, 2),
    { mode: 0o600 },
  );
}
async function final(txId: string) {
  for (let n = 0; n < 120; n++) {
    const tx = await transaction(txId);
    if (
      n % 6 === 0 ||
      ["FINALIZED", "UNDETERMINED", "CANCELED"].includes(tx.status)
    )
      console.log(txId, tx.status, tx.execution);
    if (["FINALIZED", "UNDETERMINED", "CANCELED"].includes(tx.status)) {
      if (
        tx.status !== "FINALIZED" ||
        tx.execution !== "FINISHED_WITH_RETURN"
      ) {
        await fs.writeFile(
          ".local/studio-error.json",
          JSON.stringify(
            tx.raw,
            (_, v) => (typeof v === "bigint" ? v.toString() : v),
            2,
          ),
          { mode: 0o600 },
        );
        throw new Error(
          "The contract did not finalize successfully. See .local/studio-error.json.",
        );
      }
      return tx;
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error(
    "Studionet finality timed out. Transaction ID was saved; do not blindly resubmit.",
  );
}
const deployment = await deployAgreement(a);
proof.deploymentTx = deployment;
await save();
console.log("Deployment submitted:", deployment);
const deployed = await final(deployment);
if (!/^0x[0-9a-fA-F]{40}$/.test(deployed.recipient))
  throw new Error("No valid contract address returned");
a.contract = { state: "READY", address: deployed.recipient, txId: deployment };
proof.contractAddress = deployed.recipient;
await save();
const results = [];
for (const variant of ["incomplete", "corrected"] as const) {
  a.demoVariant = variant;
  const s: Submission = {
    id: randomUUID(),
    revision: a.submissions.length + 1,
    requestedAt: new Date().toISOString(),
    state: "READY",
    evidence: fixtureEvidence(a),
    verification: { status: "QUEUED", mode: "sandbox" },
    note: variant,
  };
  a.submissions.push(s);
  a.currentSubmissionId = s.id;
  const txId = await submitVerification(a, s);
  console.log(variant + " submitted:", txId);
  proof.pendingVerificationTx = txId;
  await save();
  await final(txId);
  const result = validateVerdict(
    await readVerdict(deployed.recipient, s.id),
    a,
    s,
  );
  console.log(variant + ":", result.verdict, JSON.stringify(result.criteria));
  if (result.verdict !== (variant === "incomplete" ? "REVISE" : "PASS"))
    throw new Error("Unexpected model decision for " + variant);
  results.push({ variant, txId, result });
  proof.results = results;
  await save();
}
delete proof.pendingVerificationTx;
proof.completedAt = new Date().toISOString();
await save();
console.log(
  "Real Studionet verification passed both smoke scenarios. Proof saved to .local/studio-smoke.json.",
);
