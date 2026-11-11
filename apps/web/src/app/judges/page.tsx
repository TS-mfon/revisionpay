import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Github,
  FileCheck2,
  CreditCard,
  ScanText,
} from "lucide-react";
import { Logo } from "@/components/ui";
export const metadata: Metadata = {
  title: "Judge’s walkthrough",
  description:
    "Explore RevisionPay’s working demo, PayPal integration, AI evidence checks and source code.",
  robots: { index: true, follow: true },
};
export default function Judges() {
  return (
    <div className="landing">
      <header className="landing-header">
        <Logo />
        <nav aria-label="Judge navigation">
          <Link href="/">The idea</Link>
          <Link href="/explore">Explorer</Link>
        </nav>
        <Link className="landing-signin" href="/workspace">
          Connected workspace <ArrowRight size={17} />
        </Link>
      </header>
      <main className="judge-page">
        <p className="eyebrow">PAYPAL AI HACKATHON · JUDGE’S WALKTHROUGH</p>
        <h1>
          From “is it done?”
          <br />
          to a clear payment decision.
        </h1>
        <p className="judge-lead">
          RevisionPay helps freelancers and clients finish small website
          revisions with a frozen checklist, captured evidence, AI findings and
          an explicitly approved PayPal payment.
        </p>
        <section className="judge-video" id="video">
          <p className="eyebrow">THE PRODUCT, IN UNDER THREE MINUTES</p>
          <h2>Watch RevisionPay in action</h2>
          <p>
            A narrated, captioned walkthrough of finding a freelancer, reviewing
            a revision, requesting a correction and approving payment. The
            payment and AI sequence uses the clearly labeled guided simulation.
          </p>
          <video
            controls
            playsInline
            preload="metadata"
            poster="/media/revisionpay-demo-poster.jpg"
            aria-label="RevisionPay product demo"
          >
            <source src="/media/revisionpay-demo.mp4" type="video/mp4" />
            <track
              kind="captions"
              src="/media/revisionpay-demo.en.vtt"
              srcLang="en"
              label="English"
            />
            Your browser does not support embedded video. Download the MP4
            below.
          </video>
          <a
            className="text-link"
            href="/media/revisionpay-demo.mp4"
            download="RevisionPay-demo.mp4"
          >
            Download the demo MP4 ↓
          </a>
        </section>
        <div className="judge-paths">
          <section className="form-section">
            <p className="eyebrow">FASTEST WAY TO UNDERSTAND THE PRODUCT</p>
            <h2>Follow the guided demo</h2>
            <p>
              No account or credentials needed. This isolated demo simulates
              payments and AI results so anyone can try both roles.
            </p>
            <ol>
              <li>Review the requirements and simulate authorization.</li>
              <li>Submit a revision with one missed requirement.</li>
              <li>Request changes and submit the corrected page.</li>
              <li>Approve the finished work and see one simulated receipt.</li>
            </ol>
            <Link className="button" href="/demo">
              Start the guided demo <ArrowRight size={18} />
            </Link>
          </section>
          <section className="form-section">
            <p className="eyebrow">TEST THE CONNECTED INTEGRATIONS</p>
            <h2>Use the real workspace</h2>
            <p>
              Sign in with Google, connect a PayPal sandbox Business account,
              and choose one of five prepared agreement templates.
            </p>
            <ol>
              <li>Capture the sample page and create a client link.</li>
              <li>Use a separate sandbox Personal account to authorize.</li>
              <li>Submit the updated page for actual capture and AI checks.</li>
              <li>
                As the client, approve the revision to request sandbox capture.
              </li>
            </ol>
            <Link className="button secondary" href="/workspace">
              Open connected workspace <ArrowRight size={18} />
            </Link>
            <Link className="text-link" href="/help#paypal">
              Sandbox account setup help
            </Link>
          </section>
        </div>
        <section className="judge-implementation">
          <p className="eyebrow">WHAT THE TECHNOLOGY DOES</p>
          <h2>Each integration has a job.</h2>
          <div className="landing-steps">
            {[
              {
                Icon: CreditCard,
                name: "PayPal moves the payment",
                description:
                  "Partner onboarding connects the freelancer’s sandbox merchant account. Orders authorize the agreed fee; capture follows client approval. Webhook signatures, provider reads and idempotent commands reconcile the result.",
              },
              {
                Icon: ScanText,
                name: "AI checks the actual evidence",
                description:
                  "A separate browser service captures the page’s text and links. GenLayer Studionet compares that snapshot with the frozen requirements and returns cited findings. A missing or uncertain finding stays visible for review.",
              },
              {
                Icon: FileCheck2,
                name: "The agreement connects the two",
                description:
                  "Versioned records bind requirements, evidence and approval. The approved snapshot is checked again before capture; changed content puts collection on hold. The receipt records the confirmed payment result.",
              },
            ].map(({ Icon, name, description }) => (
              <article key={name}>
                <Icon size={27} />
                <h3>{name}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="form-section">
          <h2>Explore the newest workflow</h2>
          <p>
            A client publishes an opt-in work brief. Freelancers apply
            privately. The client invites one applicant, and acceptance creates
            a private agreement bound to both accounts. Saved client links
            remain available after reload and can be used again.
          </p>
          <Link className="button secondary" href="/explore">
            Explore posted work <ArrowRight size={18} />
          </Link>
        </section>
        <section className="judge-boundaries">
          <h2>What this prototype covers</h2>
          <p>
            One public page, 3–5 copy or link requirements, and a USD $25–$500
            fee. It does not assess visual design or an entire website. AI
            findings advise the client; they do not authorize a charge. PayPal
            authorization is not escrow or a guarantee of payment.
          </p>
          <p>
            Connected payments use sandbox funds. Live partner approval remains
            outstanding. GenLayer runs on the experimental Studionet network.
            The guided demo uses separate simulated records.
          </p>
        </section>
        <div className="judge-links">
          <a
            className="button"
            href="https://github.com/TS-mfon/revisionpay"
            target="_blank"
            rel="noreferrer"
          >
            <Github size={18} /> Source & setup instructions
          </a>
          <a
            className="text-link"
            href="https://github.com/TS-mfon/revisionpay/blob/main/docs/studionet-proof.json"
            target="_blank"
            rel="noreferrer"
          >
            Studionet execution record ↗
          </a>
          <a
            className="text-link"
            href="https://github.com/TS-mfon/revisionpay/actions/workflows/ci.yml"
            target="_blank"
            rel="noreferrer"
          >
            Automated checks ↗
          </a>
        </div>
        <p className="small-text">
          The linked Studionet record uses synthetic evidence with real contract
          execution; it is not a PayPal transaction.
        </p>
      </main>
    </div>
  );
}
