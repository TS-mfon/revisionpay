# RevisionPay product release

The app now separates a guided simulation from a persistent real workspace. New
agreements require the client's explicit approval before collecting the fee.
Existing version-1 agreements retain their immutable terms and automatic-payment
policy; their screens explain the difference. No records are promoted from demo
or sandbox into live mode.

## Current hosting and launch prerequisites

The requested site address remains https://revisionpay.vercel.app. The hackathon
workspace uses real PayPal **sandbox** APIs and GenLayer Studionet. The separate
`/demo` area uses fixtures. A complete connected PayPal authorization/capture
journey is still pending the buyer's PayPal login; browser simulation and standalone
Studionet proof are not substitutes for that validation.

Self-service sign-in now uses **Google**, following the user's updated choice.
Create a Google OAuth Web application client with authorized origin
`https://revisionpay.vercel.app` and redirect URI
`https://revisionpay.vercel.app/api/auth/callback/google`. Set `GOOGLE_CLIENT_ID`
and `GOOGLE_CLIENT_SECRET` privately. Request only basic profile/email access.
Google's verified email can recover access to an agreement addressed to that same
email. Existing owner sessions and private invitations remain usable during setup.
The owner can open their private owner login and connect Google from Account.
This requires both a valid owner session and a verified Google session; matching
names or email addresses never grants owner access. Google accounts with existing
agreements cannot be remapped, so their work stays accessible.

The optional email-link fallback and automatic notifications need `RESEND_API_KEY`
and `MAIL_FROM` after verifying an owned sender domain. A shared *.vercel.app
domain cannot be verified for sending email. Without a sender, use private links;
the interface reports email as unavailable rather than claiming a message was sent.
Magic links use hashed tokens and 15-minute expiry when enabled.

Self-service seller connections need a **Platform REST app** in PayPal sandbox,
`PAYPAL_PLATFORM_CLIENT_ID`, `PAYPAL_PLATFORM_CLIENT_SECRET`,
`PAYPAL_PARTNER_ID`. Set `PAYPAL_PARTNER_ATTRIBUTION_ID` to the app's Reports BN
code when available for reporting; sandbox onboarding does not require this code.
Live readiness does require it. The legacy owner can
continue using the already-configured single sandbox merchant. New sellers cannot
receive payments through the owner's account. Consent is collected before
redirecting the seller to PayPal. A server-side lookup of the saved tracking ID
verifies receiving capability and auth/capture permission; redirect query fields
never establish eligibility. Register onboarding and consent-revocation webhooks
alongside payment events at `/api/webhooks/paypal/platform`, and save
`PAYPAL_PLATFORM_WEBHOOK_ID`. Keep the existing direct merchant app credentials
and `/api/webhooks/paypal` webhook unchanged. Each frozen agreement records which
integration it uses; credentials and webhook verification remain separate.
`pnpm paypal:check --platform` verifies platform credentials and can discover its
partner merchant ID with an unapproved setup order. `pnpm paypal:webhook --platform`
registers the platform app's separate webhook. Neither command authorizes or charges funds.

For live mode, supply the separate `PAYPAL_LIVE_*` credentials and webhook at
`/api/webhooks/paypal/live`. Live money mutations require all of:

- `REVISIONPAY_MODE=live`, approved platform credentials and merchant onboarding;
- `PAYPAL_PARTNER_APPROVED=true` and `LIVE_PAYMENTS_ENABLED=true`;
- controlled validation and `LIVE_PAYMENT_VALIDATED=true`;
- an eligible deployment environment, and settlement not paused.

Do not switch on the public live workspace to conduct the first payment test.
First validate the approved integration with controlled test participants and
explicit payment consent, then record its evidence before enabling public access.
Changing a setup flag is not evidence of a completed payment test. Live reads and
void/reconciliation operations remain possible while new collection is paused.

