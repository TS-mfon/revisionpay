# RevisionPay: research and feasibility record

Research date: 5 November 2026. This record supports the [build specification](BUILD_PLAN.md) and distinguishes documented capabilities from work still requiring a deployed test.

## 1. What has and has not been verified

Official documentation, package registries, release notes, SDK source, and relevant competitor pages were accessible through CLI web requests. Earlier network-access problems do not prevent this planning research now.

The prior research also made read-only RPC calls confirming the published Bradbury chain identity and the Studio chain IDs. This establishes endpoint identity and reachability, not successful Intelligent Contract execution.

**No application deployment, contract deployment, paid GenLayer inference, PayPal authorization/capture, Vercel Chromium invocation, or Atlas application integration has been performed during planning.** Those are the first build gates. A package existing in a registry is not proof that the whole stack works together.

## 2. Problem evidence and competitive opening

### Late payments and disputed work

The UK Department for Business and Trade's 2024 study surveyed 300 businesses. Its executive summary reports:

- 31% cited disputed invoices as a reason they paid suppliers late.
- 24% cited administrative errors as a reason they received payments late.
- Among micro businesses that avoided formal action, 44% cited protecting customer relationships.

Source: [Late payments research: understanding variations in payment performance and practices across sectors and sizes](https://www.gov.uk/government/publications/late-payments-research-performance-and-practices-across-business/late-payments-research-understanding-variations-in-payment-performance-and-practices-across-business-sectors-and-sizes-html-executive-summary).

These support investigating acceptance friction. They do not establish that website revisions account for those percentages, that 31% of all invoices are disputed, or that the findings generalize worldwide. RevisionPay still needs direct customer validation.

### Existing solutions

| Existing product | Observed overlap | Implication for RevisionPay |
| --- | --- | --- |
| [ManyRequests AI agents](https://www.manyrequests.com/features/ai-agents) | Invoice chasing, brief checks, retainer checks, and project agents. | An agency dashboard or invoice reminder alone is weak differentiation. |
| [Ziflow ReviewAI](https://www.ziflow.com/reviewai) | AI checklist review; verification that changes address previous feedback was presented as coming soon on the inspected page. | AI proofing is an established category. The payment connection and accessible customer segment matter. |
| [Scopey](https://www.scopeyonsite.com/) | Relating construction communications to contractual obligations. | Scope interpretation already has specialized solutions; choose a narrower website acceptance workflow. |
| [ProofWorks GenLayer repository](https://github.com/tommycet/proofworks-genlayer) | GitHub bounty verification and crypto escrow, including revisions and milestones. | GenLayer verification plus conditional reward is not itself new. |
| [InternetCourt](https://internetcourt.org/) | Broad contract/payment/adjudication initiative. | Avoid claiming to invent autonomous dispute adjudication. |

The unproven but credible opening is a short paid revision accepted against explicit, shared requirements, with conventional PayPal authorization and payment. Customer willingness to preauthorize and accept this verification policy is a greater business uncertainty than whether another invoice interface can be built.

## 3. PayPal facts that shape the design

| Finding | Design consequence | Source |
| --- | --- | --- |
| Orders can use AUTHORIZE intent and be authorized after buyer approval. | Keep buyer authorization separate from later collection. | [Orders v2 schema](https://developer.paypal.com/api/orders/v2/schema.json) |
| Capturing an authorization uses Payments v2. | Use `/v2/payments/authorizations/{id}/capture`; do not apply an immediate order-capture tutorial to this flow. | [Payments v2 schema](https://developer.paypal.com/api/payments/v2/schema.json) |
| Authorization generally lasts 29 days, with capture recommended during a three-day honor period. | Limit initial jobs to 48 hours and new capture initiation to 70 hours, also respecting provider state. | [Authorize and capture guidance](https://developer.paypal.com/v5/checkout/auth-capture) |
| A fully captured authorization cannot be voided. | Resolve unknown/in-flight capture before attempting cancellation. | [Payments v2 schema](https://developer.paypal.com/api/payments/v2/schema.json) |
| Capture can be pending, declined, failed, or completed. | HTTP success is not sufficient to display PAID. | [Payments v2 schema](https://developer.paypal.com/api/payments/v2/schema.json) |
| `final_capture` indicates no further capture is intended. | Use one full, server-defined amount with `final_capture: true`. | [Payments v2 schema](https://developer.paypal.com/api/payments/v2/schema.json) |
| Request IDs support retries only within the provider's retention behavior, which varies by API. | Persist application deduplication permanently for the job; never assume an unlimited PayPal idempotency window. | [PayPal idempotency](https://developer.paypal.com/api/rest/reference/idempotency/) |
| The documented v2 declined-capture webhook is `PAYMENT.CAPTURE.DECLINED`; older v1 documentation includes DENIED. | Subscribe to the correct API generation's events. | [Webhook event names](https://developer.paypal.com/api/rest/webhooks/event-names/) |
| SDK v6 approval callbacks can authorize on the server, not only capture. | Integrate v6 without losing the delayed-settlement model. | [SDK v6 reference](https://developer.paypal.com/sdk/js/reference.md) |

The current [SDK setup page](https://developer.paypal.com/sdk/js/set-up.md) recommends client-ID initialization for normal checkout, while some later examples on the same page still describe client tokens. Use the supported ordinary-checkout path and confirm it in the deployed sandbox; never expose a merchant bearer token as a browser token.

The plan treats PayPal as central: consent, authorization, delayed capture, voiding, receipts, and verified payment state all depend on its APIs. An additional PayPal agent toolkit is not required to make that integration meaningful.

The authorization is not a trustless escrow account or a payment guarantee. GenLayer cannot independently debit a PayPal account or override PayPal's dispute, reversal, and refund processes. The merchant backend remains the payment executor.

## 4. GenLayer facts that shape the design

### AI and evidence

[Calling LLMs](https://docs.genlayer.com/developers/intelligent-contracts/features/calling-llms.md) documents `gl.nondet.exec_prompt`, JSON-format responses, custom validator logic, and image input. The documented image limit is two. RevisionPay's first contract evaluates bounded text/link evidence; screenshot review remains a human-facing aid.

The same guide demonstrates response-shape checks, but a payment decision needs substantive validation. Matching a JSON schema does not establish that a revision satisfies the evidence. RevisionPay's validator must independently assess the requirement statuses and supporting evidence; exact free-form wording need not match.

[Prompt-injection guidance](https://docs.genlayer.com/developers/intelligent-contracts/security-and-best-practices/prompt-injection.md) calls for restricted input and controlled prompts. Consensus is not a general defense against malicious page instructions. The public-data boundary also means private customer conversations, payment credentials, or identity details do not belong in contract inputs.

Relevant rationale: [When to use GenLayer](https://docs.genlayer.com/developers/intelligent-contracts/when-to-use-genlayer.md).

### Finality and successful execution are separate

[GenLayer finality](https://docs.genlayer.com/understand-genlayer-protocol/core-concepts/optimistic-democracy/finality.md) states that accepted decisions remain appealable and that the appeal window depends on protocol configuration. Readiness to finalize is different from the stored transaction having finalized.

[Querying a transaction](https://docs.genlayer.com/developers/decentralized-applications/querying-a-transaction.md) documents persisted status, execution outcome, lifecycle reads, and `waitForFinalization`. It also warns against assuming that a timed-out wait means a write was never submitted.

The inspected [SDK contract actions at v2.0.0-rc.2](https://github.com/genlayerlabs/genlayer-js/blob/v2.0.0-rc.2/src/contracts/actions.ts) include:

- `finalizeTransaction({ txId })`, which checks the active decision and readiness before submitting a decision-bound finalization call.
- A return value that is an EVM transaction hash, not the Intelligent Contract transaction ID.
- Batch resolution/finalization methods whose availability differs in Studio.

Therefore, the app must persist and distinguish both transaction types, perform any required finalization action, and then read the actual Intelligent Contract status again. Finalized execution errors still cannot authorize payment.

### Network identity and current unresolved access

The [official networks page](https://docs.genlayer.com/developers/networks.md), updated 20 October 2026, separates the Intelligent Contract RPC from the underlying chain RPC.

| Environment | Published identity | Verification status |
| --- | --- | --- |
| Bradbury Phase 2 chain | `https://rpc.testnet-chain.genlayer.com`, chain ID 4221 | Read-only identity confirmed in earlier research. This endpoint alone does not provide the required Intelligent Contract node operations. |
| Bradbury Phase 2 node | Docs say to use the qualified node published in the release announcement or a qualified owned node. | A usable qualified public node endpoint has not been established. No owned node fits the current hosting choice. |
| Stable Studio | `https://studio.genlayer.com/api`, chain ID 61999 | Read-only reachability/identity confirmed; exact contract/SDK compatibility still requires a real write. |
| Studio development preview | `https://studio-dev.genlayer.com/api`, chain ID 61997 | Read-only reachability/identity confirmed; state/availability are not guaranteed across deployments. |

Expected Bradbury Phase 2 genesis:

```text
0x17d89764d4f4f963158fc4c5e8f2cb670c2837740b35f37081c12860c3df97e4
```

Expected AddressManager:

```text
0x3F71AE080BD6270A91dBcc7960d88797828538E0
```

The chain ID was reused; it is not enough by itself. Resolve changing protocol contract addresses through the published deployment's AddressManager. `gen_protocolVersion` is reserved/unimplemented and is not a useful readiness test.

Studio supports real model execution but is not a demonstrated decentralized live-network replica. If it is used, the product description, receipt, and video must say so. The first-day gate is the highest delivery risk in the build.

### Versions and fees

The [GenLayer v0.6 migration guide](https://docs.genlayer.com/developers/consensus-v06-migration.md) requires matching release families. Registry/release checks on 5 November found:

| Package / release | Observed result | Source |
| --- | --- | --- |
| `genlayer-js` npm `latest` | 1.1.8 | [Registry](https://registry.npmjs.org/genlayer-js/latest) |
| `genlayer-js` npm `rc` | 2.0.0-rc.2 | [Registry](https://registry.npmjs.org/genlayer-js/rc) |
| JS SDK RC release | 2.0.0-rc.2, published 19 October 2026 | [GitHub release](https://github.com/genlayerlabs/genlayer-js/releases/tag/v2.0.0-rc.2) |
| Studio preview release | 0.123.0-rc.7 | [GitHub release](https://github.com/genlayerlabs/genlayer-studio/releases/tag/v0.123.0-rc.7) |

Do not infer the exact running backend version from a released tag. The compatibility manifest must come from the selected endpoint and a successful test.

[Fees and transaction tooling](https://docs.genlayer.com/developers/decentralized-applications/fees-and-transaction-kit.md) documents measured profiles, `distribution`, `feeValue`, price ceilings, and protocol/inference-related costs. A fee-funded write must work at the actual evidence size. A hello-world response is insufficient to establish the full verification budget.

## 5. Hosting and database feasibility

| Verified fact | Design decision | Source |
| --- | --- | --- |
| Vercel Hobby cron is limited to daily schedules; Pro permits minute schedules. | Budget Pro and use persisted work. | [Cron usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing) |
| Cron delivery can be missed or duplicated and invocations can overlap. | Use leases, logical operation keys, state checks, and reconciliation. | [Managing cron jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs) |
| Pro is listed at $20/month with included usage credit. | One account/seat, two projects, and a separate overage reserve. | [Vercel pricing](https://vercel.com/pricing) |
| Vercel Functions have a 4.5 MB request/response body limit. | Keep screenshot-plus-evidence responses below 1 MiB. | [Function limitations](https://vercel.com/docs/functions/limitations) |
| Node 24 is supported on Vercel. | Explicitly select Node 24 in both projects and CI. | [Node versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions) |
| `after()` extends work only within the serverless invocation's supported duration. | Use it for an early bounded attempt, never as the durable queue. | [Next.js after](https://nextjs.org/docs/app/api-reference/functions/after) |
| Atlas Free has 0.5 GB data storage, at most 500 connections, and transfer limits. | Small pooled connections, bounded evidence, and storage monitoring. | [Atlas Free limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/) |

The [Sparticuz Chromium documentation](https://github.com/Sparticuz/chromium) explains its serverless binary, memory recommendation, externalization requirements, architecture limits, and temporary-file cleanup. It supports the proposed packaging approach; the actual Vercel cold start remains untested.

The [Puppeteer supported-browser table](https://pptr.dev/supported-browsers) maps Puppeteer 25.11.0 to Chrome 153. The registry lists [`@sparticuz/chromium` 153.0.0](https://registry.npmjs.org/@sparticuz%2fchromium/latest). That makes the pair a better starting point than mixing arbitrary latest versions, while still requiring a deployed compatibility test.

Better Auth's current documentation index points to the [MongoDB adapter](https://better-auth.com/docs/adapters/mongo) and [GitHub provider](https://better-auth.com/docs/authentication/github). Old `/adapters/mongodb` links returned 404. Use the documentation release matching the pinned library.

## 6. Hackathon requirements and positioning

Use the [official challenge page](https://paypalaihackathon.devpost.com/) and [resources](https://paypalaihackathon.devpost.com/resources) as the final authority before submission. Earlier research confirmed the 12 November 2026, 12:00 p.m. PST deadline and the distinction between $67,500 cash and $69,750 total listed prizes including Render credits.

The proposed build demonstrates both required technologies centrally. It does not require an optional sponsor product. The user's Vercel/GitHub hosting choice takes precedence over adding Render; AG Grid, Kernel, and other sponsors should only be added if they solve a real remaining need without endangering the core delivery.

Submission must contain functioning software, public licensed source, usable setup or a hosted build, the tool/model explanation, and a public video under three minutes. A polished static prototype or unlabeled replay of fabricated responses cannot satisfy those requirements.

## 7. Unresolved questions with assigned build checks

| Question | Why it matters | Assigned check |
| --- | --- | --- |
| Which qualified GenLayer node is actually usable? | Determines whether the decentralized testnet claim can be demonstrated. | G4, with the documented Studio decision by early day two. |
| How long do decision and finalization take at the intended fee profile? | Determines capture-window feasibility and demo editing needs. | G4/A4, recorded from real operations. |
| Does the hosted capture function render the scoped pages within the limits? | Determines the supported evidence policy. | G3, cold/warm deployed checks. |
| What idempotency retention is documented for the exact configured PayPal operations? | Determines whether automatic mutation replay is justified. | G2/R2; otherwise use read-only reconciliation for ambiguous sends. |
| Will buyers agree to this preauthorization and acceptance policy? | Determines business viability, beyond hackathon eligibility. | Five targeted customer conversations; no conversion claim before evidence. |
| Can a legitimate merchant in the intended operating country receive these live payments? | Sandbox success does not establish production availability. | Before any live-money pilot. |

Every unresolved issue has a concrete test or product boundary. None is being represented as already proven.
