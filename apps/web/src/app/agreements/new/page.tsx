"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Plus, X, LockKeyhole } from "lucide-react";
import {
  api,
  Shell,
  useMe,
  Button,
  ErrorBox,
  Loading,
  RetryPanel,
} from "@/components/ui";
interface Form {
  title: string;
  clientName: string;
  clientEmail: string;
  sourceUrl: string;
  amount: string;
  requirements: string[];
}
const empty: Form = {
  title: "",
  clientName: "",
  clientEmail: "",
  sourceUrl: "",
  amount: "",
  requirements: ["", "", ""],
};
export default function Builder() {
  const { who, error: authError } = useMe(),
    router = useRouter();
  const [form, setForm] = useState<Form>(empty),
    [error, setError] = useState(""),
    [saved, setSaved] = useState("Your draft is private"),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false),
    [templateDraft, setTemplateDraft] = useState(false);
  const [fixedClient, setFixedClient] = useState(false);
  const current = useRef(form),
    id = useRef(""),
    version = useRef(0),
    lastSaved = useRef(""),
    inFlight = useRef<Promise<string> | null>(null);
  current.current = form;
  useEffect(() => {
    if (!who) return;
    let active = true;
    const q = new URLSearchParams(location.search),
      existing = q.get("draft") || q.get("copy");
    async function load() {
      try {
        if (existing) {
          const d = await api("agreements/" + existing),
            a = d.agreement;
          if (active) setTemplateDraft(Boolean(a.testTemplateId));
          if (active) setFixedClient(Boolean(a.workPostId && q.has("draft")));
          if (q.has("draft") && a.state !== "DRAFT")
            throw new Error(
              "This agreement was already sent and cannot be edited.",
            );
          if (q.has("draft")) {
            id.current = a.id;
            version.current = a.draftRevision || 0;
          }
          const f = {
            title: a.title,
            clientName: a.clientName,
            clientEmail: a.clientEmail || "",
            sourceUrl: a.sourceUrl,
            amount: String(a.amountMinor / 100),
            requirements: a.requirements.map((r: any) => r.description),
          };
          if (active) setForm(f);
          if (q.has("draft")) lastSaved.current = JSON.stringify(f);
        } else {
          try {
            const cached = sessionStorage.getItem("revision-draft:" + who!.id);
            if (cached && active) setForm({ ...empty, ...JSON.parse(cached) });
          } catch {
            /* Saving to the workspace does not depend on browser storage. */
          }
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        if (active) setLoaded(true);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [who]);
  function input(f: Form) {
    return {
      title: f.title.trim() || new URL(f.sourceUrl).hostname + " page revision",
      clientName: f.clientName,
      clientEmail: f.clientEmail.trim() || undefined,
      sourceUrl: f.sourceUrl,
      amountMinor: Math.round(Number(f.amount) * 100),
      requirements: f.requirements.map((description, i) => ({
        id: "R" + (i + 1),
        title: description.slice(0, 70),
        description,
      })),
    };
  }
  function valid(f: Form) {
    try {
      const url = new URL(f.sourceUrl);
      const localTestPage =
        templateDraft &&
        ["localhost", "127.0.0.1"].includes(url.hostname) &&
        url.origin === location.origin &&
        url.pathname === "/test-site/" + id.current;
      return (
        (url.protocol === "https:" || localTestPage) &&
        Boolean(url.hostname) &&
        f.clientName.trim().length >= 2 &&
        ((templateDraft && !f.clientEmail.trim()) ||
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.clientEmail)) &&
        Number(f.amount) >= 25 &&
        Number(f.amount) <= 500 &&
        f.requirements.every((r) => r.trim().length >= 15)
      );
    } catch {
      return false;
    }
  }
  async function persist(): Promise<string> {
    if (inFlight.current) {
      await inFlight.current;
      if (JSON.stringify(current.current) === lastSaved.current)
        return id.current;
    }
    const snapshot = current.current,
      serialized = JSON.stringify(snapshot);
    if (serialized === lastSaved.current && id.current) return id.current;
    setSaved("Saving…");
    const promise = (async () => {
      const d = await api(
        id.current ? "agreements/" + id.current + "/draft" : "agreements",
        { input: input(snapshot), draftRevision: version.current },
      );
      id.current = d.agreement.id;
      history.replaceState(null, "", "/agreements/new?draft=" + id.current);
      version.current = d.agreement.draftRevision || 0;
      lastSaved.current = serialized;
      setSaved("Saved to your workspace");
      return id.current;
    })();
    inFlight.current = promise;
    try {
      return await promise;
    } finally {
      if (inFlight.current === promise) inFlight.current = null;
    }
  }
  useEffect(() => {
    if (!loaded || !who) return;
    try {
      sessionStorage.setItem("revision-draft:" + who.id, JSON.stringify(form));
    } catch {
      /* Storage may be unavailable. Cloud saving still works. */
    }
    if (!valid(form)) {
      setSaved("Draft kept in this tab");
      return;
    }
    const timer = setTimeout(() => {
      void persist().catch((e) => {
        setSaved("Not saved yet");
        setError(e.message);
      });
    }, 1200);
    return () => clearTimeout(timer);
  }, [form, loaded, who]);
  const update = (field: keyof Form, value: string | string[]) =>
    setForm((f) => ({ ...f, [field]: value }));
  async function review(e: React.FormEvent) {
    e.preventDefault();
    if (!valid(form)) {
      setError(
        "Add a public HTTPS page, client details, a $25–$500 fee and at least 15 characters for each change.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      const savedId = await persist();
      try {
        sessionStorage.removeItem("revision-draft:" + who?.id);
      } catch {
        /* Already saved. */
      }
      router.push("/agreements/" + savedId + "?view=freelancer");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <Shell who={who} title="New revision">
      <Link className="back-link" href="/workspace">
        <ArrowLeft size={17} />
        Your agreements
      </Link>
      <div className="page-heading">
        <div>
          <p className="eyebrow">NEW REVISION</p>
          <h1>What needs to change?</h1>
          <p>Give your client a clear checklist and one fixed fee.</p>
        </div>
        <span className="save-state" role="status">
          <LockKeyhole size={15} />
          {saved}
        </span>
      </div>
      <ErrorBox message={error || authError} />
      {who === null ? (
        <div className="welcome-panel">
          <h2>Sign in to save your revision.</h2>
          <Link className="button" href="/login?returnTo=%2Fagreements%2Fnew">
            Continue with Google
          </Link>
        </div>
      ) : !loaded ? (
        authError ? (
          <RetryPanel onRetry={() => location.reload()} />
        ) : (
          <Loading />
        )
      ) : (
        <form onSubmit={review} className="revision-form">
          <section className="form-section">
            <h2>1. The page and the fee</h2>
            <label>
              Public page URL
              <input
                name="sourceUrl"
                type="url"
                required
                placeholder="https://yourclient.com/pricing"
                value={form.sourceUrl}
                onChange={(e) => update("sourceUrl", e.target.value)}
              />
              <span className="field-help">
                We check visible copy and link destinations on this one page.
              </span>
            </label>
            <div className="two-fields">
              <label>
                Client or business name
                <input
                  name="clientName"
                  readOnly={fixedClient}
                  required
                  autoComplete="organization"
                  minLength={2}
                  maxLength={80}
                  value={form.clientName}
                  onChange={(e) => update("clientName", e.target.value)}
                />
              </label>
              <label>
                Client email
                {templateDraft && (
                  <span className="optional">Optional for testing</span>
                )}
                <input
                  name="clientEmail"
                  readOnly={fixedClient}
                  type="email"
                  required={!templateDraft}
                  autoComplete="email"
                  value={form.clientEmail}
                  onChange={(e) => update("clientEmail", e.target.value)}
                />
                {templateDraft && (
                  <span className="field-help">
                    Leave blank to test with a private invitation link.
                  </span>
                )}
              </label>
            </div>
            <label className="fee-field">
              Revision fee · USD
              <input
                name="amount"
                type="number"
                inputMode="decimal"
                min="25"
                max="500"
                step="0.01"
                required
                placeholder="180.00"
                value={form.amount}
                onChange={(e) => update("amount", e.target.value)}
              />
              <span className="field-help">
                $25–$500. This is the total your client authorizes. PayPal fees
                apply to your receipt.
              </span>
            </label>
          </section>
          <section className="form-section">
            <h2>2. The agreed changes</h2>
            <p>
              Write what your client should be able to see when you’re done. Be
              specific about wording, prices and links.
            </p>
            {form.requirements.map((text, i) => (
              <div className="requirement-input" key={i}>
                <label>
                  Change {i + 1}
                  <textarea
                    required
                    minLength={15}
                    maxLength={800}
                    rows={2}
                    placeholder={
                      [
                        "Explain that the 14-day trial does not require a credit card.",
                        "Keep the existing monthly price and cancel-anytime promise.",
                        "Point the main signup button to the trial registration page.",
                      ][i] || "Describe another specific change."
                    }
                    value={text}
                    onChange={(e) =>
                      update(
                        "requirements",
                        form.requirements.map((r, j) =>
                          j === i ? e.target.value : r,
                        ),
                      )
                    }
                  />
                </label>
                {form.requirements.length > 3 && (
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={"Remove change " + (i + 1)}
                    onClick={() =>
                      update(
                        "requirements",
                        form.requirements.filter((_, j) => j !== i),
                      )
                    }
                  >
                    <X size={18} />
                  </button>
                )}
              </div>
            ))}
            {form.requirements.length < 5 && (
              <Button
                type="button"
                className="secondary"
                onClick={() =>
                  update("requirements", [...form.requirements, ""])
                }
              >
                <Plus size={18} />
                Add a change
              </Button>
            )}
            <details className="optional-title">
              <summary>
                Give this revision a name{" "}
                <span className="optional">Optional</span>
              </summary>
              <label>
                Agreement title
                <input
                  value={form.title}
                  maxLength={120}
                  onChange={(e) => update("title", e.target.value)}
                />
              </label>
            </details>
          </section>
          <div className="form-submit">
            <div>
              <strong>You’ll review everything before sending.</strong>
              <p>Nothing is sent or charged yet.</p>
            </div>
            <Button type="submit" busy={busy}>
              Review agreement <ArrowRight size={18} />
            </Button>
          </div>
        </form>
      )}
    </Shell>
  );
}
