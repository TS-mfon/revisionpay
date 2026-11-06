"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, CreditCard, RefreshCw } from "lucide-react";
import {
  api,
  Shell,
  useMe,
  Button,
  ErrorBox,
  Loading,
  Badge,
} from "@/components/ui";
export default function Settings() {
  const { who, error: authError } = useMe(),
    [data, setData] = useState<any>(),
    [name, setName] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(""),
    [saved, setSaved] = useState(false),
    [consent, setConsent] = useState(false);
  async function load() {
    const d = await api("profile");
    setData(d);
    setName(d.profile?.displayName || who?.name || "");
  }
  useEffect(() => {
    if (who) void load().catch((e) => setError(e.message));
  }, [who]);
  async function run(action: string) {
    setBusy(action);
    setError("");
    try {
      if (action === "profile") {
        await api("profile", { displayName: name });
        setSaved(true);
      } else if (action === "google-sign-in") {
        const response = await fetch("/api/auth/sign-in/social", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: "google",
            callbackURL: "/settings",
            errorCallbackURL: "/login?error=google",
          }),
        });
        const result = await response.json();
        if (!response.ok || !result.url)
          throw new Error("Google sign-in could not start. Please try again.");
        location.assign(result.url);
      } else if (action === "link-google") {
        await api("profile/link-google", {});
        await load();
      } else if (action === "connect") {
        const d = await api("merchant/connect", {});
        location.assign(d.url);
      } else {
        await api("merchant/refresh", {});
        await load();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  useEffect(() => {
    if (
      data &&
      new URLSearchParams(location.search).get("paypal") === "connected"
    ) {
      history.replaceState(null, "", location.pathname);
      void run("refresh");
    }
  }, [Boolean(data)]);
  return (
    <Shell who={who} title="Account">
      <div className="page-heading">
        <div>
          <p className="eyebrow">SET UP ONCE</p>
          <h1>Your account and payments</h1>
          <p>Your client’s payments go to your own connected PayPal account.</p>
        </div>
      </div>
      <ErrorBox message={error || authError} />
      {who === null ? (
        <Link className="button" href="/login">
          Sign in to continue
        </Link>
      ) : !data ? (
        <Loading />
      ) : (
        <div className="settings-grid">
          {data.ownerGoogle && data.readiness.googleAuth && (
            <section className="form-section">
              <h2>Google sign-in for this workspace</h2>
              {data.ownerGoogle.linked ? (
                <p role="status">
                  Connected to {data.ownerGoogle.email}. Use Google next time to
                  return to these agreements and your PayPal account.
                </p>
              ) : (
                <>
                  <p>
                    Keep your existing agreements and sandbox PayPal account
                    when signing in with Google.
                  </p>
                  {data.ownerGoogle.email ? (
                    <Button
                      busy={busy === "link-google"}
                      onClick={() => run("link-google")}
                    >
                      Connect {data.ownerGoogle.email}
                    </Button>
                  ) : (
                    <Button
                      busy={busy === "google-sign-in"}
                      onClick={() => run("google-sign-in")}
                    >
                      Continue with Google
                    </Button>
                  )}
                </>
              )}
            </section>
          )}
          <section className="form-section">
            <h2>How clients see you</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run("profile");
              }}
            >
              <label>
                Your name or business
                <input
                  required
                  minLength={2}
                  maxLength={80}
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setSaved(false);
                  }}
                />
              </label>
              <Button busy={busy === "profile"}>Save name</Button>
              {saved && (
                <span className="save-state" role="status">
                  <Check size={16} />
                  Saved
                </span>
              )}
            </form>
          </section>
          <section className="form-section">
            <div className="section-top">
              <h2>
                <CreditCard size={23} /> PayPal connection
              </h2>
              <Badge
                tone={data.merchant.status === "READY" ? "green" : "amber"}
              >
                {data.merchant.status === "READY"
                  ? "Connected"
                  : data.merchant.status === "REVOKED"
                    ? "Reconnect needed"
                    : data.merchant.status === "PENDING"
                      ? "Finish setup"
                      : "Not connected"}
              </Badge>
            </div>
            <p>
              {data.merchant.environment === "sandbox"
                ? "This workspace connects to PayPal sandbox for the hackathon. Use sandbox business and personal accounts; all payments use test funds."
                : "Connect an eligible PayPal business account to receive client payments. Availability depends on your country and PayPal’s account checks."}
            </p>
            {data.merchant.legalName && (
              <p>
                <strong>{data.merchant.legalName}</strong>
                {data.merchant.country ? " · " + data.merchant.country : ""}
              </p>
            )}
            {data.merchant.status !== "READY" && (
              <>
                <label className="consent">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  <span>
                    I agree to share my account connection details with PayPal
                    so RevisionPay can process authorized payments and refunds.
                    I have reviewed{" "}
                    <a
                      href="https://www.paypal.com/webapps/mpp/security/seller-protection"
                      target="_blank"
                      rel="noreferrer"
                    >
                      PayPal Seller Protection
                    </a>
                    .
                  </span>
                </label>
                <Button
                  disabled={!consent || !data.readiness.merchantOnboarding}
                  busy={busy === "connect"}
                  onClick={() => run("connect")}
                >
                  Connect PayPal <ArrowRight size={18} />
                </Button>
                {!data.readiness.merchantOnboarding && (
                  <div className="notice info">
                    PayPal account connections are being configured. You can
                    create and save drafts now.
                  </div>
                )}
              </>
            )}
            {data.merchant.trackingId !== "legacy-owner" &&
              data.merchant.status !== "NOT_CONNECTED" && (
                <Button
                  className="secondary"
                  busy={busy === "refresh"}
                  onClick={() => run("refresh")}
                >
                  <RefreshCw size={16} />
                  Check connection
                </Button>
              )}
            <p className="small-text">
              PayPal transaction fees apply. RevisionPay adds no platform
              commission in this beta.
            </p>
          </section>
          <section className="onboarding-strip">
            <div>
              <h2>Next: your first revision</h2>
              <p>One public page, a short checklist and a fixed fee.</p>
            </div>
            <Link className="button" href="/agreements/new">
              Create a revision <ArrowRight size={18} />
            </Link>
          </section>
        </div>
      )}
    </Shell>
  );
}
