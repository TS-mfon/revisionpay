"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, FileText } from "lucide-react";
import { money } from "@revisionpay/domain";
import { AGREEMENT_TEMPLATES } from "@revisionpay/domain/templates";
import { api, Button, ErrorBox, agreementHref } from "./ui";

export function AgreementTemplates() {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  async function start(templateId: string) {
    if (busy) return;
    setBusy(templateId);
    setError("");
    try {
      const { agreement } = await api("agreements", { templateId });
      router.push(agreementHref(agreement));
    } catch (error) {
      setError((error as Error).message);
      setBusy("");
    }
  }
  return (
    <section className="agreement-templates" aria-labelledby="templates-title">
      <div className="templates-heading">
        <div>
          <p className="eyebrow">READY TO TEST</p>
          <h2 id="templates-title">Start with a ready-made agreement</h2>
          <p>
            Pick a brief. We’ll save a draft with a sample client, checklist,
            fee and working test page.
          </p>
        </div>
        <span className="badge amber">PayPal sandbox</span>
      </div>
      <ErrorBox message={error} />
      <div className="template-grid">
        {AGREEMENT_TEMPLATES.map((template, i) => (
          <article
            className="workspace-template-card"
            key={template.id}
            aria-label={template.name}
          >
            <div className="workspace-template-card-top">
              <FileText size={20} />
              <span>0{i + 1}</span>
            </div>
            <h3>{template.name}</h3>
            <p>{template.summary}</p>
            <div className="workspace-template-card-meta">
              <strong>
                {money(template.amountMinor)} <small>USD</small>
              </strong>
              <span>3 requirements</span>
            </div>
            <Button
              className="secondary"
              disabled={Boolean(busy)}
              busy={busy === template.id}
              onClick={() => start(template.id)}
              aria-label={"Use template: " + template.name}
            >
              Use template <ArrowRight size={16} />
            </Button>
          </article>
        ))}
      </div>
      <p className="small-text">
        Each click creates your own editable draft. Nothing is sent or charged.
        PayPal approval still uses a sandbox personal account.
      </p>
    </section>
  );
}
