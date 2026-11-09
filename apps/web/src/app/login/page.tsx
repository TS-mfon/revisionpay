"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Check, LockKeyhole } from "lucide-react";
import { api, Logo, Button, ErrorBox, ModeSwitch } from "@/components/ui";
import { safeReturnPath } from "@/lib/navigation";
export default function Login() {
  const [ready, setReady] = useState<{
      googleAuth: boolean;
      emailAuth: boolean;
    }>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(""),
    [email, setEmail] = useState(""),
    [sent, setSent] = useState(false),
    [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    void api("config")
      .then(setReady)
      .catch(() =>
        setError("Couldn't check sign-in availability. Reload to try again."),
      );
    void api("me")
      .then((d) => setSignedIn(Boolean(d.actor && d.actor.kind !== "demo")))
      .catch(() => {});
    if (new URLSearchParams(location.search).has("error"))
      setError(
        "Sign-in wasn't completed. Try again using the same Google account you use for your agreements.",
      );
  }, []);
  function returnTo() {
    const value =
      new URLSearchParams(location.search).get("returnTo") || "/workspace";
    return safeReturnPath(value);
  }
  async function google() {
    setBusy("google");
    setError("");
    try {
      const response = await fetch("/api/auth/sign-in/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "google",
          callbackURL: returnTo(),
          errorCallbackURL: "/login?error=google",
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.url)
        throw new Error(
          "Google sign-in is unavailable right now. Please try again.",
        );
      const url = new URL(data.url);
      if (url.protocol !== "https:" || url.hostname !== "accounts.google.com")
        throw new Error("Couldn't open Google securely. Please try again.");
      location.assign(url.href);
    } catch (e) {
      setError((e as Error).message);
      setBusy("");
    }
  }
  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy("email");
    setError("");
    try {
      const response = await fetch("/api/auth/sign-in/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          callbackURL: returnTo(),
          errorCallbackURL: "/login?error=email",
        }),
      });
      if (!response.ok)
        throw new Error("We couldn't send the email. Try again in a minute.");
      setSent(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="auth-screen">
      <header className="product-header">
        <Logo />
        <ModeSwitch />
      </header>
      <main className="auth-card">
        <span className="auth-symbol">
          <LockKeyhole size={27} />
        </span>
        <p className="eyebrow">SAVE YOUR AGREEMENTS</p>
        <h1>Let’s get your next revision moving.</h1>
        <p>
          Use your Google account to save agreements and return to your work. No
          new password to remember.
        </p>
        <ErrorBox message={error} />
        {signedIn ? (
          <Link className="button" href={returnTo()}>
            Continue to your workspace <ArrowRight size={18} />
          </Link>
        ) : (
          <>
            <Button
              className="google-button secondary"
              disabled={!ready?.googleAuth || Boolean(busy)}
              busy={busy === "google"}
              onClick={google}
            >
              <span className="google-mark" aria-hidden="true">
                G
              </span>
              Continue with Google
            </Button>
            {ready && !ready.googleAuth && (
              <div className="notice info">
                Google sign-in is being connected. Existing private invitation
                links still work.
              </div>
            )}
          </>
        )}
        {ready?.emailAuth && (
          <details className="email-alternative">
            <summary>Sign in with an email link instead</summary>
            {sent ? (
              <p role="status">
                <Check size={17} /> Check {email} for your private sign-in link.
                It expires in 15 minutes.
              </p>
            ) : (
              <form onSubmit={send}>
                <label>
                  Email address
                  <input
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
                <Button disabled={Boolean(busy)} busy={busy === "email"}>
                  Email me a sign-in link
                </Button>
              </form>
            )}
          </details>
        )}
        <p className="auth-foot">
          Invited by a freelancer? Use your private invitation link, or sign in
          with the Google account matching the invited email.
        </p>
        <Link className="text-link" href="/demo">
          Explore the guided demo <ArrowRight size={16} />
        </Link>
      </main>
    </div>
  );
}
