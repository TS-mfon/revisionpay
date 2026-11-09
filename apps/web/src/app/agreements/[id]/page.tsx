"use client";
import Link from "next/link";
import { use, useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  Download,
  Globe,
  LockKeyhole,
  RefreshCw,
  Printer,
  CheckCheck,
} from "lucide-react";
import {
  money,
  currentSubmission,
  MONEY_IN_FLIGHT,
  type Actor,
  type Agreement,
} from "@revisionpay/domain";
import {
  api,
  Shell,
  Button,
  Badge,
  Status,
  ErrorBox,
  Loading,
  ShortHash,
  formatDate,
  agreementHref,
} from "@/components/ui";
import { AgreementProgress } from "@/components/agreement-progress";
import { SandboxHelp } from "@/components/sandbox-help";
import { ClientInvitation } from "@/components/client-invitation";

export default function AgreementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params),
    [a, setA] = useState<Agreement>(),
    [who, setWho] = useState<Actor>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(""),
    [checked, setChecked] = useState(false),
    [link, setLink] = useState(""),
    [delivery, setDelivery] = useState(""),
    [note, setNote] = useState(""),
    [requesting, setRequesting] = useState(false),
    [canceling, setCanceling] = useState(false),
    [returnMessage, setReturnMessage] = useState("");
  const [canSwitchView, setCanSwitchView] = useState(false),
    [invitationRedeemed, setInvitationRedeemed] = useState(false),
    [setup, setSetup] = useState<{
      connected: boolean;
      emailAvailable: boolean;
      liveAvailable: boolean;
    }>();
  const [testVersion, setTestVersion] = useState<"incomplete" | "corrected">(
    "corrected",
  );
  const returned = useRef(false),
    latest = useRef<Agreement | undefined>(undefined);
  const refresh = useCallback(async () => {
    const d = await api("agreements/" + id);
    setA(d.agreement);
    latest.current = d.agreement;
    setWho(d.actor);
    setCanSwitchView(d.canSwitchView || false);
    setInvitationRedeemed(Boolean(d.agreement.invitation?.redeemed));
    setSetup(d.setup);
    return d;
  }, [id]);
  useEffect(() => {
    let active = true,
      timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        await refresh();
      } catch (e) {
        if (active) setError((e as Error).message);
      }
      if (
        active &&
        latest.current?.payment.status !== "PAID" &&
        latest.current?.state !== "CANCELED"
      )
        timer = setTimeout(() => {
          if (!document.hidden) void poll();
          else timer = setTimeout(() => void poll(), 15000);
        }, 5000);
    }
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [refresh]);
  async function action(name: string, data: unknown = {}) {
    setBusy(name);
    setError("");
    try {
      const d = await api("agreements/" + id + "/" + name, data);
      if (d.invitationUrl) {
        setLink(d.invitationUrl);
        setDelivery(d.email || "");
      }
      await refresh();
      return d;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy("");
    }
  }
  useEffect(() => {
    if (!a || returned.current) return;
    const p = new URLSearchParams(location.search).get("paypal");
    if (p === "canceled") {
      returned.current = true;
      setReturnMessage(
        "PayPal approval wasn’t completed. You can resume below.",
      );
      history.replaceState(null, "", location.pathname);
    }
    if (
      p === "approved" &&
      who?.role === "buyer" &&
      a.payment.status === "ORDER_CREATED"
    ) {
      returned.current = true;
      setReturnMessage("Confirming your authorization with PayPal…");
      void action("authorize").then((d) => {
        if (d) {
          setReturnMessage("");
          history.replaceState(null, "", location.pathname);
        }
      });
    }
  }, [a?.payment.status, who?.role]);
  async function pay() {
    if (!a) return;
    if (!(await action("consent", { digest: a.digest }))) return;
    const d = await action("checkout");
    if (!d) return;
    if (a.mode === "demo") await action("authorize");
    else if (d.approvalUrl) location.assign(d.approvalUrl);
  }
  async function submit() {
    if (a?.mode === "demo" || testPage) {
      if (
        !(await action("variant", {
          variant: testPage
            ? testVersion
            : a.submissions.length
              ? "corrected"
              : "incomplete",
        }))
      )
        return;
    }
    if (await action("submit", { note })) setNote("");
  }
  const s = a ? currentSubmission(a) : undefined,
    seller = who?.role === "seller",
    demo = a?.mode === "demo",
    testPage =
      a?.mode === "sandbox" &&
      Boolean(a.testTemplateId) &&
      typeof window !== "undefined" &&
      a.sourceUrl === window.location.origin + "/test-site/" + id,
    paid = a?.payment.status === "PAID",
    terminal =
      a?.state === "CANCELED" ||
      ["VOIDED", "EXPIRED"].includes(a?.payment.status || ""),
    pending = MONEY_IN_FLIGHT.includes(a?.payment.status || "NONE"),
    authorized = a?.payment.status === "AUTHORIZED";
  const canSubmit = Boolean(
    a &&
      authorized &&
      seller &&
      a.submissions.length < 3 &&
      Date.parse(a.payment.submissionDeadline || "") > Date.now() &&
      (!s ||
        s.state === "FAILED" ||
        ["FINALIZED", "FAILED"].includes(s.verification.status)),
  );
  const findings =
    s?.verification.status === "FINALIZED"
      ? s.verification.result?.criteria
      : undefined;
  const unmet = findings?.some((f) => f.status !== "SATISFIED");
  const amount = a ? money(a.amountMinor) : "";
  const legacy = Boolean(a?.digest && a.terms?.schemaVersion === "1");
  const step =
    a?.state === "DRAFT"
      ? 0
      : !a?.payment.authorizationId
        ? 1
        : !s
          ? 2
          : paid
            ? 4
            : 3;
  return (
    <Shell who={who} title="Agreement">
      {!a ? (
        error ? (
          <section className="welcome-panel">
            <h1>Return to your agreement</h1>
            <ErrorBox message={error} />
            <Button
              className="secondary"
              onClick={() => {
                setError("");
                void refresh().catch((e) => setError(e.message));
              }}
            >
              Try loading again
            </Button>
            <p>
              Sign in with the Google account matching the email your freelancer
              invited, or reopen your private invitation link.
            </p>
            <Link
              className="button"
              href={
                "/login?returnTo=" + encodeURIComponent("/agreements/" + id)
              }
            >
              Sign in to recover access <ArrowRight size={18} />
            </Link>
            <Link className="text-link" href="/invite">
              Open an invitation
            </Link>
          </section>
        ) : (
          <Loading message="Opening your agreement…" />
        )
      ) : (
        <>
          {seller && !demo && (
            <Link className="back-link" href="/workspace">
              <ArrowLeft size={17} />
              Your agreements
            </Link>
          )}
          {demo && (
            <div className="demo-guide">
              <span className="guide-count">{Math.min(step + 1, 4)} / 4</span>
              <div>
                <strong>
                  {
                    [
                      "Start with a clear agreement",
                      "See how the client authorizes the fee",
                      "Submit the first revision",
                      "Review the work as the client",
                      "The revision is complete",
                    ][step]
                  }
                </strong>
                <p>
                  {step === 0
                    ? "Review the example, then continue. We’ll guide you through each side."
                    : step === 1
                      ? "This step simulates PayPal approval. Your real client would authorize in PayPal."
                      : step === 2
                        ? "The first example has a mistake. The checks will point it out."
                        : step === 3
                          ? a.state === "REVIEW_HOLD"
                            ? "Now submit the corrected page as the freelancer."
                            : "Request a change, or approve a completed revision. The payment waits for the client."
                          : "No money moved in this demo. Your real agreements stay in the real workspace."}
                </p>
              </div>
            </div>
          )}
          <div className="agreement-title">
            <div>
              <div className="heading-meta">
                <Status agreement={a} />
                {a.mode === "sandbox" && (
                  <Badge tone="amber">PayPal sandbox · test funds</Badge>
                )}
                {a.mode === "live" && <Badge tone="blue">Real payment</Badge>}
              </div>
              <h1>{a.title}</h1>
              <p>
                {a.sellerName || "Freelancer"}
                <span className="party-arrow">→</span>
                {a.clientName}
              </p>
            </div>
            <a
              className="button secondary"
              href={a.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              <Globe size={18} />
              Open page <ArrowUpRight size={16} />
            </a>
          </div>
          {!demo && a.terms?.schemaVersion !== "1" && (
            <AgreementProgress
              agreement={a}
              seller={seller}
              canSwitchView={canSwitchView}
            />
          )}
          {testPage && seller && !terminal && !paid && (
            <div className="template-guide">
              <strong>Your test agreement is ready</strong>
              <p>
                {a.state === "DRAFT"
                  ? "We’ve filled in a sample client, fee and checklist. Create the client link below, then choose Open client view to test. You can switch back to the freelancer view in this browser."
                  : "After the client authorizes the test fee, switch to freelancer view to publish a sample revision. Then switch to client view to review it and approve the test payment."}
              </p>
              <p className="small-text">
                This uses PayPal sandbox and real page checks. You still need a
                Personal sandbox account to test client authorization.
              </p>
            </div>
          )}
          {link && seller && !demo && !invitationRedeemed && !terminal && (
            <ClientInvitation
              link={link}
              delivery={delivery}
              testPage={Boolean(testPage)}
            />
          )}
          {legacy && (
            <div className="notice warning">
              <div>
                <strong>
                  This agreement keeps its original payment terms.
                </strong>
                <p>
                  Its finalized passing checks and a matching fresh page can
                  trigger automatic collection. You can request review before
                  collection starts. New agreements require explicit client
                  approval.
                </p>
              </div>
            </div>
          )}
          <ErrorBox message={error} />
          {returnMessage && (
            <div className="notice info" role="status">
              {returnMessage}
            </div>
          )}
          {paid ? (
            <section className="receipt">
              <span className="success-symbol">
                <CheckCheck size={30} />
              </span>
              <p className="eyebrow">
                {demo ? "EXAMPLE RECEIPT" : "PAYMENT RECEIPT"}
              </p>
              <h2>Payment confirmed.</h2>
              <div className="receipt-amount">
                {amount}
                <span>USD</span>
              </div>
              <p>
                {demo
                  ? "This is a simulated payment. No money moved."
                  : a.mode === "sandbox"
                    ? "PayPal confirmed a sandbox payment using test funds."
                    : "PayPal confirmed this payment to " +
                      (a.sellerName || "your freelancer") +
                      "."}
              </p>
              <dl className="receipt-facts">
                <div>
                  <dt>For</dt>
                  <dd>{a.title}</dd>
                </div>
                <div>
                  <dt>Client</dt>
                  <dd>{a.clientName}</dd>
                </div>
                <div>
                  <dt>Recipient</dt>
                  <dd>{a.sellerName || "Freelancer"}</dd>
                </div>
                <div>
                  <dt>Approved by</dt>
                  <dd>
                    {a.manualAcceptanceId
                      ? "Client"
                      : "Legacy verification terms"}
                  </dd>
                </div>
                <div>
                  <dt>Paid on</dt>
                  <dd>{formatDate(a.payment.capturedAt)}</dd>
                </div>
                {a.payment.adjustment && (
                  <div>
                    <dt>Payment update</dt>
                    <dd>{a.payment.adjustment.replaceAll("_", " ")}</dd>
                  </div>
                )}
              </dl>
              <div className="receipt-actions">
                <Button className="secondary" onClick={() => window.print()}>
                  <Printer size={18} />
                  Print receipt
                </Button>
                <Button
                  className="text-button"
                  onClick={async () => {
                    try {
                      const record = await api("agreements/" + id + "/receipt");
                      const url = URL.createObjectURL(
                        new Blob([JSON.stringify(record, null, 2)], {
                          type: "application/json",
                        }),
                      );
                      const anchor = document.createElement("a");
                      anchor.href = url;
                      anchor.download = "revisionpay-" + id + ".json";
                      anchor.click();
                      setTimeout(() => URL.revokeObjectURL(url), 1000);
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  <Download size={17} />
                  Download record
                </Button>
              </div>
              {!demo && a.payment.captureId && (
                <a
                  className="text-link"
                  target="_blank"
                  rel="noreferrer"
                  href={
                    (a.mode === "sandbox"
                      ? "https://www.sandbox.paypal.com"
                      : "https://www.paypal.com") +
                    "/activity/payment/" +
                    encodeURIComponent(a.payment.captureId)
                  }
                >
                  View payment in PayPal <ArrowUpRight size={16} />
                </a>
              )}
            </section>
          ) : (
            <>
              <section className="payment-summary" aria-label="Payment status">
                <div>
                  <span>Fixed revision fee</span>
                  <strong>
                    {amount}
                    <small>USD</small>
                  </strong>
                </div>
                <div>
                  <strong>
                    {authorized
                      ? "Authorized · not charged"
                      : terminal
                        ? "Agreement closed"
                        : pending
                          ? "Confirming payment status"
                          : a.payment.status === "AUTH_DENIED" ||
                              a.payment.status === "FAILED"
                            ? "Payment needs attention"
                            : "Nothing charged"}
                  </strong>
                  <p>
                    {authorized
                      ? legacy
                        ? "Original terms permit collection after finalized passing checks and a matching fresh page."
                        : "The client approves the finished work before payment is collected."
                      : pending
                        ? "We’re checking with PayPal. Please don’t start another payment."
                        : terminal
                          ? "Any uncollected authorization is being released where possible."
                          : "One agreed fee, with no extra charge for resubmitting."}
                  </p>
                </div>
              </section>
              {a.state === "REVIEW_HOLD" && (
                <div className="notice warning">
                  <div>
                    <strong>
                      {a.holdReason === "CONTENT_CHANGED"
                        ? "The page changed after review"
                        : "Changes requested"}
                    </strong>
                    <p>
                      {a.changeRequest ||
                        "Publish an updated revision, then submit it again. Payment remains uncharged."}
                    </p>
                  </div>
                </div>
              )}
              {s?.state === "CAPTURING" && (
                <div className="notice info" role="status">
                  <Loading message="Capturing the updated page. You can leave and return later." />
                </div>
              )}
              {a.payment.error && <ErrorBox message={a.payment.error} />}
            </>
          )}
          <details
            className={paid ? "completed-work" : "current-work"}
            open={!paid}
          >
            <summary>
              {paid
                ? "View the approved work"
                : "View the agreement and submitted work"}
            </summary>
            <section className="agreement-document">
              <div className="section-top">
                <div>
                  <p className="eyebrow">
                    {s ? "THE SUBMITTED WORK" : "THE AGREEMENT"}
                  </p>
                  <h2>{s ? "Review each agreed change" : "What’s included"}</h2>
                </div>
                {a.digest && (
                  <span className="locked-terms">
                    <LockKeyhole size={15} />
                    Agreed terms
                  </span>
                )}
              </div>
              <ol className="requirement-list">
                {a.requirements.map((r, i) => {
                  const finding = findings?.find((f) => f.id === r.id);
                  return (
                    <li key={r.id}>
                      <span
                        className={
                          "requirement-marker " +
                          (finding?.status === "SATISFIED" ? "met" : "")
                        }
                      >
                        {finding?.status === "SATISFIED" ? (
                          <Check size={17} />
                        ) : (
                          i + 1
                        )}
                      </span>
                      <div>
                        <p className="requirement-text">{r.description}</p>
                        {finding && (
                          <div
                            className={
                              "finding " +
                              (finding.status === "SATISFIED"
                                ? "met"
                                : "needs-change")
                            }
                          >
                            <strong>
                              {finding.status === "SATISFIED"
                                ? "Check met"
                                : finding.status === "UNSATISFIED"
                                  ? "Needs a change"
                                  : "Please review"}
                            </strong>
                            <p>{finding.reason}</p>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
              {s?.state === "READY" && !findings && (
                <p className="check-explanation">
                  {["FAILED", "UNKNOWN"].includes(s.verification.status) ||
                  ["FAILED", "UNKNOWN"].includes(a.contract.state)
                    ? "AI findings aren’t available. Review the captured page below to make your decision."
                    : "AI checks are running. You can review the captured page now; the client decides whether to pay."}
                </p>
              )}
              {s?.evidence && (
                <details className="evidence-details">
                  <summary>View the captured page and evidence</summary>
                  {s.evidence.screenshotHash && (
                    <img
                      className="evidence-image"
                      alt="The submitted website page captured for this review"
                      src={
                        "/api/agreements/" +
                        id +
                        "/image?hash=" +
                        encodeURIComponent(s.evidence.screenshotHash)
                      }
                    />
                  )}
                  <p>Captured {formatDate(s.evidence.capturedAt)}</p>
                  {s.evidence.blocks.map((b) => (
                    <p key={b.id}>{b.text}</p>
                  ))}
                  {s.evidence.links.map((l) => (
                    <p key={l.id}>
                      <strong>{l.text}</strong> →{" "}
                      <span className="url-text">{l.href}</span>
                    </p>
                  ))}
                </details>
              )}
            </section>
          </details>
          {!paid && !terminal && (
            <section className="next-step" id="next-step">
              {a.state === "DRAFT" ? (
                <>
                  <p className="eyebrow">REVIEW BEFORE SENDING</p>
                  <h2>
                    {demo
                      ? "A shared starting point"
                      : "Review, then create your client’s link"}
                  </h2>
                  <p>
                    The page, requirements and fee will be locked when you
                    create the link. The client has a clear chance to review
                    everything before authorizing payment.
                  </p>
                  <div className="terms-note">
                    <strong>How the payment works</strong>
                    <p>
                      After authorization, submit within 48 hours. Client
                      approval and payment must happen within 70 hours. Up to
                      three submissions. Requirements and captured page evidence
                      may be published for experimental AI checks; contact
                      emails stay private.
                    </p>
                  </div>
                  <div role="status" className="page-check">
                    {a.baselineStatus === "READY" ? (
                      <>
                        <Check size={18} />
                        Page captured and ready
                      </>
                    ) : a.baselineStatus === "FAILED" ? (
                      <>
                        <ErrorBox
                          message={
                            a.lastError || "We couldn't capture this page."
                          }
                        />
                        <Button
                          className="secondary"
                          busy={busy === "retry-baseline"}
                          onClick={() => action("retry-baseline")}
                        >
                          Check page again
                        </Button>
                      </>
                    ) : (
                      <Loading message="Checking that this page can be captured…" />
                    )}
                  </div>
                  {!demo && setup && !setup.connected && (
                    <div className="notice warning">
                      <div>
                        <strong>First, connect your PayPal account</strong>
                        <p>
                          Your draft is saved. Connect your{" "}
                          {a.mode === "sandbox"
                            ? "sandbox Business"
                            : "Business"}{" "}
                          account, then return to share this agreement.
                        </p>
                        <Link
                          className="button"
                          href={
                            "/settings?returnTo=" +
                            encodeURIComponent(agreementHref(a))
                          }
                        >
                          Connect PayPal and return →
                        </Link>
                      </div>
                    </div>
                  )}
                  {!demo && setup && !setup.liveAvailable && (
                    <ErrorBox message="Live payments are not enabled. You can save this draft, but it cannot be shared for payment yet." />
                  )}
                  <div className="action-row">
                    <Button
                      disabled={
                        Boolean(busy) ||
                        a.baselineStatus !== "READY" ||
                        (!demo && (!setup?.connected || !setup.liveAvailable))
                      }
                      busy={busy === "freeze"}
                      onClick={() =>
                        action("freeze", {
                          draftRevision: a.draftRevision || 0,
                        })
                      }
                    >
                      {demo
                        ? "Continue to client review"
                        : "Create client link"}
                      <ArrowRight size={18} />
                    </Button>
                    {!demo && (
                      <>
                        <Link
                          className="text-link"
                          href={"/agreements/new?draft=" + id}
                        >
                          Edit agreement
                        </Link>
                        <Link
                          className="text-link"
                          href={
                            "/settings?returnTo=" +
                            encodeURIComponent(agreementHref(a))
                          }
                        >
                          Payment setup
                        </Link>
                      </>
                    )}
                  </div>
                  {!demo && (
                    <p className="small-text">
                      {setup?.emailAvailable && a.clientEmail
                        ? "We’ll also queue an invitation email for " +
                          a.clientEmail +
                          "."
                        : "You’ll copy and share a private link. No email will be sent automatically."}
                    </p>
                  )}
                </>
              ) : a.state === "AWAITING_BUYER" ? (
                seller ? (
                  <>
                    <h2>Your client has the next step.</h2>
                    <p>
                      Share the private invitation so {a.clientName} can review
                      the agreement and authorize {amount}.
                    </p>
                    {!invitationRedeemed &&
                      a.payment.status === "NONE" &&
                      !link && (
                        <Button
                          className="secondary"
                          busy={busy === "invite"}
                          onClick={() => action("invite")}
                        >
                          Create a fresh invitation link
                        </Button>
                      )}
                    <p className="small-text">
                      {invitationRedeemed
                        ? "Your client has opened the invitation. They can return to the agreement in that browser" +
                          (a.clientEmail
                            ? ", or sign in with the Google account matching the invited email."
                            : ". Keep that browser’s agreement address; no email recovery is set up for this test.")
                        : "If you reload before copying the link, create a fresh one here. The previous unused link will stop working."}
                    </p>
                  </>
                ) : (
                  <>
                    <h2>
                      {legacy
                        ? "Review the original agreement before authorizing"
                        : "Review now. Approve payment after the work."}
                    </h2>
                    <p>
                      You’ll authorize {amount} with PayPal.{" "}
                      {legacy
                        ? "Under these original terms, successful finalized checks and a matching fresh page can trigger collection. You can request review beforehand."
                        : "This may place a temporary hold, but the fee is collected only after you approve a submitted revision."}
                    </p>
                    <div className="terms-note">
                      <p>
                        The freelancer has 48 hours to submit, with up to three
                        submissions. Review and approve within 70 hours of
                        authorization. Requirements and public page evidence may
                        be published for AI checks.{" "}
                        {legacy
                          ? "These original terms permit automatic collection after successful checks."
                          : "AI advice is experimental; you decide whether to pay."}
                      </p>
                    </div>
                    <label className="consent">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => setChecked(e.target.checked)}
                      />
                      <span>
                        I agree to these requirements, the {amount} fee and the
                        payment conditions above.
                      </span>
                    </label>
                    {a.mode === "sandbox" && <SandboxHelp />}
                    <Button
                      disabled={!checked || Boolean(busy) || pending}
                      busy={Boolean(busy)}
                      onClick={pay}
                    >
                      {demo
                        ? "Simulate authorization"
                        : a.payment.status === "ORDER_CREATED"
                          ? "Resume PayPal approval"
                          : "Authorize " + amount + " with PayPal"}
                      <ArrowRight size={18} />
                    </Button>
                    {a.mode === "sandbox" && (
                      <p className="small-text">
                        Use a PayPal sandbox personal account. No real money is
                        charged.{" "}
                        <Link href="/help#paypal">Trouble signing in?</Link>
                      </p>
                    )}
                  </>
                )
              ) : pending ? (
                <>
                  <h2>Confirming with PayPal</h2>
                  <p>
                    This page updates automatically. A delayed response will be
                    reconciled before another payment action is allowed.
                  </p>
                </>
              ) : authorized && seller ? (
                <>
                  <h2>
                    {s
                      ? a.state === "REVIEW_HOLD"
                        ? "Make the requested changes"
                        : s.state === "FAILED"
                          ? "Try submitting the page again"
                          : "Your submitted revision"
                      : "Ready when your changes are published"}
                  </h2>
                  <p>
                    {a.submissions.length} of 3 submissions used. Submit by{" "}
                    {formatDate(a.payment.submissionDeadline)}.
                  </p>
                  {a.changeRequest && (
                    <blockquote>{a.changeRequest}</blockquote>
                  )}
                  {canSubmit ? (
                    <>
                      {s?.state === "READY" && a.state !== "REVIEW_HOLD" && (
                        <p>
                          Your client can review the captured work now. Submit
                          another version only if you have changed the page;
                          this uses another submission.
                        </p>
                      )}
                      {testPage && (
                        <label>
                          Test revision to publish
                          <select
                            value={testVersion}
                            onChange={(e) =>
                              setTestVersion(
                                e.target.value as "incomplete" | "corrected",
                              )
                            }
                          >
                            <option value="corrected">
                              Completed changes — ready for client review
                            </option>
                            <option value="incomplete">
                              One mistake — try requesting a change
                            </option>
                          </select>
                          <span className="field-help">
                            We’ll update your sample page, capture it and check
                            the agreed requirements.
                          </span>
                        </label>
                      )}
                      <label>
                        What changed? <span className="optional">Optional</span>
                        <textarea
                          rows={2}
                          maxLength={500}
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="A short note for your client"
                        />
                      </label>
                      <Button
                        disabled={Boolean(busy)}
                        busy={busy === "submit" || busy === "variant"}
                        onClick={submit}
                      >
                        {demo
                          ? a.submissions.length
                            ? "Submit corrected page"
                            : "Submit first revision"
                          : testPage
                            ? "Publish and check revision"
                            : "Check updated page"}
                        <ArrowRight size={18} />
                      </Button>
                    </>
                  ) : (
                    <p>
                      {Date.parse(a.payment.submissionDeadline || "") <=
                      Date.now()
                        ? "The deadline for new submissions has passed. Your client can still review already captured work before the approval deadline."
                        : a.submissions.length >= 3
                          ? "All three submissions have been used. Your client can still review the captured work before the payment deadline."
                          : s?.state === "READY"
                            ? "Waiting for your client to review the work. Return to this agreement to see their response."
                            : "The current page check is still in progress. Your work is saved."}
                    </p>
                  )}
                </>
              ) : authorized && !seller ? (
                <>
                  {s?.evidence?.complete ? (
                    <>
                      <h2>
                        {requesting
                          ? "What needs to change?"
                          : "Your review. Your decision."}
                      </h2>
                      <p>
                        Approving collects {amount} for this captured revision.
                        Please review the work and any findings before
                        continuing.
                      </p>
                      {unmet && (
                        <div className="notice warning">
                          Some checks need attention. Approving still accepts
                          this revision and charges the agreed fee.
                        </div>
                      )}
                      {requesting ? (
                        <>
                          <label>
                            Tell your freelancer what to fix
                            <textarea
                              autoFocus
                              rows={3}
                              value={note}
                              maxLength={1000}
                              onChange={(e) => setNote(e.target.value)}
                              placeholder="Describe the change you need."
                            />
                          </label>
                          <div className="action-row">
                            <Button
                              disabled={note.trim().length < 5 || Boolean(busy)}
                              busy={busy === "hold"}
                              onClick={async () => {
                                if (await action("hold", { note })) {
                                  setRequesting(false);
                                  setNote("");
                                }
                              }}
                            >
                              Send change request
                            </Button>
                            <Button
                              className="secondary"
                              onClick={() => setRequesting(false)}
                            >
                              Back to review
                            </Button>
                          </div>
                        </>
                      ) : (
                        <div className="action-row">
                          <Button
                            disabled={
                              Boolean(busy) ||
                              Date.parse(a.payment.captureDeadline || "") <=
                                Date.now()
                            }
                            busy={busy === "accept"}
                            onClick={() =>
                              action("accept", {
                                submissionId: s.id,
                                artifactHash: s.evidence!.artifactHash,
                              })
                            }
                          >
                            {demo
                              ? "Simulate approval and payment"
                              : "Approve and pay " + amount}
                            <ArrowRight size={18} />
                          </Button>
                          <Button
                            className="secondary"
                            disabled={Boolean(busy)}
                            onClick={() => {
                              setNote(
                                demo
                                  ? "Please remove the annual commitment and termination fee."
                                  : "",
                              );
                              setRequesting(true);
                            }}
                          >
                            Request changes
                          </Button>
                        </div>
                      )}
                      <p className="small-text">
                        Approval window ends{" "}
                        {formatDate(a.payment.captureDeadline)}.
                      </p>
                    </>
                  ) : (
                    <>
                      <h2>Your freelancer can get started.</h2>
                      <p>
                        Return using your private agreement link to see when the
                        captured revision is ready. Your payment remains
                        authorized and uncharged.
                      </p>
                    </>
                  )}
                </>
              ) : (
                <>
                  <h2>Your agreement is saved.</h2>
                  <p>Check the payment message above for the next step.</p>
                </>
              )}
            </section>
          )}
          <details className="record-details">
            <summary>Agreement history and technical record</summary>
            <p>
              {demo
                ? "Simulated evidence and payment identifiers."
                : "GenLayer Studionet is a development network. Checks are experimental advice; client approval determines payment for new agreements."}
            </p>
            <ShortHash label="Agreement" value={a.digest} />
            <ShortHash label="Merchant" value={a.payment.merchantId} />
            <ShortHash
              label="PayPal authorization"
              value={a.payment.authorizationId}
            />
            <ShortHash label="PayPal payment" value={a.payment.captureId} />
            <ShortHash
              label="Verification transaction"
              value={s?.verification.txId}
            />
            <ol className="history-list">
              {a.events
                .slice()
                .reverse()
                .map((e) => (
                  <li key={e.id}>
                    <p>{e.message}</p>
                    <time>{formatDate(e.at)}</time>
                  </li>
                ))}
            </ol>
          </details>
          {!paid && !terminal && !pending && (
            <div className="cancel-area">
              {canceling ? (
                <>
                  <p>
                    Cancel this agreement? Any uncollected authorization will be
                    released where possible. This cannot undo an already
                    processed payment.
                  </p>
                  <div className="action-row">
                    <Button
                      className="danger"
                      busy={busy === "cancel"}
                      onClick={() => action("cancel")}
                    >
                      Cancel agreement
                    </Button>
                    <Button
                      className="secondary"
                      onClick={() => setCanceling(false)}
                    >
                      Keep agreement
                    </Button>
                  </div>
                </>
              ) : (
                <button
                  className="text-link"
                  onClick={() => setCanceling(true)}
                >
                  Cancel agreement
                </button>
              )}
            </div>
          )}
          {(paid || terminal) && seller && !demo && (
            <Link
              className="button secondary"
              href={
                a.testTemplateId
                  ? "/workspace#templates"
                  : "/agreements/new?copy=" + id
              }
            >
              Create another revision <ArrowRight size={18} />
            </Link>
          )}
          {paid && demo && (
            <div className="demo-finish">
              <h2>Ready to use your own page?</h2>
              <p>
                Your real workspace keeps your clients, agreements and payment
                setup separate from this example.
              </p>
              <Link className="button" href="/workspace">
                Open real workspace <ArrowRight size={18} />
              </Link>
            </div>
          )}
        </>
      )}
    </Shell>
  );
}
