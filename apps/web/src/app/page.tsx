import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  FileCheck2,
  CreditCard,
  ScanText,
  Users,
  Github,
  LockKeyhole,
} from "lucide-react";
import { Logo } from "@/components/ui";
import { RevisionExample } from "@/components/revision-example";
export const metadata: Metadata = {
  title: "RevisionPay — Agree on done. Get paid on approval.",
  description:
    "Turn a vague website revision into a clear checklist, captured evidence and a client-approved PayPal payment. Find work, agree, verify and get paid.",
  robots: { index: true, follow: true },
  alternates: { canonical: "/" },
};
export default function Home() {
  return (
    <div className="landing">
      <a className="skip-link" href="#content">
        Skip to content
      </a>
      <header className="landing-header">
        <Logo />
        <nav aria-label="Main navigation">
          <Link href="/explore">Find work</Link>
          <a href="#how-it-works">How it works</a>
          <Link href="/judges">For judges</Link>
        </nav>
        <Link className="landing-signin" href="/workspace">
          Open workspace <ArrowUpRight size={17} />
        </Link>
      </header>
      <main id="content">
        <section className="landing-hero">
          <div className="landing-copy">
            <p className="eyebrow">
              <span className="live-dot" /> BUILT FOR THE LAST MILE OF FREELANCE
              WORK
            </p>
            <h1>
              Agree on <em>done.</em>
              <br />
              Get paid on
              <br />
              <span>approval.</span>
            </h1>
            <p className="landing-lead">
              “Just one more change” shouldn’t be a payment plan. Turn small
              website revisions into a clear checklist, evidence of the work,
              and a PayPal payment your client approves.
            </p>
            <div className="landing-actions">
              <Link className="button" href="/workspace">
                Use RevisionPay <ArrowRight size={19} />
              </Link>
              <Link className="button secondary" href="/demo">
                Try the guided demo
              </Link>
            </div>
            <p className="landing-caption">
              <Check size={14} /> No crypto wallet needed <span>·</span>{" "}
              Connected PayPal sandbox
            </p>
          </div>
          <RevisionExample />
        </section>
        <div className="landing-ribbon">
          <span>Clear requirements</span>
          <ArrowRight size={16} />
          <span>Captured evidence</span>
          <ArrowRight size={16} />
          <span>Client approval</span>
          <ArrowRight size={16} />
          <strong>PayPal payment</strong>
        </div>
        <section className="landing-problem" id="problem">
          <div>
            <p className="eyebrow">THE PROBLEM IS THE HANDOFF</p>
            <h2>
              A finished page.
              <br />
              An unfinished conversation.
            </h2>
          </div>
          <div className="problem-copy">
            <p>
              For freelancers, vague requests turn into extra rounds and payment
              follow-ups. For clients, “it’s done” can arrive without a clear
              way to check what changed.
            </p>
            <p>
              RevisionPay puts the original agreement, the delivered version and
              the payment decision in one shared place.
            </p>
          </div>
        </section>
        <section id="how-it-works" className="landing-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">FROM REQUEST TO RECEIPT</p>
              <h2>
                Less chasing.
                <br />A clear next step.
              </h2>
            </div>
            <p>
              Built for copy and link changes on one public website page. Fixed
              fees from $25 to $500.
            </p>
          </div>
          <div className="landing-steps">
            {[
              {
                n: "01",
                Icon: FileCheck2,
                title: "Make “done” specific",
                text: "Agree on the page, 3–5 requirements and a fixed fee. The client reviews the frozen checklist and authorizes the fee in PayPal.",
              },
              {
                n: "02",
                Icon: ScanText,
                title: "Bring evidence to the review",
                text: "Submit the updated page. RevisionPay captures its copy and links. GenLayer AI checks each requirement and cites the evidence.",
              },
              {
                n: "03",
                Icon: CreditCard,
                title: "Approve the work. Then pay.",
                text: "The client can request changes or approve the captured revision. RevisionPay collects the authorized PayPal fee and confirms the receipt.",
              },
            ].map(({ n, Icon, title, text }) => (
              <article key={n}>
                <div>
                  <span>{n}</span>
                  <Icon size={27} />
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="landing-control">
          <div className="control-mark">
            <LockKeyhole size={52} />
            <span>
              THE CLIENT
              <br />
              HAS THE FINAL SAY
            </span>
          </div>
          <div>
            <p className="eyebrow">
              AI CHECKS THE WORK. PEOPLE APPROVE PAYMENT.
            </p>
            <h2>
              Useful evidence.
              <br />A human decision.
            </h2>
            <p>
              A passing AI check doesn’t charge a client. The client reviews the
              captured version and explicitly approves payment. If the work
              needs a change, the agreed checklist stays in view.
            </p>
            <Link className="text-link" href="/help">
              Understand the payment flow <ArrowRight size={17} />
            </Link>
          </div>
        </section>
        <section className="landing-section landing-audiences">
          <div className="section-heading">
            <div>
              <p className="eyebrow">BRING YOUR CLIENT. OR FIND EACH OTHER.</p>
              <h2>
                One place to start
                <br />
                and finish the work.
              </h2>
            </div>
          </div>
          <div className="audience-grid">
            <article>
              <Users size={28} />
              <h3>Need a website change?</h3>
              <p>
                Post a clear brief in the Explorer. Review applications, invite
                a freelancer, and approve the agreement before work begins.
              </p>
              <Link className="button secondary" href="/explore/new">
                Post work as a client <ArrowRight size={17} />
              </Link>
            </article>
            <article>
              <FileCheck2 size={28} />
              <h3>Ready to do the work?</h3>
              <p>
                Apply to open briefs or create an agreement for a client you
                already have. Keep the scope, evidence and next step together.
              </p>
              <Link className="button secondary" href="/explore">
                Find work in the Explorer <ArrowRight size={17} />
              </Link>
            </article>
          </div>
        </section>
        <section className="landing-judges">
          <div>
            <p className="eyebrow">PAYPAL AI HACKATHON · WORKING PROTOTYPE</p>
            <h2>
              See the whole idea
              <br />
              in the product.
            </h2>
            <p>
              Follow a revision that misses a requirement, request a correction,
              and review the final payment decision. Then explore the connected
              workspace and the implementation.
            </p>
            <div className="landing-actions">
              <Link className="button" href="/judges">
                Open the judge’s walkthrough <ArrowRight size={18} />
              </Link>
              <a
                className="text-link"
                href="https://github.com/TS-mfon/revisionpay"
                target="_blank"
                rel="noreferrer"
              >
                <Github size={18} /> Read the source
              </a>
            </div>
          </div>
          <div className="build-facts">
            <p>
              <strong>PayPal</strong>
              <span>
                Seller onboarding · authorization · capture · verified payment
                updates
              </span>
            </p>
            <p>
              <strong>GenLayer AI</strong>
              <span>
                Requirement checks with cited page evidence on Studionet
              </span>
            </p>
            <p>
              <strong>Current release</strong>
              <span>
                Real integrations in sandbox. Test funds. Live payments require
                partner approval.
              </span>
            </p>
          </div>
        </section>
        <section className="landing-close">
          <p className="eyebrow">MAKE THE NEXT REVISION CLEARER</p>
          <h2>
            A checklist you agree on.
            <br />A payment you can explain.
          </h2>
          <Link className="button" href="/workspace">
            Start an agreement <ArrowRight size={19} />
          </Link>
        </section>
      </main>
      <footer className="landing-footer">
        <Logo />
        <span>Clear work. Evidence. Client-approved payment.</span>
        <Link href="/help">Help</Link>
        <Link href="/judges">Build & demo</Link>
        <a href="https://github.com/TS-mfon/revisionpay/blob/main/LICENSE">
          MIT license
        </a>
      </footer>
    </div>
  );
}