Vercel Hobby is for noncommercial use. Do not host the eventual commercial
live-money release on Hobby. The no-monthly-bill alternative is Netlify Free;
its project configuration is included, but keeping a *.vercel.app domain on
Netlify is not possible. A migration requires a Netlify address or owned domain.
No paid hosting plan or new subscription has been purchased.

## Netlify deployment option

Import the repository twice, selecting the appropriate `netlify.toml` and base:

- Web: `apps/web/netlify.toml`, base `apps/web`, Next.js adapter, Node 24.
- Capture: `apps/capture/netlify.toml`, base `apps/capture`, isolated Node function.

The capture function keeps Chromium external so its packaged binary paths stay
intact. Validate its deployed size, native libraries and cold start before cutover.
Its only secret is `CAPTURE_SECRET`; never give it database, PayPal, email or
GenLayer credentials. Leave `CAPTURE_ALLOWED_HOSTS` empty for self-service public
HTTPS pages; all resolved destinations must be public. Dependencies are fetched
with checked, pinned DNS on every redirect, bounded sizes and no browser cookies.
Main-page navigation remains on the agreed origin.

Set `APP_URL` and the capture service URL to their actual origins. Reconfigure
Better Auth origins, PayPal return URLs and webhook registrations for the new
host. The scheduled function dispatches every five minutes to a background
function, which calls the authenticated durable worker endpoint. Preview
settlement is disabled. Keep the GitHub scheduler as a fallback until the deployed
scheduler is verified. GET status endpoints do not advance work.

Netlify Free currently has 300 monthly credits and pauses sites at exhaustion.
Public live admission defaults to 10 new agreements per month, five active globally,
and two per seller. Admission happens before sending/authorization and preserves
existing job processing. These conservative app limits do not guarantee protection
against unrelated traffic exhausting the hosting account. Monitor provider usage
and close admission early with `NEW_JOBS_PAUSED=true`. Do not enable paid auto-recharge.
Resend's free allowance is 3,000 emails/month and 100/day; background notices use a
bounded daily quota. PayPal transaction fees are separate from infrastructure costs.

## Verification and user research

Release checks on 6 November 2026: 78 unit/integration tests pass; the four local
browser scenarios pass, including a blank real draft that survives reload without
duplication. Typechecking, the production web build and isolated capture bundle
import pass. The deployed capture service returned complete evidence for
`https://example.com/` and `https://www.iana.org/domains/reserved`. The hosted
Google endpoint creates OAuth state and returns the configured Google client and
callback; the owner also confirmed completing Google sign-in and linking the
existing workspace. PayPal verified both sandbox apps, registered the separate platform
webhook and returned a valid seller onboarding URL. Connecting another seller
through PayPal and buyer authorization still require the
account holders; these checks do not claim a completed PayPal payment journey.

Automated tests cover explicit client approval, concurrent/unknown captures,
tenant and mode isolation, draft conflicts, merchant binding, stalled checks,
invitation recovery and a complete guided browser journey. Use:

```
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @revisionpay/capture build
pnpm test:e2e
```

Before public live launch, complete the connected sandbox journey, validate a
controlled live authorization/approval/capture, and test actual email delivery and
merchant consent revocation. Recheck the complete captured page on representative
client websites. Keep status and receipt claims tied to provider confirmation.

Conduct usability sessions with three freelancers and two clients. Ask them to
create/review a revision unaided and explain the fee, recipient, charge trigger
and recovery step. Target four of five completing their tasks unaided. These
sessions have not been conducted by the coding agent.

Research used: [NN/g usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/),
[interaction cost and click counts](https://www.nngroup.com/articles/3-click-rule/),
[GOV.UK review pattern](https://design-system.service.gov.uk/patterns/check-answers/),
[WCAG target sizes](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html),
[PayPal onboarding](https://developer.paypal.com/docs/multiparty/seller-onboarding/before-payment/),
and [Netlify pricing](https://www.netlify.com/pricing/).
