"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, ArrowLeft, ArrowRight } from "lucide-react";
import { api, Shell, useMe, Button, ErrorBox, Loading } from "@/components/ui";

export default function PostWork() {
  const { who } = useMe(),
    router = useRouter();
  const [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    [url, setUrl] = useState(""),
    [amount, setAmount] = useState("180");
  const [requirements, setRequirements] = useState(["", "", ""]),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function publish(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const d = await api("explorer", {
        title,
        description,
        sourceUrl: url,
        amountMinor: Math.round(Number(amount) * 100),
        requirements: requirements.map((description, i) => ({
          id: "R" + (i + 1),
          title: description.slice(0, 70),
          description,
        })),
        publishConsent: consent,
      });
      router.push("/explore/" + d.post.id);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <Shell who={who} title="Post work">
      <Link className="text-link" href="/explore">
        <ArrowLeft size={16} /> Back to Explorer
      </Link>
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOU’RE THE CLIENT</p>
          <h1>What needs to change?</h1>
          <p>
            Post one public page and 3–5 specific changes. You choose a
            freelancer before authorizing any payment.
          </p>
        </div>
      </div>
      {who === undefined ? (
        <Loading />
      ) : !who || who.kind === "demo" ? (
        <section className="welcome-panel">
          <h2>Sign in to post your work.</h2>
          <p>
            Your applications and selected agreement will stay connected to your
            account.
          </p>
          <Link className="button" href="/login?returnTo=%2Fexplore%2Fnew">
            Continue with Google
          </Link>
        </section>
      ) : (
        <form className="work-form" onSubmit={publish}>
          <section className="form-section">
            <h2>The brief</h2>
            <label>
              Project title
              <input
                required
                minLength={3}
                maxLength={120}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Make our pricing page easier to understand"
              />
            </label>
            <label>
              What’s the problem?
              <textarea
                required
                minLength={30}
                maxLength={1600}
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Visitors keep asking whether our trial needs a card. We need the pricing page to answer that clearly."
              />
            </label>
            <label>
              Public page URL
              <input
                type="url"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://your-site.com/pricing"
              />
              <span className="field-help">
                A page the freelancer can edit once you arrange access.
                RevisionPay checks its public copy and links.
              </span>
            </label>
            <label>
              Fixed fee (USD)
              <input
                type="number"
                min="25"
                max="500"
                step="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <span className="field-help">
                $25–$500. This hackathon workspace uses PayPal test funds.
              </span>
            </label>
          </section>
          <section className="form-section">
            <h2>What does “done” look like?</h2>
            <p>
              Give each change a clear outcome the client and freelancer can
              check.
            </p>
            {requirements.map((r, i) => (
              <div className="requirement-field" key={i}>
                <label>
                  Requirement {i + 1}
                  <textarea
                    required
                    minLength={15}
                    maxLength={800}
                    rows={2}
                    value={r}
                    onChange={(e) =>
                      setRequirements(
                        requirements.map((value, n) =>
                          n === i ? e.target.value : value,
                        ),
                      )
                    }
                    placeholder={
                      [
                        "Say the free trial lasts 14 days and needs no credit card.",
                        "Keep the price at $29/month and say cancel anytime.",
                        "Make the trial button link to /signup.",
                      ][i]
                    }
                  />
                </label>
                {requirements.length > 3 && (
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={"Remove requirement " + (i + 1)}
                    onClick={() =>
                      setRequirements(requirements.filter((_, n) => n !== i))
                    }
                  >
                    <X size={18} />
                  </button>
                )}
              </div>
            ))}
            {requirements.length < 5 && (
              <Button
                type="button"
                className="secondary"
                onClick={() => setRequirements([...requirements, ""])}
              >
                <Plus size={16} /> Add a requirement
              </Button>
            )}
          </section>
          <section className="form-section">
            <h2>Publish for freelancers to find</h2>
            <p>
              Your name, brief, page URL, requirements and fee will be public.
              Applications, email addresses and the resulting agreement stay
              private.
            </p>
            <label className="consent">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span>I want to publish these details in the Explorer.</span>
            </label>
            <ErrorBox message={error} />
            <Button busy={busy} disabled={!consent}>
              Publish work <ArrowRight size={18} />
            </Button>
            <p className="small-text">
              No payment is created by posting work. You can close the listing
              before a freelancer accepts.
            </p>
          </section>
        </form>
      )}
    </Shell>
  );
}
