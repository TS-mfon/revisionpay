import Link from "next/link";
import { Shell } from "@/components/ui";
export default function Help() {
  return (
    <Shell title="Help">
      <article className="help-page">
        <p className="eyebrow">HELP WHEN YOU NEED IT</p>
        <h1>Clear work. Clear payment.</h1>
        <section>
          <h2>What can I use RevisionPay for?</h2>
          <p>
            Short copy and link changes on one public website page. Agree on 3–5
            specific requirements and a USD $25–$500 fee. Checks assess the
            captured text and link destinations, not visual design or complete
            website functionality.
          </p>
        </section>
        <section>
          <h2>When does money move?</h2>
          <p>
            The client first authorizes the agreed fee in PayPal. PayPal or the
            client’s bank may place a temporary hold. For new agreements,
            RevisionPay only collects the fee after the client reviews and
            explicitly approves a captured revision. AI findings do not
            automatically charge the client.
          </p>
          <p>
            Authorization is not escrow or a guarantee of payment. PayPal may
            decline collection. The receipt says “Paid” only after PayPal
            confirms it.
          </p>
        </section>
        <section>
          <h2>How long do we have?</h2>
          <p>
            After authorization, the freelancer has 48 hours to submit the work,
            with up to three submissions. The client must approve and payment
            must begin before the 70-hour deadline or PayPal’s earlier expiry.
            If the agreement expires, create a fresh agreement and obtain new
            consent.
          </p>
        </section>
        <section id="paypal">
          <h2>PayPal sign-in or verification trouble</h2>
          <p>
            In the sandbox workspace, use a generated sandbox Personal account
            from the{" "}
            <a
              href="https://developer.paypal.com/dashboard/accounts"
              target="_blank"
              rel="noreferrer"
            >
              PayPal Developer Dashboard
            </a>
            . Its email and password are separate from your normal PayPal
            credentials. Use password sign-in if PayPal offers it.
          </p>
          <p>
            RevisionPay cannot receive or bypass PayPal’s verification codes. If
            approval is interrupted, return to your agreement and use “Resume
            PayPal approval.” Do not start another payment while the app is
            confirming an outcome.
          </p>
        </section>
        <section id="access">
          <h2>Lost or expired invitation?</h2>
          <p>
            Use the original browser to return to the agreement. If your
            freelancer supplied your email, sign in with the Google account
            matching that email to recover access on another device. You can
            also ask your freelancer for a fresh private invitation link.
          </p>
          <Link className="button secondary" href="/login">
            Sign in with Google
          </Link>
        </section>
        <section>
          <h2>The page could not be checked</h2>
          <p>
            Use a public HTTPS page that opens without a password, cookies or a
            CAPTCHA. Very large pages and pages with blocked or incomplete
            resources cannot be accepted as complete evidence. Update the draft
            URL or try the page check again before sending an invitation.
          </p>
        </section>
        <section>
          <h2>Changes, cancellations and refunds</h2>
          <p>
            Before approving the finished revision, choose “Request changes” and
            explain what needs fixing. Before collection starts, either party
            can cancel; an uncollected authorization is released where possible.
            A pending payment must be confirmed before it can be canceled.
          </p>
          <p>
            For a paid agreement, contact the freelancer about a refund. Refunds
            and disputes are handled in PayPal, and confirmed payment updates
            appear in RevisionPay.
          </p>
        </section>
        <section>
          <h2>What is public?</h2>
          <p>
            Requirements and captured public-page evidence can be published to
            GenLayer Studionet for experimental AI checks. Contact emails and
            access links stay private. Avoid putting passwords, private client
            information or confidential material in requirements. Detailed
            evidence and technical records are available within each agreement.
          </p>
        </section>
      </article>
    </Shell>
  );
}
