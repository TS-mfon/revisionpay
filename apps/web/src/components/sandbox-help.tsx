import Link from "next/link";

export function SandboxHelp({ seller = false }: { seller?: boolean }) {
  return (
    <details className="sandbox-help" open={seller || undefined}>
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
          account. Open <strong>View/Edit Account</strong> to find the generated
          email and password.
        </li>
        <li>
          Use those details on the PayPal sandbox sign-in screen.{" "}
          {seller
            ? "Choose Log in in PayPal. Use a Business test account separate from the Platform Partner App account. Your client will need a separate Personal test account."
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

export function SandboxEmailHelp({ expanded = false }: { expanded?: boolean }) {
  return (
    <details className="sandbox-help" open={expanded || undefined}>
      <summary>PayPal says it sent an email, but nothing arrived?</summary>
      <p>
        Sandbox test emails are available in PayPal’s developer dashboard. Check
        that inbox for the account you used on sandbox.paypal.com.
      </p>
      <ol>
        <li>
          Open{" "}
          <a
            href="https://developer.paypal.com/dashboard/notifications"
            target="_blank"
            rel="noreferrer"
          >
            Sandbox Notifications ↗
          </a>
          , find the message for your sandbox account, and follow its email
          confirmation link.
        </li>
        <li>
          If the account or message is missing, open{" "}
          <a
            href="https://developer.paypal.com/dashboard/accounts"
            target="_blank"
            rel="noreferrer"
          >
            Sandbox Accounts ↗
          </a>
          . Use “Link other sandbox accounts to this developer account” to add
          an existing sandbox account. For a fresh seller test, you can instead
          choose a generated Business account and use its email and password
          when connecting PayPal. Choose Log in with those generated
          credentials.
        </li>
        <li>
          After confirming, return to RevisionPay → Account → Check connection.
          Your agreement stays saved while you finish.
        </li>
      </ol>
      <p>
        A normal PayPal account and a sandbox account are separate, even if
        their email addresses look the same.
      </p>
    </details>
  );
}
