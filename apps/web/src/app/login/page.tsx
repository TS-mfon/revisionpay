"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Github, KeyRound } from "lucide-react";
import { api, Logo, Button, ErrorBox } from "@/components/ui";
export default function Login() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function github() {
    setBusy(true);
    try {
      const data = await api("auth/sign-in/social", {
        provider: "github",
        callbackURL: "/workspace",
      });
      if (data.url) location.assign(data.url);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <Logo />
      <section className="auth-card panel">
        <span className="auth-icon">
          <KeyRound size={26} />
        </span>
        <p className="eyebrow">YOUR STUDIO, SECURELY</p>
        <h1>Welcome back.</h1>
        <p>Sign in to manage your revision agreements and sandbox payments.</p>
        <ErrorBox message={error} />
        <Button className="full" busy={busy} onClick={github}>
          <Github size={18} />
          Continue with GitHub <ArrowRight size={16} />
        </Button>
        <div className="auth-divider">OWNER CLI ACCESS</div>
        <p className="auth-helper">
          Already authenticated with GitHub CLI? Generate a private, one-time
          sign-in link from the project:
        </p>
        <code className="command-code">pnpm owner:login</code>
        <p className="auth-helper">
          Open the generated <code>.local/owner-login.html</code> file. Access
          is restricted to the configured seller account.
        </p>
        <div className="notice neutral">
          <p>
            Buyers should use their invitation link. The public demo needs no
            sign-in.
          </p>
        </div>
        <Link href="/" className="back-link">
          <ArrowLeft size={15} />
          Back to RevisionPay
        </Link>
      </section>
    </main>
  );
}
