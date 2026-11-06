import { notFound } from "next/navigation";
import { agreementTemplate, templatePage } from "@revisionpay/domain/templates";
import { getStore } from "@/server/store";
import { configuration } from "@/server/config";

export const dynamic = "force-dynamic";
export default async function TestSite({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const a = await (await getStore()).getAgreement(id);
  if (
    !a ||
    a.mode !== "sandbox" ||
    !a.testTemplateId ||
    a.sourceUrl !== configuration().appUrl + "/test-site/" + id
  )
    notFound();
  const template = agreementTemplate(a.testTemplateId);
  if (!template) notFound();
  const version =
    a.demoVariant === "incomplete" || a.demoVariant === "corrected"
      ? a.demoVariant
      : "baseline";
  const page = templatePage(template, version);
  return (
    <div className={"sample-site sample-" + template.id}>
      <header>
        <strong>{template.page.brand}</strong>
        <span>Fictional business · test page</span>
      </header>
      <main>
        <p className="eyebrow">{template.page.category}</p>
        <h1>{page.headline}</h1>
        <p className="sample-intro">{page.description}</p>
        <div className="sample-details">
          <h2>Good to know</h2>
          <p>{page.detail}</p>
        </div>
        <a className="sample-cta" data-primary="true" href={page.href}>
          {page.cta}
          <span aria-hidden="true">↗</span>
        </a>
        {page.href.startsWith("#") && (
          <section className="sample-destination" id={page.href.slice(1)}>
            <h2>{page.cta}</h2>
            <p>
              This is the sample link destination. Forms and bookings are
              outside the scope of this copy-and-link revision.
            </p>
          </section>
        )}
      </main>
      <footer>
        RevisionPay sample website. This fictional page is used for sandbox
        agreement testing.
      </footer>
    </div>
  );
}
