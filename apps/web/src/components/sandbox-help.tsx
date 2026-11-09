import Link from "next/link";

export function SandboxHelp({ seller = false }: { seller?: boolean }) {
  return (
    <details className="sandbox-help">
      <summary>
        {seller
          ? "Which PayPal account should I connect?"
          : "Get the PayPal test account you need"}
      </summary>
      <p>
        Sandbox is PayPal’s test environment. It uses separate accounts and test
        funds.
      </p>
      <ol>
        <li>
          Open{" "}
          <a
            href="https://developer.paypal.com/dashboard/accounts"
            target="_blank"
            rel="noreferrer"
          >
            PayPal Developer → Sandbox Accounts ↗
          </a>
          .
        </li>
        <li>
          Choose or create a <strong>{seller ? "Business" : "Personal"}</strong>{" "}
          account. Open its account details to find the generated email and
          password.
        </li>
        <li>
          Use those details on the PayPal sandbox sign-in screen.{" "}
          {seller
            ? "Your client will need a separate Personal test account."
            : "Use a different account from the freelancer’s Business test account."}
        </li>
      </ol>
      <p>
        Your normal PayPal login and Google login are different from these test
        credentials. If PayPal requests a code you cannot receive, your
        agreement stays saved. <Link href="/help#paypal">Get sign-in help</Link>
        .
      </p>
    </details>
  );
}
