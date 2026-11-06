"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, FileText } from "lucide-react";
import { api, Shell, Button, ErrorBox, agreementHref } from "@/components/ui";
export default function Demo() {
  const router = useRouter(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [existing, setExisting] = useState<string>();
  useEffect(() => {
    void api("me")
      .then(async (d) => {
        if (d.actor?.kind === "demo") {
          const result = await api("agreements");
          if (result.agreements[0])
            setExisting(agreementHref(result.agreements[0]));
        }
      })
      .catch(() => {});
  }, []);
  async function start() {
    setBusy(true);
    try {
      const d = await api("demo", {});
      router.push(agreementHref(d.agreement));
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <Shell title="Workspace">
      <section className="demo-intro">
        <span className="auth-symbol">
          <FileText size={30} />
        </span>
        <p className="eyebrow">A GUIDED EXAMPLE</p>
        <h1>
          See a revision through
          <br />
          from agreement to payment.
        </h1>
        <p>
          Follow Alex and Northstar Studio through a $180 pricing-page revision.
          Try an incomplete revision, request a fix, then approve the finished
          work.
        </p>
        <ol className="demo-steps">
          <li>Review the agreement</li>
          <li>Authorize the example fee</li>
          <li>Check the revised page</li>
          <li>Approve the example payment</li>
        </ol>
        <ErrorBox message={error} />
        <div className="action-row">
          {existing ? (
            <Link className="button" href={existing}>
              Continue your example <ArrowRight size={18} />
            </Link>
          ) : (
            <Button onClick={start} busy={busy}>
              Start guided demo <ArrowRight size={18} />
            </Button>
          )}
          {existing && (
            <Button className="secondary" onClick={start} busy={busy}>
              Start over
            </Button>
          )}
        </div>
        <p className="small-text">
          No account, PayPal login or crypto wallet required. This area uses
          simulated payments and checks.
        </p>
      </section>
    </Shell>
  );
}
