# RevisionPay: implementation backlog

Use with the [build specification](BUILD_PLAN.md). This backlog targets one developer, approximately **54 focused hours**, with **6 hours of recovery buffer**. Estimates are planning judgments; external approvals, faucet availability, and network finality can add elapsed time.

Deadline: Thursday, 12 November 2026, 21:00 Africa/Lagos. Submit by **18:00 Lagos** and keep the final three hours for submission problems.

## 1. Delivery order

Build in this order: prove the external dependencies, freeze the agreement, collect authorization, verify a real revision, connect finality to capture, harden failures, then finish presentation.

The first useful vertical slice is one supported page, one agreement, one buyer, one real verification, and one correctly gated payment. Each day's result should run, even when some later features still use explicit test adapters.

| Date | Focus | Focused hours | End-of-day evidence |
| --- | --- | ---: | --- |
| Thu 5 Nov | External feasibility and deployed skeleton | 8 | PayPal authorization/void works; isolated capture works on Vercel; GenLayer write and finality path qualified or fallback identified. |
| Fri 6 Nov | Agreements, identity, and consent | 8 | An owner can freeze a real baseline; an invited buyer sees and accepts the same digest. |
| Sat 7 Nov | Intelligent Contract and verification adapter | 8 | Real incomplete/corrected inputs produce inspectable verdicts with correct transaction tracking. |
| Sun 8 Nov | Durable jobs and PayPal settlement | 8 | First complete failed-revision → corrected-revision → finalized PASS → sandbox capture journey. |
| Mon 9 Nov | Recovery paths and polished workflow | 7 | Review, manual acceptance, cancellation, deadlines, receipts, and isolated judge session work. |
| Tue 10 Nov | Financial, AI, and hosted reliability testing | 7 | Required test matrix completed; release-blocking failures fixed or automatic capture disabled for affected cases. |
| Wed 11 Nov | Documentation, fresh setup, and video | 6 | Release candidate, public source/license, usable demo, and public video under three minutes. |
| Thu 12 Nov | Final smoke check and submission | 2 | Submission complete before 18:00 Lagos; remaining buffer used only if needed. |
| Reserved | Integration or deployment recovery | 6 | Protect validation and submission time when earlier estimates slip. |

Do not schedule an SDK migration, a new payment capability, or a visual redesign on submission day.

## 2. Day one: prove the expensive assumptions

| ID | Work | Hours | Complete when |
| --- | --- | ---: | --- |
| G1 | Repository, Node/pnpm workspace, Vercel projects, Atlas connectivity, sandbox configuration | 1.0 | Both project roots deploy; only the main app has financial/DB credentials; the DB user is scoped to the app. |
| G2 | PayPal SDK v6 + AUTHORIZE spike | 1.5 | A sandbox buyer approves; the server receives a usable authorization; a separate test authorization can be voided. Record provider IDs privately. |
| G3 | Browser capture spike on deployed Vercel | 1.5 | A cold function returns bounded text/link evidence and a screenshot; it cleans up Chromium; forbidden destinations are rejected. |
| G4 | GenLayer endpoint, release, fee, and finality spike | 2.5 | The selected environment executes a real LLM contract call; the app reads its result and actual final status; fee funding and any required resolution action are understood. |
| G5 | Freeze architecture decisions and seed original demo pages | 1.5 | A compatibility manifest and original baseline/fail/pass fixtures are committed; the schema and supported evidence policy are fixed. |

G1–G4 need credentials and accounts that are not yet provisioned by this plan. Use account setup time productively; do not wait in a CLI for finality when unrelated implementation can continue.

**Network decision:** if a qualified Bradbury node is unavailable by the end of 5 November, build against the matching hosted Studio development environment. By 12:00 Lagos on 6 November, the selected mode must have demonstrated a real completed evaluation and its supported finality semantics. Keep the environment label visible. A chain ID response from the L2 endpoint does not pass G4.

Record in `docs/compatibility.md`:

- Exact package versions, contract source digest, GenVM/tooling release family, and deployment date.
- Node endpoint type, chain ID, genesis/AddressManager where applicable, and explorer URL.
- Actual deployment/evaluation IDs and final execution state.
- Fee budgets and observed initial-decision/finality time.
- Whether the network finalizes automatically or requires an explicit resolution transaction.
- Actual Vercel capture duration, response size, screenshot size, and runtime architecture.

**Capture decision:** start with Chromium 153 and Puppeteer Core 25.11. If packaging fails, try the official version-pinned Chromium-min release pack with an integrity check, within the same time box. If deployed capture remains unreliable, narrow the evidence policy to public static HTML text and links, label that accurately, and remove rendered-visibility claims. Do not add a VPS or silently use uploaded screenshots as proof of a live page. Freeze any revised evidence policy before creating accepted demo agreements.

**Payment decision:** resolve SDK initialization differences in the deployed sandbox. Direct Orders/Payments REST calls remain the server boundary. Do not substitute an immediate-capture tutorial for authorization followed by later capture.

