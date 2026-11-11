"use client";
import Link from "next/link";
import { Check } from "lucide-react";
import {
  currentSubmission,
  MONEY_IN_FLIGHT,
  type Agreement,
} from "@revisionpay/domain";

export function AgreementProgress({
  agreement: a,
  seller,
  canSwitchView,
  connected,
}: {
  agreement: Agreement;
  seller: boolean;
  canSwitchView: boolean;
  connected?: boolean;
}) {
  const submission = currentSubmission(a);
  const closed =
    a.state === "CANCELED" || ["VOIDED", "EXPIRED"].includes(a.payment.status);
  const paid = a.payment.status === "PAID";
  const checkingPayment = MONEY_IN_FLIGHT.includes(a.payment.status);
  const needsConnection = seller && a.state === "DRAFT" && connected === false;
  const continueAs =
    !closed && !paid && !checkingPayment && canSwitchView
      ? seller &&
        (a.state === "AWAITING_BUYER" ||
          (submission?.state === "READY" && a.state !== "REVIEW_HOLD"))
        ? "client"
        : !seller &&
            a.payment.status === "AUTHORIZED" &&
            (!submission || a.state === "REVIEW_HOLD")
          ? "freelancer"
          : undefined
      : undefined;
  const step = paid
    ? 4
    : a.state === "DRAFT"
      ? 0
      : !a.payment.authorizationId
        ? 1
        : !submission ||
            a.state === "REVIEW_HOLD" ||
            submission.state === "FAILED"
          ? 2
          : 3;
  const title = closed
    ? "This agreement is closed"
    : paid
      ? "Work approved. Payment confirmed."
      : a.payment.checkoutUnavailable
        ? "This checkout needs a fresh agreement"
        : checkingPayment
          ? "We’re confirming the payment with PayPal"
          : needsConnection
            ? "Next: connect PayPal, then share this agreement"
            : step === 0
              ? seller
                ? "Your turn: review the draft and create a client link"
                : "Next: your freelancer prepares the agreement"
              : step === 1
                ? seller
                  ? "Next: your client reviews and authorizes the fee"
                  : "Your turn: review the agreement and authorize the fee"
                : step === 2
                  ? seller
                    ? "Your turn: publish and submit the changes"
                    : "Next: your freelancer makes the changes"
                  : submission?.state === "CAPTURING"
                    ? "We’re checking the updated page"
                    : seller
                      ? "Next: your client reviews the submitted work"
                      : "Your turn: review the work, then approve or request changes";
  return (
    <section className="agreement-progress" aria-label="Agreement progress">
      <div className="view-context">
        <span>
          You’re viewing as the{" "}
          <strong>{seller ? "freelancer" : "client"}</strong>
        </span>
        {canSwitchView && (
          <a
            className="text-link"
            href={"/agreements/" + a.id + (seller ? "" : "?view=freelancer")}
          >
            Switch to {seller ? "client" : "freelancer"} view →
          </a>
        )}
      </div>
      <ol className="agreement-steps">
        {[
          "You create an agreement",
          "Client authorizes the fee",
          "You submit the changes",
          "Client approves payment",
        ].map((label, i) => (
          <li
            key={label}
            aria-current={!closed && i === step ? "step" : undefined}
            className={i < step ? "done" : ""}
          >
            <span>{i < step ? <Check size={15} /> : i + 1}</span>
            {seller
              ? label
              : label
                  .replace("You create", "Freelancer creates")
                  .replace("You submit", "Freelancer submits")
                  .replace("Client authorizes", "You authorize")
                  .replace("Client approves", "You approve")}
          </li>
        ))}
      </ol>
      <strong>{title}</strong>
      <p>
        {closed
          ? "The original agreement stays here for your records. A new agreement needs fresh approval."
          : paid
            ? "You can view or print the receipt below."
            : checkingPayment
              ? "This page updates automatically. Wait for confirmation before trying another payment."
              : "Authorization means permission to collect later. Payment is collected only after the client approves the finished work."}
      </p>
      {!closed && !paid && (
        <div className="flow-actions">
          {needsConnection ? (
            <Link
              className="button"
              href={
                "/settings?returnTo=" +
                encodeURIComponent("/agreements/" + a.id + "?view=freelancer")
              }
            >
              Set up PayPal for this agreement →
            </Link>
          ) : a.payment.checkoutUnavailable ? (
            <a className="button" href="#checkout-recovery">
              View checkout recovery ↓
            </a>
          ) : continueAs ? (
            <a
              className="button"
              href={
                "/agreements/" +
                a.id +
                (continueAs === "freelancer" ? "?view=freelancer" : "")
              }
            >
              Continue as {continueAs} →
            </a>
          ) : !checkingPayment && submission?.state !== "CAPTURING" ? (
            <a className="button" href="#next-step">
              {step === 0
                ? seller
                  ? "Review and share"
                  : "View the draft"
                : step === 1
                  ? seller
                    ? "View client invitation"
                    : "Review and authorize"
                  : step === 2
                    ? seller
                      ? "Submit the changes"
                      : "View next step"
                    : seller
                      ? "View submitted work"
                      : "Review and approve"}{" "}
              ↓
            </a>
          ) : (
            <p role="status">
              Working on this step… This page updates automatically.
            </p>
          )}
        </div>
      )}
      {!seller && (
        <p className="small-text">
          {a.workPostId
            ? "Return to this agreement from Explorer → My posts."
            : "Keep the private invitation link to return to this agreement."}{" "}
          <Link href="/help#access">Help returning later</Link>
        </p>
      )}
    </section>
  );
}
