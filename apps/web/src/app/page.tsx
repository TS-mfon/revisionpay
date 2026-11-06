import Link from "next/link";
import {
  ArrowRight,
  Check,
  FileText,
  CreditCard,
  CheckCheck,
} from "lucide-react";
import { Logo, ModeSwitch } from "@/components/ui";
export default function Home() {
  return (
    <div className="home">
      <header className="product-header">
        <Logo />
        <ModeSwitch />
        <Link className="header-signin" href="/login">
          Sign in <ArrowRight size={16} />
        </Link>
      </header>
      <main>
        <section className="home-hero">
          <div className="hero-intro">
            <p className="eyebrow">FOR FREELANCERS & THEIR CLIENTS</p>
            <h1>
              Agree on the changes.
              <br />
              Get the work done.
              <br />
              <em>Get paid on approval.</em>
            </h1>
            <p className="hero-lead">
              One website page. One clear checklist. One agreed fee. Your client
              reviews the finished work before approving payment.
            </p>
            <div className="hero-actions">
              <Link className="button" href="/workspace">
                Use RevisionPay <ArrowRight size={20} />
              </Link>
              <Link className="button secondary" href="/demo">
                Try the guided demo
              </Link>
            </div>
            <p className="hero-caption">
              Start with a draft. No crypto wallet or payment required.
            </p>
          </div>
          <div
            className="example-document"
            aria-label="Example revision agreement"
          >
            <div className="document-label">
              <FileText size={18} />
              <span>WHAT YOUR CLIENT SEES</span>
              <span className="example-stamp">Example</span>
            </div>
            <h2>Make the pricing page clearer</h2>
            <p>
              Alex Morgan <span aria-hidden="true">→</span> Northstar Studio
            </p>
            <div className="example-amount">
              <span>Fixed revision fee</span>
              <strong>
                $180<span> USD</span>
              </strong>
            </div>
            <ul className="plain-checks">
              {[
                "Explain the 14-day free trial",
                "Keep $29/month and cancel anytime",
                "Link the button to the trial signup",
              ].map((t) => (
                <li key={t}>
                  <Check size={18} />
                  {t}
                </li>
              ))}
            </ul>
            <div className="document-bottom">
              <CreditCard size={23} />
              <div>
                <strong>You approve before you pay.</strong>
                <p>Authorize the fee first. Review the work when it’s ready.</p>
              </div>
            </div>
          </div>
        </section>
        <section id="how-it-works" className="how-it-works">
          <p className="eyebrow">A CLEAR NEXT STEP, FOR BOTH OF YOU</p>
          <h2>
            From “can you change this?”
            <br />
            to a finished revision.
          </h2>
          <div className="steps-grid">
            {[
              {
                n: "01",
                title: "Agree on the work",
                text: "The freelancer lists 3–5 changes to one public page and sets a fixed fee. The client reviews the agreement and authorizes payment.",
              },
              {
                n: "02",
                title: "Check the updated page",
                text: "Publish the changes, then submit the page. AI compares the captured copy and links with the agreed requirements.",
              },
              {
                n: "03",
                title: "Review, approve, pay",
                text: "The client reviews the work and findings. They can request changes or approve the agreed payment through PayPal.",
              },
            ].map((s) => (
              <article key={s.n}>
                <span>{s.n}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="scope-section">
          <CheckCheck size={28} />
          <div>
            <h2>Small, specific website revisions.</h2>
            <p>
              Public page copy and link changes. USD $25–$500. Three submissions
              and a two-day delivery window. AI findings help your review; your
              client makes the payment decision.
            </p>
            <p>
              Connected PayPal sandbox testing is available for the hackathon.
              Live payments open after platform approval and validation.
            </p>
          </div>
          <Link href="/workspace" className="button">
            Create a revision <ArrowRight size={18} />
          </Link>
        </section>
      </main>
      <footer className="product-footer">
        <Logo />
        <span>PayPal payments · GenLayer checks</span>
        <Link href="/help">How payment works</Link>
      </footer>
    </div>
  );
}
