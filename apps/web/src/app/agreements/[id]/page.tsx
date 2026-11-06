"use client";
import Link from "next/link";
import { use, useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  FileCheck2,
  Globe2,
  Info,
  Link2,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import {
  money,
  currentSubmission,
  MONEY_IN_FLIGHT,
  type Actor,
  type Agreement,
  type Evidence,
} from "@revisionpay/domain";
import { VARIANTS } from "@revisionpay/domain/fixtures";
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
} from "@/components/ui";
import { Northstar } from "@/components/northstar";

export default function AgreementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [a, setA] = useState<Agreement>();
  const [who, setWho] = useState<Actor>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [tab, setTab] = useState("Overview");
  const [consented, setConsented] = useState(false);
  const [invitation, setInvitation] = useState("");
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState<"accept" | "cancel" | null>(null);
  const [manualConsent, setManualConsent] = useState(false);
  const autoAuthorize = useRef(false);
  const refresh = useCallback(async () => {
    try {
      const data = await api("agreements/" + id);
      setA(data.agreement);
      setWho(data.actor);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 1800);
    return () => clearInterval(timer);
  }, [refresh]);
  async function action(name: string, data = {}): Promise<any> {
    setBusy(name);
    setError("");
    try {
      const result = await api(`agreements/${id}/${name}`, data);
      if (result.agreement) setA(result.agreement);
      if (result.invitationUrl) {
        setInvitation(result.invitationUrl);
        setCopied(false);
      }
      await refresh();
      return result;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy("");
    }
  }
  useEffect(() => {
    if (
      a?.payment.status === "ORDER_CREATED" &&
      who?.role === "buyer" &&
      new URLSearchParams(location.search).get("paypal") === "approved" &&
      !autoAuthorize.current
    ) {
      autoAuthorize.current = true;
      history.replaceState(null, "", location.pathname);
      void action("authorize");
    }
  }, [a?.payment.status, who?.role]);
  async function pay() {
    if (!a) return;
    if (!(await action("consent", { digest: a.digest }))) return;
    const order = await action("checkout");
    if (!order) return;
    if (a.mode === "demo") await action("authorize");
    else if (order.approvalUrl) location.assign(order.approvalUrl);
  }
  const s = a ? currentSubmission(a) : undefined;
  const seller = who?.role === "seller";
  const isPaid = a?.payment.status === "PAID";
  const frozen = Boolean(a?.digest);
  const authorized = Boolean(a?.payment.authorizationId);
  const findings = s?.verification.result?.criteria;
  const final = s?.verification.status === "FINALIZED";
  const pass = final && s?.verification.result?.verdict === "PASS";
  const canSubmit =
    a &&
    ["ACTIVE", "REVIEW_HOLD"].includes(a.state) &&
    a.payment.status === "AUTHORIZED" &&
    a.submissions.length < 3 &&
    Date.parse(a.payment.submissionDeadline || "") > Date.now() &&
    (!s ||
      s.state === "FAILED" ||
      ["FINALIZED", "FAILED"].includes(s.verification.status));
  const workPending =
    a &&
    (a.baselineStatus === "QUEUED" ||
      (authorized &&
        a.contract.state !== "READY" &&
        !["FAILED", "UNKNOWN"].includes(a.contract.state)) ||
      (s &&
        !["FINALIZED", "FAILED", "UNKNOWN"].includes(s.verification.status)));
  return (
    <Shell who={who} onRole={() => void refresh()} title="Agreement">
      <Link className="back-link" href="/workspace">
        <ArrowLeft size={15} />
        All agreements
      </Link>
      <ErrorBox message={error} />
      {!a ? (
        error ? (
          <div className="empty panel">
            <h2>Open your agreement securely.</h2>
            <p>
              Use your buyer invitation or return to your signed-in workspace.
            </p>
            <Link href="/login" className="button">
              Sign in <ArrowRight size={16} />
            </Link>
          </div>
        ) : (
          <Loading message="Opening your agreement…" />
        )
      ) : (
        <>
          <div className="page-heading agreement-heading">
            <div>
              <div className="heading-meta">
                <span className="eyebrow">
                  AGREEMENT · {a.id.slice(0, 8).toUpperCase()}
                </span>
                <Status agreement={a} />
              </div>
              <h1>{a.title}</h1>
              <p>
                <span className="inline-avatar">{a.clientName[0]}</span>
                {a.clientName}
                <span className="dot-separator">·</span>Created{" "}
                {formatDate(a.createdAt)}
              </p>
            </div>
            <a
              className="button secondary small"
              href={a.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              <Globe2 size={16} />
              Open page <ArrowUpRight size={15} />
            </a>
          </div>
          <div className="progress-track">
            {[
              {
                title: "Agreement",
                detail: frozen ? "Terms frozen" : "Set the requirements",
                complete: frozen,
              },
              {
                title: "Authorization",
                detail: authorized ? "Buyer approved" : "Buyer approval",
                complete: authorized,
              },
              {
                title: "Verification",
                detail: final
                  ? pass
                    ? "All requirements pass"
                    : "Findings ready"
                  : "Review the evidence",
                complete: pass || Boolean(a.manualAcceptanceId),
              },
              {
                title: "Payment",
                detail: isPaid
                  ? "Collection complete"
                  : "Collect when accepted",
                complete: isPaid,
              },
            ].map((step, i) => (
              <div
                key={step.title}
                className={"progress-step " + (step.complete ? "complete" : "")}
              >
                <span>{step.complete ? <Check size={15} /> : i + 1}</span>
                <div>
                  <strong>{step.title}</strong>
                  <small>{step.detail}</small>
                </div>
                {i < 3 && <div className="step-line" />}
              </div>
            ))}
          </div>
          <div className="detail-grid">
            <div className="detail-main">
              <div
                className="content-tabs"
                role="tablist"
                aria-label="Agreement sections"
              >
                {["Overview", "Evidence", "Activity", "Receipt"].map((t) => (
                  <button
                    key={t}
                    role="tab"
                    aria-selected={t === tab}
                    className={tab === t ? "selected" : ""}
                    onClick={() => setTab(t)}
                  >
                    {t}
                    {t === "Evidence" && a.submissions.length > 0 && (
                      <span>{a.submissions.length + 1}</span>
                    )}
                  </button>
                ))}
              </div>
              {tab === "Overview" && (
                <>
                  {isPaid ? (
                    <div className="result-banner success">
                      <CheckCheck size={26} />
                      <div>
                        <h2>The loop is closed.</h2>
                        <p>
                          {a.mode === "demo"
                            ? "The simulated payment is complete. No real money moved."
                            : "PayPal sandbox confirmed the revision payment."}{" "}
                          {a.manualAcceptanceId
                            ? "The buyer accepted this version directly."
                            : "The submitted work passed every agreed requirement."}
                        </p>
                      </div>
                    </div>
                  ) : a.state === "REVIEW_HOLD" ? (
                    <div className="result-banner warning">
                      <ShieldCheck size={25} />
                      <div>
                        <h2>Payment is on hold.</h2>
                        <p>
                          {a.holdReason === "BUYER"
                            ? "The buyer requested review. Only their explicit acceptance can clear this hold."
                            : "The page changed after verification. Submit the current version for a new review."}
                        </p>
                      </div>
                    </div>
                  ) : final && !pass ? (
                    <div className="result-banner warning">
                      <FileCheck2 size={25} />
                      <div>
                        <h2>
                          {s?.verification.result?.verdict === "REVISE"
                            ? "One more revision. Same agreement."
                            : "This version needs a closer look."}
                        </h2>
                        <p>
                          {s?.verification.result?.verdict === "REVISE"
                            ? "Review the finding below, update the page, and submit again. Nothing has been charged."
                            : "The verifier could not establish every requirement. Funds remain uncollected."}
                        </p>
                      </div>
                    </div>
                  ) : workPending ? (
                    <div className="result-banner processing">
                      <LoaderCircle className="spin" size={23} />
                      <div>
                        <h2>
                          {a.baselineStatus === "QUEUED"
                            ? "Capturing the original page…"
                            : a.contract.state !== "READY"
                              ? "Preparing the agreement verifier…"
                              : s?.state === "CAPTURING"
                                ? "Capturing this revision…"
                                : "Checking the agreed requirements…"}
                        </h2>
                        <p>
                          {a.mode === "demo"
                            ? "This is the simulated workflow. Results update automatically."
                            : "The job is saved. You can leave this page and return when the result is ready."}
                        </p>
                      </div>
                    </div>
                  ) : null}
                  <ErrorBox
                    message={
                      a.lastError || a.contract.error || s?.verification.error
                    }
                  />
                  <section className="panel criteria-panel">
                    <div className="panel-title">
                      <span className="panel-icon">
                        <FileCheck2 size={20} />
                      </span>
                      <div>
                        <h2>The shared definition of done</h2>
                        <p>
                          {frozen
                            ? "Frozen requirements · unchanged across every revision"
                            : "Review these requirements before sharing with your buyer"}
                        </p>
                      </div>
                      {frozen && (
                        <LockKeyhole className="muted-icon" size={17} />
                      )}
                    </div>
                    <div className="criteria-list">
                      {a.requirements.map((r) => {
                        const f = final
                          ? findings?.find((f) => f.id === r.id)
                          : undefined;
                        return (
                          <article
                            key={r.id}
                            className={
                              f
                                ? "criterion " + f.status.toLowerCase()
                                : "criterion"
                            }
                          >
                            <span className="requirement-id">
                              {f?.status === "SATISFIED" ? (
                                <Check size={15} />
                              ) : f?.status === "UNSATISFIED" ? (
                                <X size={15} />
                              ) : (
                                r.id
                              )}
                            </span>
                            <div>
                              <div className="criterion-heading">
                                <h3>{r.title}</h3>
                                {f && (
                                  <span
                                    className={
                                      "finding-state " + f.status.toLowerCase()
                                    }
                                  >
                                    {f.status === "SATISFIED"
                                      ? "Satisfied"
                                      : f.status === "UNSATISFIED"
                                        ? "Needs revision"
                                        : "Unverifiable"}
                                  </span>
                                )}
                              </div>
                              <p>{r.description}</p>
                              {f && (
                                <div className="finding">
                                  <strong>
                                    {a.mode === "demo"
                                      ? "SIMULATED FINDING"
                                      : "VERIFIER FINDING"}
                                  </strong>
                                  <p>{f.reason}</p>
                                  <div className="citation-links">
                                    {f.evidenceBlockIds.map((ref) => (
                                      <button
                                        key={ref}
                                        onClick={() => setTab("Evidence")}
                                      >
                                        <Link2 size={12} />
                                        {ref}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                    <div className="panel-footnote">
                      <Info size={14} />
                      Checks cover visible copy and link targets on this page.
                    </div>
                  </section>
                  {seller && a.state === "DRAFT" && (
                    <section className="panel action-panel">
                      <h2>Ready to make it official?</h2>
                      <p>
                        The original page is{" "}
                        {a.baselineStatus === "READY"
                          ? "captured. Freeze these requirements to create a buyer invitation."
                          : a.baselineStatus === "FAILED"
                            ? "not captured yet. Check the capture settings, then retry."
                            : "being captured. You can freeze the agreement once it’s ready."}
                      </p>
                      <Button
                        busy={busy === "freeze"}
                        disabled={Boolean(busy) || a.baselineStatus !== "READY"}
                        onClick={() => action("freeze")}
                      >
                        Freeze & create invitation <ArrowRight size={16} />
                      </Button>
                      {a.baselineStatus === "FAILED" && (
                        <Button
                          className="secondary"
                          onClick={() => action("retry-baseline")}
                          busy={busy === "retry-baseline"}
                        >
                          Retry original-page capture
                        </Button>
                      )}
                    </section>
                  )}
                  {seller && a.state === "AWAITING_BUYER" && (
                    <section className="panel action-panel">
                      <div className="panel-title">
                        <Link2 size={20} />
                        <div>
                          <h2>Bring your buyer into the agreement.</h2>
                          <p>
                            {a.mode === "demo"
                              ? "Switch to buyer view to review the terms and simulate authorization."
                              : "Share the invitation privately. Your buyer can review the terms without a crypto wallet."}
                          </p>
                        </div>
                      </div>
                      {invitation ? (
                        <div className="invite-copy">
                          <input
                            aria-label="Buyer invitation link"
                            readOnly
                            value={invitation}
                          />
                          <Button
                            className="secondary small"
                            onClick={async () => {
                              await navigator.clipboard.writeText(invitation);
                              setCopied(true);
                            }}
                          >
                            {copied ? <Check size={15} /> : <Copy size={15} />}
                            {copied ? "Copied" : "Copy link"}
                          </Button>
                        </div>
                      ) : (
                        !a.invitation?.redeemedAt &&
                        a.payment.status === "NONE" && (
                          <Button
                            className="secondary"
                            onClick={() => action("invite")}
                            busy={busy === "invite"}
                          >
                            Create a fresh invitation <Link2 size={16} />
                          </Button>
                        )
                      )}
                      {a.mode === "demo" && (
                        <Button
                          className="secondary"
                          onClick={async () => {
                            await api("demo/role", { role: "buyer" });
                            await refresh();
                          }}
                        >
                          Continue as buyer <ArrowRight size={16} />
                        </Button>
                      )}
                    </section>
                  )}
                  {seller &&
                    authorized &&
                    a.state !== "CLOSED" &&
                    a.state !== "CANCELED" && (
                      <section className="panel action-panel">
                        <div className="panel-title">
                          <span className="panel-icon">
                            <Sparkles size={20} />
                          </span>
                          <div>
                            <h2>
                              {a.submissions.length
                                ? "Make the next revision count."
                                : "The agreement is ready for your work."}
                            </h2>
                            <p>
                              {a.submissions.length} of 3 submissions used ·
                              Submit by{" "}
                              {formatDate(a.payment.submissionDeadline)}
                            </p>
                          </div>
                        </div>
                        {a.sourceUrl.includes("/demo-site/" + a.id) && (
                          <div className="demo-editor">
                            <label htmlFor="variant">
                              Example page version
                            </label>
                            <div>
                              <select
                                id="variant"
                                value={a.demoVariant}
                                disabled={Boolean(busy)}
                                onChange={(e) =>
                                  action("variant", { variant: e.target.value })
                                }
                              >
                                {VARIANTS.map((v) => (
                                  <option key={v.id} value={v.id}>
                                    {v.label}
                                  </option>
                                ))}
                              </select>
                              <a
                                href={a.sourceUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="icon-button"
                                aria-label="Preview example page"
                              >
                                <ExternalLink size={17} />
                              </a>
                            </div>
                            <small>
                              {
                                VARIANTS.find((v) => v.id === a.demoVariant)
                                  ?.description
                              }
                            </small>
                          </div>
                        )}
                        <label className="note-label" htmlFor="revision-note">
                          Revision note <span>Optional</span>
                        </label>
                        <textarea
                          id="revision-note"
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          maxLength={500}
                          placeholder="What changed in this version?"
                          rows={2}
                        />
                        <div className="action-row">
                          <Button
                            disabled={!canSubmit || Boolean(busy)}
                            busy={busy === "submit"}
                            onClick={async () => {
                              if (await action("submit", { note })) setNote("");
                            }}
                          >
                            Submit for verification <ArrowRight size={16} />
                          </Button>
                          <span>
                            <LockKeyhole size={13} />
                            The agreed fee stays {money(a.amountMinor)}.
                          </span>
                        </div>
                      </section>
                    )}
                  {!seller && a.state === "AWAITING_BUYER" && (
                    <section className="panel buyer-consent">
                      <div className="panel-title">
                        <ShieldCheck size={23} />
                        <div>
                          <h2>Your approval starts the work.</h2>
                          <p>
                            Authorize {money(a.amountMinor)} for this revision.
                          </p>
                        </div>
                      </div>
                      <p>
                        We will charge this amount once after the agreed checks
                        pass and verification is final, or if you explicitly
                        approve the submitted version yourself. You can request
                        review before charging starts.
                      </p>
                      <p>
                        The seller has 48 hours after authorization to submit.
                        Collection must start within 70 hours; otherwise, we
                        will cancel the uncollected authorization where
                        possible.
                      </p>
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={consented}
                          onChange={(e) => setConsented(e.target.checked)}
                        />
                        <span>
                          I accept these exact requirements, the{" "}
                          {money(a.amountMinor)} fee, and the collection
                          conditions. I understand that public page evidence and
                          verification records may remain visible on Studionet.
                        </span>
                      </label>
                      <Button
                        className={a.mode === "demo" ? "" : "paypal-button"}
                        onClick={pay}
                        disabled={!consented || Boolean(busy)}
                        busy={
                          busy === "consent" ||
                          busy === "checkout" ||
                          busy === "authorize"
                        }
                      >
                        {a.mode === "demo"
                          ? "Simulate authorization"
                          : "Authorize with PayPal sandbox"}
                        <ArrowRight size={16} />
                      </Button>
                      {a.payment.status === "ORDER_CREATED" && (
                        <Button
                          className="secondary"
                          disabled={Boolean(busy)}
                          onClick={() => action("authorize")}
                        >
                          I’ve approved in PayPal — continue
                        </Button>
                      )}
                      <small className="consent-footnote">
                        <LockKeyhole size={13} />
                        {a.mode === "demo"
                          ? "No PayPal login. No real money. Simulated authorization only."
                          : "You’ll approve securely with your PayPal sandbox buyer account."}
                      </small>
                    </section>
                  )}
                  {!seller && a.payment.status === "AUTHORIZED" && (
                    <section className="panel buyer-actions">
                      <h2>Your review stays in your hands.</h2>
                      <p>
                        You can pause automatic collection while you discuss the
                        work. If you’re satisfied with the captured version, you
                        can also accept it directly.
                      </p>
                      <div className="action-row">
                        <Button
                          className="secondary"
                          disabled={Boolean(busy) || a.holdReason === "BUYER"}
                          onClick={() => action("hold")}
                          busy={busy === "hold"}
                        >
                          Request review <ShieldCheck size={16} />
                        </Button>
                        {s?.evidence && (
                          <Button
                            className="text-button"
                            onClick={() => {
                              setConfirm("accept");
                              setManualConsent(false);
                            }}
                          >
                            Accept this version myself <ArrowRight size={15} />
                          </Button>
                        )}
                      </div>
                      {confirm === "accept" && s?.evidence && (
                        <div className="inline-confirm">
                          <h3>
                            Accept revision {s.revision} for{" "}
                            {money(a.amountMinor)}?
                          </h3>
                          <p>
                            This records your direct approval of the captured
                            version and permits collection after a fresh
                            matching page check. The verifier’s findings stay
                            unchanged.
                          </p>
                          <label className="checkbox-label">
                            <input
                              type="checkbox"
                              checked={manualConsent}
                              onChange={(e) =>
                                setManualConsent(e.target.checked)
                              }
                            />
                            <span>
                              I have reviewed this captured revision and approve
                              the {money(a.amountMinor)} payment.
                            </span>
                          </label>
                          <Button
                            disabled={!manualConsent || Boolean(busy)}
                            busy={busy === "accept"}
                            onClick={async () => {
                              await action("accept", {
                                submissionId: s.id,
                                artifactHash: s.evidence!.artifactHash,
                              });
                              setConfirm(null);
                            }}
                          >
                            Approve this version & payment
                          </Button>
                          <Button
                            className="text-button"
                            onClick={() => setConfirm(null)}
                          >
                            Keep reviewing
                          </Button>
                        </div>
                      )}
                    </section>
                  )}
                </>
              )}
              {tab === "Evidence" && <EvidencePanel agreement={a} />}
              {tab === "Activity" && (
                <section className="panel activity-panel">
                  <div className="panel-title">
                    <Clock3 size={20} />
                    <div>
                      <h2>The complete handoff</h2>
                      <p>Every material step, in one shared timeline.</p>
                    </div>
                  </div>
                  <ol className="timeline">
                    {[...a.events].reverse().map((event) => (
                      <li key={event.id}>
                        <span className="timeline-dot">
                          <Check size={12} />
                        </span>
                        <div>
                          <p>{event.message}</p>
                          <small>
                            {event.actor} · {formatDate(event.at)}
                          </small>
                          {event.refs &&
                            Object.entries(event.refs).map(([name, value]) => (
                              <code key={name} title={value}>
                                {name}:{" "}
                                {value.length > 50
                                  ? value.slice(0, 28) + "…"
                                  : value}
                              </code>
                            ))}
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
              )}
              {tab === "Receipt" && <Receipt agreement={a} />}
            </div>
            <aside className="detail-aside">
              <section className="panel payment-card">
                <div className="payment-card-top">
                  <span>REVISION PAYMENT</span>
                  <LockKeyhole size={16} />
                </div>
                <div className="amount">
                  {money(a.amountMinor)}
                  <span>USD</span>
                </div>
                <p className="payment-description">One page. One agreed fee.</p>
                <div className="payment-state">
                  <span
                    className={"payment-state-icon " + (isPaid ? "paid" : "")}
                  >
                    {isPaid ? (
                      <CheckCheck size={20} />
                    ) : (
                      <ShieldCheck size={20} />
                    )}
                  </span>
                  <div>
                    <strong>
                      {isPaid
                        ? "Payment completed"
                        : a.payment.status === "AUTHORIZED"
                          ? "Authorized · not charged"
                          : ["VOIDED", "EXPIRED"].includes(a.payment.status)
                            ? "Authorization canceled"
                            : MONEY_IN_FLIGHT.includes(a.payment.status)
                              ? "Confirming with PayPal"
                              : "Awaiting authorization"}
                    </strong>
                    <small>
                      {a.mode === "demo"
                        ? "Simulation · no money moves"
                        : "PayPal sandbox · test funds"}
                    </small>
                  </div>
                </div>
                <ErrorBox message={a.payment.error} />
                <div className="payment-breakdown">
                  <div>
                    <span>Revision fee</span>
                    <strong>{money(a.amountMinor)}</strong>
                  </div>
                  <div>
                    <span>Charged so far</span>
                    <strong data-testid="charged-amount">
                      {money(isPaid ? a.amountMinor : 0)}
                    </strong>
                  </div>
                </div>
                <div className="payment-rule">
                  <ShieldCheck size={17} />
                  <p>
                    {isPaid
                      ? a.manualAcceptanceId
                        ? "Collected after direct buyer acceptance."
                        : "Collected after final verification and a matching page check."
                      : "Collection requires a final PASS and a matching page, or explicit buyer acceptance."}
                  </p>
                </div>
                {a.payment.adjustment && (
                  <Badge tone="amber">
                    {a.payment.adjustment.replaceAll("_", " ")}
                  </Badge>
                )}
                {authorized && (
                  <div className="deadlines">
                    <div>
                      <Clock3 size={14} />
                      <span>
                        Submit by
                        <strong>
                          {formatDate(a.payment.submissionDeadline)}
                        </strong>
                      </span>
                    </div>
                    <div>
                      <Clock3 size={14} />
                      <span>
                        Collect before
                        <strong>{formatDate(a.payment.captureDeadline)}</strong>
                      </span>
                    </div>
                  </div>
                )}
                <div className="paypal-wordmark">
                  {a.mode === "demo" ? "Simulated payment" : "PayPal"}
                  <span>
                    {a.mode === "demo" ? "No provider transaction" : "SANDBOX"}
                  </span>
                </div>
              </section>
              <section className="panel verification-card">
                <div className="panel-title">
                  <FingerprintIcon />
                  <h3>A traceable decision</h3>
                </div>
                <div className="verification-network">
                  <span className="status-dot" />
                  {a.mode === "demo"
                    ? "Simulated verifier"
                    : "GenLayer Studionet"}
                </div>
                <p>
                  {a.mode === "demo"
                    ? "Demo findings show how the workflow behaves. They are not on-chain AI results."
                    : "The agreement contract evaluates captured copy. Only successful final execution can enable automatic collection."}
                </p>
                <ShortHash label="Agreement" value={a.digest} />
                <ShortHash label="Contract" value={a.contract.address} />
                <ShortHash label="Decision" value={s?.verification.txId} />
                {s && (
                  <div className="verification-footer">
                    <span>Verification</span>
                    <strong>
                      {s.verification.status.toLowerCase().replaceAll("_", " ")}
                    </strong>
                  </div>
                )}
                {a.mode === "sandbox" && (
                  <small className="network-note">
                    Studionet is a development environment. Page capture is
                    performed by the application’s isolated collector.
                  </small>
                )}
              </section>
              <Button
                className="secondary full small"
                onClick={() => action("refresh")}
                busy={busy === "refresh"}
              >
                <RefreshCw size={14} />
                Refresh saved job
              </Button>
              {!isPaid &&
                !["CANCELED", "CLOSED"].includes(a.state) &&
                !MONEY_IN_FLIGHT.includes(a.payment.status) && (
                  <div className="cancel-area">
                    {confirm === "cancel" ? (
                      <>
                        <p>
                          Cancel this agreement and void any uncollected
                          authorization?
                        </p>
                        <Button
                          className="danger small"
                          busy={busy === "cancel"}
                          onClick={async () => {
                            await action("cancel");
                            setConfirm(null);
                          }}
                        >
                          Yes, cancel agreement
                        </Button>
                        <Button
                          className="text-button small"
                          onClick={() => setConfirm(null)}
                        >
                          Keep agreement
                        </Button>
                      </>
                    ) : (
                      <button onClick={() => setConfirm("cancel")}>
                        Cancel agreement
                      </button>
                    )}
                  </div>
                )}
            </aside>
          </div>
        </>
      )}
    </Shell>
  );
}
function FingerprintIcon() {
  return <ShieldCheck size={19} />;
}
function EvidencePanel({ agreement: a }: { agreement: Agreement }) {
  const current = currentSubmission(a);
  const [selected, setSelected] = useState(current?.id || "baseline");
  const e =
    selected === "baseline"
      ? a.baseline
      : a.submissions.find((s) => s.id === selected)?.evidence;
  return (
    <section className="panel evidence-panel">
      <div className="panel-title">
        <Globe2 size={20} />
        <div>
          <h2>Evidence you can inspect</h2>
          <p>Captured text and links, bound to an immutable digest.</p>
        </div>
      </div>
      <label className="evidence-select">
        Captured version
        <select
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
        >
          <option value="baseline">Original page</option>
          {a.submissions
            .filter((s) => s.evidence)
            .map((s) => (
              <option key={s.id} value={s.id}>
                Revision {s.revision} · {formatDate(s.evidence?.capturedAt)}
              </option>
            ))}
        </select>
      </label>
      {!e ? (
        <div className="empty">
          <LoaderCircle size={22} />
          <p>Evidence will appear once capture completes.</p>
        </div>
      ) : (
        <>
          <div className="evidence-meta">
            <Badge tone="green">
              {e.complete ? "Capture complete" : "Partial capture"}
            </Badge>
            <span>{formatDate(e.capturedAt)}</span>
          </div>
          {e.screenshotHash ? (
            <a
              href={`/api/agreements/${a.id}/image?hash=${encodeURIComponent(e.screenshotHash)}`}
              target="_blank"
              rel="noreferrer"
            >
              <img
                className="evidence-screenshot"
                src={`/api/agreements/${a.id}/image?hash=${encodeURIComponent(e.screenshotHash)}`}
                alt="Captured website at the time of submission"
              />
            </a>
          ) : (
            <div className="text-snapshot">
              <span className="snapshot-label">
                TEXT SNAPSHOT ·{" "}
                {selected === "baseline" ? "ORIGINAL" : "SUBMITTED VERSION"}
              </span>
              <h3>{e.title}</h3>
              <p>{e.blocks.find((b) => b.kind === "heading")?.text}</p>
            </div>
          )}
          <div className="evidence-blocks">
            <h3>Visible text</h3>
            {e.blocks.map((b) => (
              <article key={b.id}>
                <code>
                  {(selected === "baseline" ? "baseline:" : "current:") + b.id}
                </code>
                <p>{b.text}</p>
              </article>
            ))}
            <h3>Link destinations</h3>
            {e.links.map((l) => (
              <article key={l.id}>
                <code>
                  {(selected === "baseline" ? "baseline:" : "current:") + l.id}
                  {l.primary ? " · primary" : ""}
                </code>
                <strong>{l.text}</strong>
                <p className="evidence-url">{l.href}</p>
              </article>
            ))}
          </div>
          <div className="evidence-hashes">
            <ShortHash label="Artifact hash" value={e.artifactHash} />
            <ShortHash label="Content hash" value={e.contentHash} />
          </div>
        </>
      )}
    </section>
  );
}
function Receipt({ agreement: a }: { agreement: Agreement }) {
  const s = currentSubmission(a);
  const paid = a.payment.status === "PAID";
  return (
    <section className="panel receipt-panel">
      <div className="receipt-brand">
        <span className="logo-mark">
          <Check size={20} />
        </span>
        <span>revisionpay</span>
        <Badge tone={paid ? "green" : "amber"}>
          {paid ? "Completed receipt" : "Agreement record"}
        </Badge>
      </div>
      <div className="receipt-hero">
        <FileCheck2 size={30} />
        <h2>
          {paid ? "Good work, accounted for." : "A record of the work so far."}
        </h2>
        <p>{a.title}</p>
        <strong>
          {money(a.amountMinor)}
          <small>USD</small>
        </strong>
      </div>
      <div className="receipt-summary">
        <div>
          <span>Client</span>
          <strong>{a.clientName}</strong>
        </div>
        <div>
          <span>Environment</span>
          <strong>
            {a.mode === "demo"
              ? "Simulation — no real transactions"
              : "PayPal sandbox + Studionet"}
          </strong>
        </div>
        <div>
          <span>Payment status</span>
          <strong>{a.payment.status.replaceAll("_", " ")}</strong>
        </div>
        <div>
          <span>Acceptance basis</span>
          <strong>
            {a.manualAcceptanceId
              ? "Explicit buyer approval"
              : paid
                ? "Finalized AI PASS"
                : "Not collected"}
          </strong>
        </div>
        <div>
          <span>Completed</span>
          <strong>{formatDate(a.payment.capturedAt)}</strong>
        </div>
      </div>
      <div className="receipt-refs">
        <ShortHash label="Agreement digest" value={a.digest} />
        <ShortHash
          label="PayPal authorization"
          value={a.payment.authorizationId}
        />
        <ShortHash label="PayPal capture" value={a.payment.captureId} />
        <ShortHash label="Contract" value={a.contract.address} />
        <ShortHash
          label="Verification transaction"
          value={s?.verification.txId}
        />
        <ShortHash label="Evidence" value={s?.evidence?.artifactHash} />
      </div>
      <a
        className="button secondary full"
        href={`/api/agreements/${a.id}/receipt`}
        download={`revisionpay-${a.id.slice(0, 8)}.json`}
      >
        <Download size={16} />
        Download complete JSON record
      </a>
      <p className="receipt-note">
        {a.mode === "demo"
          ? "This is a simulated demonstration, not proof of a PayPal transaction or an on-chain decision."
          : "The JSON record includes frozen terms, consent, captured evidence, verification findings, and provider references."}
      </p>
    </section>
  );
}