## 3. Day two: agreement and consent

| ID | Work | Hours | Dependencies | Complete when |
| --- | --- | ---: | --- | --- |
| P1 | Domain schemas, integer money, canonicalization, state invariants | 2.0 | G5 | Python/TypeScript hash vectors agree; changed terms yield a different digest; disallowed transitions fail. |
| P2 | MongoDB collections/indexes and seller authentication | 2.0 | G1, P1 | Owner GitHub ID is allowlisted; other logged-in users cannot operate the merchant; connections are pooled. |
| P3 | Draft builder, baseline capture, freeze, invitation | 2.0 | G3, P1, P2 | The buyer gets the complete frozen baseline/requirements; editing a draft invalidates old capture/consent assumptions. |
| P4 | Buyer session, consent screen, checkout integration | 2.0 | G2, P3 | Buyer acceptance binds the digest; authorization binds the provider payer and computes absolute deadlines. |

Acceptance case: a browser attempts to change $180 to $1 or swap the agreement digest. The server rejects it and never authorizes the altered terms.

## 4. Day three: substantive verification

| ID | Work | Hours | Dependencies | Complete when |
| --- | --- | ---: | --- | --- |
| A1 | Immutable per-agreement contract, access control, submission identity | 2.0 | G4, P1 | Terms cannot mutate; duplicate logical submissions do not execute the LLM again; conflicting reused IDs fail. |
| A2 | Leader prompt, semantic validator, citations, deterministic aggregation | 3.0 | A1 | All expected criterion IDs are present; contradictory/unsupported conclusions cannot pass merely by matching JSON shape. |
| A3 | SDK adapter, persisted operations, deployment/result/finality reads | 2.0 | A1, G4 | A process restart resumes a known transaction; provisional and final states are distinct; wrong contract/network results are rejected. |
| A4 | Initial evaluation cases and measured fee profile | 1.0 | A2, A3 | Representative PASS, REVISE, and uncertainty paths have recorded results/fees; thresholds are documented. |

Do not use the application's own LLM verdict as the contract input. The Intelligent Contract must perform the assessment.

## 5. Day four: the complete payment journey

| ID | Work | Hours | Dependencies | Complete when |
| --- | --- | ---: | --- | --- |
| R1 | Durable job/outbox execution, leases, cron, bounded retries | 2.5 | P1, P2, A3 | A killed invocation leaves resumable work; duplicate cron deliveries do not duplicate logical operations. |
| R2 | PayPal operation records, verified webhooks, reconciliation | 3.0 | P4, R1 | Authorization/capture/void use stable IDs; webhook-before-response and lost-response cases resolve from provider state. |
| R3 | Finality gate, fresh content check, atomic capture reservation | 2.5 | A2–A4, R1, R2 | Incomplete evidence stays uncaptured; a finalized PASS for the current unchanged version produces one completed sandbox capture. |

This is the most important day. If the complete journey does not work, use the recovery buffer before spending time on secondary presentation features.

## 6. Day five: recoverable product behavior

| ID | Work | Hours | Dependencies | Complete when |
| --- | --- | ---: | --- | --- |
| U1 | Checklist result, evidence highlights, revision history, receipt | 2.0 | R3 | A buyer can understand the failed requirement and inspect the payment proof without reading raw JSON. |
| U2 | Review hold, explicit buyer acceptance, cancel/void, cutoffs | 3.0 | R2, R3 | Buyer hold races safely with capture; manual acceptance is separately labeled; an uncertain payment cannot be canceled as if definitely unpaid. |
| U3 | Isolated judge session, demo controls, quotas, owner health view | 2.0 | U1, U2 | A visitor cannot access owner jobs or arbitrary capture targets; the app exposes current service readiness and cost limits. |

The owner can observe, reconcile, pause, and cancel eligible operations. Do not add a force-pass or mark-paid control.

## 7. Day six: required verification

| ID | Work | Hours | Dependencies | Complete when |
| --- | --- | ---: | --- | --- |
| T1 | Payment races, duplicate events, unknown sends, restart tests | 2.0 | R3, U2 | One logical capture; canceled/stale/provisional jobs never charge; pending is never shown as paid. |
| T2 | Labeled AI corpus and repeated difficult cases | 2.0 | A4, R3 | At least 12 documented cases; no known incomplete/ambiguous fixture triggers automatic capture. |
| T3 | Auth, tenant, invitation, SSRF, injection, payload checks | 1.5 | U3 | The boundaries in the specification hold in tests; prohibited data cannot reach the public contract. |
| T4 | Deployed cold-start, recovery, mobile and accessibility checks | 1.5 | T1–T3 | The actual Vercel deployment works without the developer's browser or a persistent local process. |

Use actual sandbox and GenLayer runs for the normal path. Use controlled provider adapters to reproduce rare failures, and label that test evidence. Do not claim a simulated appeal or declined payment was observed on the real network unless it was.

Feature freeze after these checks. Subsequent work addresses release-blocking failures and submission materials.

