"use client";
import { useState } from "react";
import { Check, AlertCircle, ArrowRight, LockKeyhole } from "lucide-react";
export function RevisionExample() {
  const [corrected, setCorrected] = useState(false);
  return (
    <div
      className="proof-example"
      aria-label="Interactive example of a revision check"
    >
      <div className="proof-title">
        <span className="proof-dot" /> THE WORK, IN FOCUS{" "}
        <span>Illustrative example</span>
      </div>
      <h2>“Keep cancellation flexible.”</h2>
      <p>A pricing-page change. A $180 revision fee. One important line.</p>
      <div className="proof-tabs" aria-label="Choose example revision">
        <button aria-pressed={!corrected} onClick={() => setCorrected(false)}>
          First submission
        </button>
        <button aria-pressed={corrected} onClick={() => setCorrected(true)}>
          Corrected version
        </button>
      </div>
      <div className="proof-body" aria-live="polite">
        <div className="proof-excerpt">
          <span>CAPTURED PAGE COPY</span>
          <blockquote>
            {corrected
              ? "“$29/month. Cancel anytime. No cancellation fee.”"
              : "“$29/month. A 12-month commitment applies. Early cancellation: $99.”"}
          </blockquote>
        </div>
        <div className={"proof-finding " + (corrected ? "met" : "missing")}>
          {corrected ? <Check size={21} /> : <AlertCircle size={21} />}
          <div>
            <strong>
              {corrected
                ? "The requirement is met"
                : "One requirement needs a change"}
            </strong>
            <p>
              {corrected
                ? "The captured copy preserves monthly billing and anytime cancellation."
                : "The new commitment and cancellation fee contradict the agreed requirement."}
            </p>
          </div>
        </div>
        <div className="proof-payment">
          <LockKeyhole size={17} />
          <span>
            PayPal fee: <strong>Authorized · not charged</strong>
          </span>
        </div>
        <p className="proof-decision">
          {corrected
            ? "The client can now review this version and approve payment."
            : "The client can request the correction before approving payment."}
          <ArrowRight size={18} />
        </p>
      </div>
    </div>
  );
}
