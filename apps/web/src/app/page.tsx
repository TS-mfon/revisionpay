"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  FileCheck2,
  Fingerprint,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { api, Logo, Button, Badge, ErrorBox } from "@/components/ui";
export default function Home() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const router = useRouter();
  async function start() {
    setBusy(true);
    setError("");
    try {
      const data = await api("demo", {});
      router.push("/agreements/" + data.agreement.id);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <div className="landing">
      <header className="landing-nav">
        <Logo />
        <nav>
          <a href="#how-it-works">How it works</a>
          <Link href="/workspace">
            Workspace <ArrowUpRight size={14} />
          </Link>
        </nav>
        <Link className="button secondary small" href="/login">
          Seller sign in <ArrowRight size={15} />
        </Link>
      </header>
      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="status-dot" />
              FROM “ALMOST DONE” TO PAID
            </div>
            <h1>
              Good work.
              <br />
              Clear terms.
              <br />
              <span>Payment, resolved.</span>
            </h1>
            <p className="hero-description">
              Agree on a website revision. Let AI check the delivered work. Get
              paid through PayPal when the agreed conditions are met.
            </p>
            <div className="hero-actions">
              <Button onClick={start} busy={busy}>
                Try the working demo <ArrowRight size={18} />
              </Button>
              <a className="text-link" href="#how-it-works">
                See how it works <ArrowUpRight size={15} />
              </a>
            </div>
            <ErrorBox message={error} />
            <p className="hero-caption">
              <LockKeyhole size={13} />
              No account required for the simulated demo.
            </p>
            <div className="hero-rails">
              <span>
                Familiar payments.
                <br />
                <strong>PayPal sandbox</strong>
              </span>
              <span className="rail-plus">+</span>
              <span>
                Verifiable decisions.
                <br />
                <strong>GenLayer Studionet</strong>
              </span>
            </div>
          </div>
          <div className="hero-art">
            <div className="art-orbit orbit-one" />
            <div className="art-orbit orbit-two" />
            <div className="illustration-label">
              <span className="status-dot" />A SHARED DEFINITION OF DONE
            </div>
            <div className="hero-agreement">
              <div className="hero-card-top">
                <span className="client-icon">
                  N<span>✳</span>
                </span>
                <Badge tone="green">Ready to collect</Badge>
              </div>
              <small>NORTHSTAR STUDIO</small>
              <h2>
                One page.
                <br />
                Every promise kept.
              </h2>
              <div className="mini-checks">
                {[
                  "14-day trial, clearly explained",
                  "$29/month, cancel anytime",
                  "The right link, in the right place",
                ].map((t) => (
                  <div key={t}>
                    <Check size={15} />
                    <span>{t}</span>
                  </div>
                ))}
              </div>
              <div className="hero-card-footer">
                <div>
                  <small>REVISION FEE</small>
                  <strong>
                    $180<span>.00</span>
                  </strong>
                </div>
                <div className="seal">
                  <ShieldCheck size={20} />
                  <span>
                    Agreed.
                    <br />
                    Verified.
                  </span>
                </div>
              </div>
            </div>
            <div className="floating-note">
              <span>
                <CheckCheck size={19} />
              </span>
              <div>
                <strong>The work matches the agreement.</strong>
                <small>Final verification → authorized payment</small>
              </div>
            </div>
            <p className="art-caption">Illustrative workflow · no real money</p>
          </div>
        </section>
        <section id="how-it-works" className="how-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">A BETTER HANDOFF</p>
              <h2>
                Make “done” something
                <br />
                you can both agree on.
              </h2>
            </div>
            <p>
              For short website copy revisions.
              <br />
              One page, a fixed fee, and explicit requirements.
            </p>
          </div>
          <div className="feature-grid">
            {[
              {
                n: "01",
                icon: FileCheck2,
                title: "Agree before the work",
                text: "Freeze the page, fee, and acceptance criteria. Your buyer authorizes the revision payment through PayPal.",
              },
              {
                n: "02",
                icon: Sparkles,
                title: "Let the evidence speak",
                text: "GenLayer checks the submitted page against each requirement, with findings tied to captured evidence.",
              },
              {
                n: "03",
                icon: Fingerprint,
                title: "Close the loop",
                text: "After a final PASS and a matching fresh page check, collect the authorized fee. Keep one connected receipt.",
              },
            ].map((f) => (
              <article key={f.n}>
                <div className="feature-top">
                  <f.icon size={22} />
                  <span>{f.n}</span>
                </div>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="trust-strip">
          <ShieldCheck size={26} />
          <div>
            <strong>Clear boundaries build trust.</strong>
            <p>
              An incomplete revision stays uncharged. Buyers can request review
              before collection. Manual approval is recorded separately.
            </p>
          </div>
          <Button className="secondary" onClick={start} busy={busy}>
            See it in action <ArrowRight size={16} />
          </Button>
        </section>
      </main>
      <footer className="landing-footer">
        <Logo />
        <span>
          A PayPal + AI hackathon project · Studionet is a development network.
        </span>
        <Link href="/login">
          Open your studio <ArrowUpRight size={14} />
        </Link>
      </footer>
    </div>
  );
}