## 8. Days seven and eight: make judging easy

| ID | Work | Hours | Complete when |
| --- | --- | ---: | --- |
| S1 | README, environment templates, setup, contract instructions, operations notes | 2.0 | A clean checkout can run with the documented external accounts and chosen network profile. |
| S2 | Record and edit the functional video | 2.0 | Video is under three minutes, public on YouTube, and shows the genuine failed-then-paid flow with honest timing. |
| S3 | Release-candidate rehearsal and proof receipt | 1.0 | Fresh sandbox evidence is saved; public replay links work; no sensitive credentials appear in footage or repo. |
| S4 | License, tool attribution, public repo, demo access instructions | 1.0 | The source/license are visible and a judge can understand which parts are real, simulated, and environment-dependent. |
| F1 | Final deployed smoke check | 1.0 | Cron, capture service, DB, GenLayer, and PayPal are reachable; no stale demo authorization is presented as usable. |
| F2 | Submit and verify the submission | 1.0 | Project text, repository, hosted build, tools, and public video are all linked correctly before 18:00 Lagos. |

## 9. Budget and abuse controls

| Item | Cash allocation | Control |
| --- | ---: | --- |
| Vercel Pro, one seat | $20 | Two projects on the same account; check checkout total/taxes before purchase. |
| Additional Vercel usage | Up to $10 | Configure spend alerts and available spend controls; pause new workload before exhausting the allowance. |
| MongoDB Atlas Free | $0 | Bounded evidence, pooled connections, monitor storage and transfer limits. |
| GitHub public repository and ordinary CI | $0 planned | Standard hosted runners for repository tests; no always-on worker. |
| PayPal sandbox | $0 | Hardcode the public demo to sandbox. |
| GenLayer testing | $0 cash planned | Qualified faucet/hosted allocation required; measure and cap fee use. No assumption of unlimited free inference. |
| Domain / other hosting | $0 | Use Vercel-provided URLs. |
| Reserve including taxes | $20 | Do not spend automatically; retain for actual integration costs. |
| Total maximum | **$50** | Subscription renewals after the submission need a separate operating budget. |

Vercel Pro currently includes a usage credit; the extra $10 is a contingency for overage, not an assertion that all usage will cost another $10. Confirm actual billing controls in the account.

Initial public-demo caps: one active agreement per session, ten active agreements globally, three distinct verification submissions per agreement, and at most twenty new evaluations per day globally. Count retries that actually invoke inference against the budget; status polls do not consume evaluation quota.

Reserve the expected remaining verification allowance for an admitted demo so an exhausted daily quota does not arbitrarily strand its second revision. Keep owner validation access within a separate explicit budget. Refuse new authorizations when the service cannot reasonably finish an admitted job; existing jobs can still reconcile, receive review, or cancel.

Keep screenshots and their indexes below a conservative 200 MB application threshold. Retain proof records through judging; remove expired demo sessions and nonessential artifacts only under a documented retention policy. Financial records and provider event deduplication must not disappear merely because a session expired.

## 10. What to cut if time slips

Cut in this order:

1. Animation, elaborate visual diff controls, PDF export, and marketing-page detail.
2. Additional requirement templates and additional supported customer domains.
3. Extra analytics, optional sponsor integrations, and nonessential owner dashboards.
4. Anything related to multi-merchant onboarding, subscriptions, percentages, or platform payouts; these are already outside the planned build.

Keep a simple receipt, readable criterion evidence, current state, and recovery controls. Never cut finality checks, exact amount binding, authorization consent, payment deduplication, tenant isolation, or the failed-revision demonstration.

If the GenLayer network cannot support the required operations, the submission may still show real GenLayer Studio AI and PayPal sandbox, labeled honestly. That weakens the decentralized-network claim; it is not equivalent to a testnet deployment. Do not add a cosmetic on-chain hash to disguise the missing verification network.

If no real GenLayer inference path works, the core requirement of this chosen architecture is blocked. Preserve the PayPal and application work and report that fact; do not present mocked model output as functioning GenLayer AI.

## 11. Submission checklist

- [ ] Public, open-source repository with root license and all required source/assets.
- [ ] Working hosted sandbox build and clear fresh-checkout setup instructions.
- [ ] Documented PayPal Orders/Payments integration and actual authorization/capture proof.
- [ ] Actual GenLayer AI execution, contract source, selected network label, and finality evidence.
- [ ] Incomplete revision demonstrably uncaptured; corrected revision paid exactly once.
- [ ] Explain the merchant backend's role and the trusted evidence-collection boundary.
- [ ] Record supported scope, meaningful limitations, and evaluation results without invented accuracy claims.
- [ ] Under-three-minute public YouTube video showing functioning software.
- [ ] Original/permitted visual assets; no exposed secrets or real customer information.
- [ ] Public project description, tools/models, demo link, repo link, and video link checked.
- [ ] Submission completed before the internal 18:00 Lagos target on 12 November.
