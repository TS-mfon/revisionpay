"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Globe2,
  LockKeyhole,
} from "lucide-react";
import { DEFAULT_REQUIREMENTS } from "@revisionpay/domain/fixtures";
import { api, Shell, useMe, Button, ErrorBox } from "@/components/ui";
export default function Builder() {
  const { who, error: authError } = useMe();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [template, setTemplate] = useState(true);
  const [requirements, setRequirements] = useState(DEFAULT_REQUIREMENTS);
  const router = useRouter();
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(e.currentTarget);
    try {
      const result = await api("agreements", {
        template: template || who?.kind === "demo",
        input: {
          title: data.get("title"),
          clientName: data.get("clientName"),
          sourceUrl: data.get("sourceUrl"),
          amountMinor: Math.round(Number(data.get("amount")) * 100),
          requirements,
        },
      });
      router.push("/agreements/" + result.agreement.id);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <Shell who={who} title="New agreement">
      <Link href="/workspace" className="back-link">
        <ArrowLeft size={15} />
        All agreements
      </Link>
      <div className="page-heading">
        <div>
          <p className="eyebrow">SET THE WORK UP FOR SUCCESS</p>
          <h1>
            A clear agreement.
            <br />A better starting point.
          </h1>
          <p>Define what needs to change and what needs to stay the same.</p>
        </div>
      </div>
      <ErrorBox message={error || authError} />
      <form onSubmit={submit} className="builder-grid">
        <div>
          <section className="panel form-panel">
            <div className="panel-title">
              <span className="step-number">01</span>
              <div>
                <h2>The revision</h2>
                <p>One public page and one fixed revision fee.</p>
              </div>
            </div>
            <div className="template-card">
              <Globe2 size={22} />
              <div>
                <strong>Use the Northstar example</strong>
                <p>
                  A ready-to-revise page with trial, pricing, and CTA
                  requirements.
                </p>
              </div>
              <input
                aria-label="Use Northstar example"
                type="checkbox"
                checked={template || who?.kind === "demo"}
                disabled={who?.kind === "demo"}
                onChange={(e) => setTemplate(e.target.checked)}
              />
            </div>
            {!template && who?.kind !== "demo" && (
              <div className="form-fields">
                <label>
                  Agreement title
                  <input
                    required
                    name="title"
                    minLength={3}
                    maxLength={120}
                    placeholder="Pricing page copy revision"
                  />
                </label>
                <div className="two-fields">
                  <label>
                    Client or business
                    <input
                      required
                      name="clientName"
                      minLength={2}
                      maxLength={80}
                      placeholder="Your client"
                    />
                  </label>
                  <label>
                    Revision fee · USD
                    <input
                      required
                      name="amount"
                      type="number"
                      min="25"
                      max="500"
                      step="0.01"
                      placeholder="180.00"
                    />
                  </label>
                </div>
                <label>
                  Public page URL
                  <input
                    name="sourceUrl"
                    type="url"
                    required
                    placeholder="https://your-approved-website.com/pricing"
                  />
                  <small>
                    The capture service must allow this website host.
                  </small>
                </label>
              </div>
            )}
          </section>
          <section className="panel form-panel">
            <div className="panel-title">
              <span className="step-number">02</span>
              <div>
                <h2>What does done look like?</h2>
                <p>Use specific conditions the evidence can support.</p>
              </div>
            </div>
            <div className="builder-requirements">
              {requirements.map((r, i) => (
                <div key={r.id}>
                  <span className="requirement-id">{r.id}</span>
                  <div>
                    {template || who?.kind === "demo" ? (
                      <>
                        <strong>{r.title}</strong>
                        <p>{r.description}</p>
                      </>
                    ) : (
                      <>
                        <label className="sr-only" htmlFor={r.id + "-title"}>
                          Requirement {i + 1} title
                        </label>
                        <input
                          id={r.id + "-title"}
                          required
                          minLength={3}
                          maxLength={100}
                          value={r.title}
                          onChange={(e) =>
                            setRequirements(
                              requirements.map((v, index) =>
                                index === i
                                  ? { ...v, title: e.target.value }
                                  : v,
                              ),
                            )
                          }
                        />
                        <label className="sr-only" htmlFor={r.id}>
                          Requirement {i + 1} detail
                        </label>
                        <textarea
                          id={r.id}
                          required
                          minLength={15}
                          maxLength={800}
                          value={r.description}
                          onChange={(e) =>
                            setRequirements(
                              requirements.map((v, index) =>
                                index === i
                                  ? { ...v, description: e.target.value }
                                  : v,
                              ),
                            )
                          }
                        />
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
          <Button
            type="submit"
            busy={busy}
            disabled={!who || who.role !== "seller"}
          >
            Create & capture original page <ArrowRight size={16} />
          </Button>
        </div>
        <aside className="builder-aside panel">
          <LockKeyhole size={24} />
          <h3>Clear terms for both sides.</h3>
          <p>
            The buyer reviews and accepts the captured page, requirements, and
            fee before authorizing payment.
          </p>
          <ul>
            {[
              "3 revision submissions",
              "48 hours to submit the work",
              "Collection starts within 70 hours",
              "One fixed USD payment",
              "Buyer review before collection",
            ].map((text) => (
              <li key={text}>
                <Check size={15} />
                {text}
              </li>
            ))}
          </ul>
          <div className="notice neutral">
            <p>
              Only public, shareable page content is supported. Evidence and
              decisions may remain visible on Studionet.
            </p>
          </div>
          <small>
            Authorization reserves permission to collect. It is not escrow.
          </small>
        </aside>
      </form>
    </Shell>
  );
}
