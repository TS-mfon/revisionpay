import { fixture } from "@revisionpay/domain/fixtures";
import type { DemoVariant } from "@revisionpay/domain";
export function Northstar({
  variant = "baseline",
  compact = false,
}: {
  variant?: DemoVariant;
  compact?: boolean;
}) {
  const data = fixture(variant);
  return (
    <div className={"northstar " + (compact ? "compact" : "")}>
      <header>
        <a href="#" className="northstar-logo">
          <span>✳</span>northstar
        </a>
        <span>SPACE TO DO YOUR BEST WORK</span>
      </header>
      <main>
        <div className="northstar-kicker">
          A LITTLE LESS NOISE. A LOT MORE POSSIBILITY.
        </div>
        <h1>{data.title}</h1>
        <p className="northstar-intro">{data.description}</p>
        <section className="northstar-price">
          <div className="plan-label">
            THE STARTER PLAN<span>Made for your next chapter</span>
          </div>
          <div className="price-number">
            {data.price}
            <span>/ month</span>
          </div>
          <p className="northstar-terms">{data.terms}</p>
          <a data-primary="true" href={data.href} className="northstar-cta">
            {data.cta}
            <span aria-hidden>↗</span>
          </a>
          <ul>
            {data.features.map((f) => (
              <li key={f}>
                <span aria-hidden>✓</span>
                {f}
              </li>
            ))}
          </ul>
          {data.extra && <p className="adversarial-text">{data.extra}</p>}
        </section>
      </main>
      <footer>
        Thoughtful tools. Space for what matters.
        <span>Northstar · Original demonstration website</span>
      </footer>
    </div>
  );
}
