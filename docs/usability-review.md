# First-time user review — 9 November 2026

This is a code and browser review of the working product, not a claim of testing with new human users. The aim is to let someone unfamiliar with RevisionPay understand the next action and recover when a step fails.

## Findings addressed

| Problem | Change |
| --- | --- |
| “Real workspace” suggests real-money availability while payments use sandbox accounts. | The switch now says “Workspace.” The home page and workspace explain test funds and the lack of live payments. |
| The freelancer/client handoff assumes prior knowledge. | Agreements identify the current role, show four stages, explain authorization, and state who acts next. |
| An owner opening their own invitation becomes stuck in client view. | Explicit view selection uses only existing authenticated sessions. A scoped client session cannot become a seller. |
| The screen checks `redeemedAt` although the API returns `redeemed`, so it offers an invitation replacement that is guaranteed to fail. | It reads the public redemption state and explains how an existing client returns. |
| “Send to client” can leave the user unaware that no email was sent. | “Create client link” explains the commitment, presents the share action immediately, and reports whether an email is queued. |
| Missing PayPal setup is discovered only after attempting to send. | The draft explains the missing connection and links to setup. PayPal’s return URL preserves the specific agreement, using an allowlisted local destination. |
| Sandbox approval assumes knowledge of developer accounts. | Contextual instructions explain Personal versus Business test accounts before leaving the app. |
| Failed workspace/account loads can leave a spinner indefinitely. | Load failures expose a retry action; payment-setup fetch failures are visible. |
| Client logout calls a route that cannot identify an agreement-scoped session. | It signs out through the authorized agreement route. A separate freelancer session stays usable. |
| Browser storage failure can prevent navigation after a successful draft save. | Optional tab storage no longer blocks cloud saving or opening the saved agreement. |
| Mobile template cards hide existing work below a long list of examples. | Existing agreements appear before the template library. First-use guidance and progress adapt to narrow screens. |

## Validation

Regression coverage includes setup and return to the same draft, opening an actual invitation in the same browser, independent client sign-out, invitation redemption, request-failure recovery, local return-path validation, and tenant/role isolation. Existing draft, template, payment-state and guided-journey tests remain in place. Fixtures run locally; they do not seed hosted users or bypass PayPal in the deployed product.

## Remaining external limits

PayPal sandbox still requires valid test credentials and any verification PayPal requests. Live payments remain gated on partner approval and validation. An invitation without a client email relies on its original browser session after redemption. No newly completed hosted PayPal authorization or human usability study is claimed by this review.
