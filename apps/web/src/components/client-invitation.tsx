"use client";
import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "./ui";

export function ClientInvitation({
  link,
  delivery,
  testPage,
  opened = false,
}: {
  link: string;
  delivery: string;
  testPage: boolean;
  opened?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    setCopied(false);
  }, [link]);
  return (
    <section
      id="client-invitation"
      className="share-panel"
      aria-label="Client invitation"
    >
      <h2>Your client invitation link</h2>
      <p>
        {delivery === "QUEUED"
          ? "An email is queued for delivery. You can also copy and share the link now."
          : delivery === "LINK_READY" || delivery === "UNAVAILABLE"
            ? "No email has been sent. Copy this private link and send it to your client by message or email."
            : "Copy this private link whenever you need it. It stays available after you leave this page and after your client opens it."}
      </p>
      {opened && (
        <p className="small-text">
          Your client has opened this agreement. The same link lets them return.
        </p>
      )}
      <label>
        Private invitation link
        <input readOnly value={link} onFocus={(e) => e.target.select()} />
      </label>
      <div className="action-row">
        <Button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(link);
              setCopied(true);
              setMessage("Link copied. Send it to your client.");
            } catch {
              setMessage("Select the link above and copy it manually.");
            }
          }}
        >
          {copied ? <Check size={17} /> : <Copy size={17} />}
          {copied ? "Copied" : "Copy invitation"}
        </Button>
        {testPage && (
          <a className="button secondary" href={link}>
            Open client view to test →
          </a>
        )}
      </div>
      {message && <p role="status">{message}</p>}
      {testPage && (
        <p className="small-text">
          Testing by yourself? Open the client view here, then use “Switch to
          freelancer view” to return. PayPal still requires a separate Personal
          sandbox account.
        </p>
      )}
    </section>
  );
}
