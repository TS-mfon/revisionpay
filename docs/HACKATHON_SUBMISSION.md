# RevisionPay: submission and demo preparation

## One-line pitch

RevisionPay turns “is the revision done?” into a clear checklist, captured evidence, and a PayPal payment the client approves.

## Problem and audience

Freelancers handling small website revisions often receive vague requests and repeated changes. Clients need a way to check that the delivered page actually matches what they requested. An invoice alone cannot explain whether the work is complete.

Our focused starting point is copy and link changes on one public page, with 3–5 requirements and a fixed USD $25–$500 revision fee. We do not claim to verify visual design or whole-site functionality.

## What we built

- A work Explorer where clients publish a brief, freelancers apply privately, and the client invites one applicant. Acceptance creates a private agreement for those two accounts.
- Agreements that freeze the page, requirements, fee and payment policy. Creators can return and copy the same reusable private invitation link.
- PayPal platform seller onboarding, Orders authorization, explicit client-approved capture, verified webhooks, and provider reconciliation with duplicate-payment safeguards.
- An isolated browser capture service that records the public page's text and links. GenLayer Studionet checks the snapshot against the requirements and returns cited findings.
- Client review, requests for changes, and a confirmed receipt. AI findings never supply client approval for a new agreement.
- A working connected sandbox workspace plus an isolated guided simulation for visitors who do not have sandbox credentials.

## Why PayPal and AI both matter

PayPal authorization separates the client's initial commitment from final collection. The client reviews the requirements before authorizing, then reviews the delivered version before explicitly approving capture. The application checks payment eligibility and reconciles uncertain provider responses.

AI handles the semantic comparison: did the page preserve monthly billing and flexible cancellation, or introduce a conflicting commitment? Findings cite captured text and links. This makes the payment decision easier to understand while keeping the client in control.

The distinctive idea is binding a specific delivered snapshot and a requirement checklist to a human-approved payment decision. The Explorer helps the parties find each other; the agreement and evidence workflow is the core product.

## Finished demo video — under three minutes

The finished video records the functioning app with isolated example accounts, a synthetic English voiceover and readable captions. Its payment and AI sequence is explicitly identified as the guided simulation. No production customer data, invitation credentials or payment credentials appear.

| Scene                        | What it demonstrates                                                                                            |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Landing page                 | The problem: vague revision scope and unclear payment handoffs.                                                 |
| Client brief and application | A freelancer applies; the client invites them; acceptance creates a private agreement.                          |
| Guided authorization         | Frozen requirements and an authorized, uncollected fee, explicitly simulated.                                   |
| First revision               | A conflicting annual commitment is flagged against the cancellation requirement.                                |
| Correction and review        | The client requests changes and reviews the corrected version.                                                  |
| Approval and receipt         | Explicit client approval and a clearly labeled simulated receipt.                                               |
| Integration overview         | How actual PayPal sandbox calls, captured evidence and GenLayer checks fit together in the connected workspace. |

The video preserves the browser actions in order and briefly holds a scene if its narration needs more time. The connected workspace is available separately. A full hosted PayPal authorization-to-capture test has not been completed, so this recording does not claim a completed provider transaction.

## Public links

The narrated MP4 is available in [the judge’s walkthrough](https://revisionpay.vercel.app/judges#video), with a [direct MP4 download](https://revisionpay.vercel.app/media/revisionpay-demo.mp4).

To reproduce it, build the app, run `pnpm exec tsx scripts/record-demo.ts`, then `python3 scripts/narrate-demo.py` and `python3 scripts/render-demo.py`. The Python tools require `edge-tts` (recorded with 7.3.1) and FFmpeg with libass/libx264. Set `REVISIONPAY_FFMPEG` if FFmpeg is not on the path. `REVISIONPAY_TTS_VOICE` defaults to `en-US-AvaMultilingualNeural`. Only the public caption text is sent to the speech service. Intermediate recordings and audio stay under the ignored `.local` directory; only the finished MP4, caption track and poster ship with the app.

- Product: https://revisionpay.vercel.app
- Judge’s walkthrough: https://revisionpay.vercel.app/judges
- Guided demo: https://revisionpay.vercel.app/demo
- Connected workspace: https://revisionpay.vercel.app/workspace
- Explorer: https://revisionpay.vercel.app/explore
- Public source, setup, tests and MIT license: https://github.com/TS-mfon/revisionpay
- Recorded real Studionet execution using synthetic evidence: [studionet-proof.json](studionet-proof.json). This record is not a PayPal payment.

## Submission requirements still requiring the entrant

The [hackathon page](https://paypalaihackathon.devpost.com/) lists a deadline of **November 12, 2026, 12:00pm PST — 9:00pm in Lagos**. It requires an interactive build or complete setup instructions, a public open-source repository with a visible license, tool descriptions, and a publicly visible YouTube demo video under three minutes.

The finished MP4 is ready to upload to YouTube. Add the public YouTube URL to the Devpost entry, review the submission details, and submit before the deadline. No YouTube upload or Devpost submission is performed by this code change. Complete a hosted sandbox authorization-to-capture test before replacing the clearly labeled simulation with claims of a completed provider payment.

## Tools used

PayPal sandbox REST APIs for onboarding, authorization, capture and payment updates; GenLayer Studionet for experimental AI requirement evaluation; Next.js and React for the product; a separate Chromium/Playwright browser service for page evidence; MongoDB Atlas for durable agreements and application state; Better Auth and Google OAuth for sign-in; Vercel for hosting; Vitest, Playwright and GitHub Actions for validation. The repository contains the verifier contract and the exact prompts/instructions used for evidence evaluation. Codex assisted with implementation and testing.
