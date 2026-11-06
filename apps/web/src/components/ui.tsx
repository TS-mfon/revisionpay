"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  Check,
  CircleHelp,
  Copy,
  LoaderCircle,
  LogOut,
  Settings,
} from "lucide-react";
import type { Actor, Agreement } from "@revisionpay/domain";
import { displayStatus } from "@revisionpay/domain";

export async function api<T = any>(path: string, data?: unknown): Promise<T> {
  const response = await fetch("/api/" + path, {
    method: data === undefined ? "GET" : "POST",
    headers: {
      ...(data === undefined ? {} : { "Content-Type": "application/json" }),
      ...(typeof location !== "undefined" &&
      location.pathname.startsWith("/demo") &&
      !location.pathname.startsWith("/demo-site")
        ? { "X-RevisionPay-Space": "demo" }
        : {}),
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    cache: "no-store",
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error(
      body.message || "We couldn't complete that action. Please try again.",
    );
  return body;
}
export const agreementHref = (a: Pick<Agreement, "mode" | "id">) =>
  (a.mode === "demo" ? "/demo" : "") + "/agreements/" + a.id;
export function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link
      href="/"
      className={"logo " + (light ? "light" : "")}
      aria-label="RevisionPay home"
    >
      <span className="logo-mark">
        <Check size={20} strokeWidth={3} />
      </span>
      revision<span className="logo-pay">pay</span>
    </Link>
  );
}
export function Button({
  children,
  busy,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  return (
    <button
      className={"button " + className}
      {...props}
      aria-busy={busy || undefined}
      disabled={props.disabled || busy}
    >
      {busy && <LoaderCircle size={18} className="spin" />}
      {children}
    </button>
  );
}
export function Badge({
  children,
  tone = "gray",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return (
    <span className={"badge " + tone}>
      <span className="status-dot" />
      {children}
    </span>
  );
}
export function Status({ agreement }: { agreement: Agreement }) {
  const s = displayStatus(agreement);
  return <Badge tone={s.tone}>{s.label}</Badge>;
}
export function ErrorBox({ message }: { message?: string }) {
  return message ? (
    <div role="alert" className="notice error">
      <CircleHelp size={20} />
      <span>{message}</span>
    </div>
  ) : null;
}
export function Loading({
  message = "Opening your workspace…",
}: {
  message?: string;
}) {
  return (
    <div className="loading" role="status">
      <LoaderCircle size={22} className="spin" />
      <p>{message}</p>
    </div>
  );
}
export function ShortHash({ value, label }: { value?: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="hash-row">
      <span>{label}</span>
      <code title={value}>
        {value
          ? value.slice(0, 16) +
            (value.length > 20 ? "…" + value.slice(-8) : "")
          : "Not available"}
      </code>
      {value && (
        <button
          className="icon-button"
          aria-label={"Copy " + label}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
        </button>
      )}
    </div>
  );
}
export function formatDate(value?: string) {
  return value
    ? new Date(value).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      })
    : "—";
}
export function ModeSwitch({ demo = false }: { demo?: boolean }) {
  return (
    <nav className="mode-switch" aria-label="Workspace mode">
      <Link href="/workspace" aria-current={!demo ? "page" : undefined}>
        Real workspace
      </Link>
      <Link href="/demo" aria-current={demo ? "page" : undefined}>
        Demo
      </Link>
    </nav>
  );
}
export function Shell({
  children,
  who,
  title = "Workspace",
}: {
  children: ReactNode;
  who?: Actor | null;
  onRole?: () => void;
  title?: string;
}) {
  const path = usePathname(),
    demo = path.startsWith("/demo"),
    buyer = who?.role === "buyer";
  const [error, setError] = useState("");
  return (
    <div className={"product-shell " + (buyer ? "client-shell" : "")}>
      <a className="skip-link" href="#content">
        Skip to content
      </a>
      <header className="product-header">
        <Logo />
        <ModeSwitch demo={demo} />
        <div className="header-links">
          {who && !demo && !buyer && (
            <Link href="/settings" aria-label="Account and payments">
              <Settings size={20} />
              <span>Account</span>
            </Link>
          )}
          {who && (
            <button
              className="icon-button"
              aria-label="Sign out"
              onClick={async () => {
                try {
                  await api("logout", {});
                  location.assign("/");
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <LogOut size={20} />
            </button>
          )}
          {!who && (
            <Link href="/login">
              Sign in <ArrowUpRight size={16} />
            </Link>
          )}
        </div>
      </header>
      {!buyer && (
        <nav className="product-nav" aria-label="Main navigation">
          <Link
            href={demo ? "/demo" : "/workspace"}
            aria-current={title === "Workspace" ? "page" : undefined}
          >
            {demo ? "Guided example" : "Your agreements"}
          </Link>
          <a href="/#how-it-works">How it works</a>
        </nav>
      )}
      <main id="content" className="product-content">
        {demo && (
          <div className="demo-banner">
            <Badge tone="amber">Demo</Badge>
            <p>This example simulates payments and checks. No money moves.</p>
            <Link href="/workspace">Use real workspace →</Link>
          </div>
        )}
        <ErrorBox message={error} />
        {children}
      </main>
      <footer className="product-footer">
        <span>RevisionPay · Website changes, clearly agreed.</span>
        <span>
          Questions? <Link href="/help">Get help</Link>
        </span>
      </footer>
    </div>
  );
}
export function useMe() {
  const [who, setWho] = useState<Actor | null>(),
    [error, setError] = useState("");
  const reload = () =>
    api("me")
      .then((d) => setWho(d.actor))
      .catch((e) => setError(e.message));
  useEffect(() => {
    void reload();
  }, []);
  return { who, error, reload };
}
