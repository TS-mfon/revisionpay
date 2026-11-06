"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  Check,
  CircleHelp,
  Command,
  FileCheck2,
  LayoutGrid,
  LoaderCircle,
  LogOut,
  Plus,
  ShieldCheck,
} from "lucide-react";
import type { Actor, Agreement } from "@revisionpay/domain";
import { displayStatus } from "@revisionpay/domain";

export async function api<T = any>(path: string, data?: unknown): Promise<T> {
  const response = await fetch("/api/" + path, {
    method: data === undefined ? "GET" : "POST",
    headers: data === undefined ? {} : { "Content-Type": "application/json" },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    cache: "no-store",
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error(body.message || "The request could not be completed.");
  return body;
}
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
      disabled={props.disabled || busy}
    >
      {busy && <LoaderCircle size={16} className="spin" />}
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
  const status = displayStatus(agreement);
  return <Badge tone={status.tone}>{status.label}</Badge>;
}
export function ErrorBox({ message }: { message?: string }) {
  return message ? (
    <div role="alert" className="notice error">
      <CircleHelp size={18} />
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
    <div className="loading">
      <LoaderCircle size={22} className="spin" />
      <p>{message}</p>
    </div>
  );
}
export function ShortHash({ value, label }: { value?: string; label: string }) {
  return (
    <div className="hash-row">
      <span>{label}</span>
      <code title={value}>
        {value
          ? value.length > 28
            ? value.slice(0, 16) + "…" + value.slice(-8)
            : value
          : "Not available yet"}
      </code>
      {value && (
        <button
          className="icon-button"
          onClick={() => navigator.clipboard.writeText(value)}
          aria-label={"Copy " + label}
        >
          <Command size={13} />
        </button>
      )}
    </div>
  );
}
export function formatDate(value?: string) {
  return value
    ? new Date(value).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";
}
export function Shell({
  children,
  who,
  onRole,
  title = "Workspace",
}: {
  children: ReactNode;
  who?: Actor | null;
  onRole?: () => void;
  title?: string;
}) {
  const path = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function switchRole() {
    setBusy(true);
    setError("");
    try {
      await api("demo/role", {
        role: who?.role === "seller" ? "buyer" : "seller",
      });
      onRole ? onRole() : window.location.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="app-shell">
      <a className="skip-link" href="#content">
        Skip to content
      </a>
      <aside className="sidebar">
        <Logo light />
        <div className="workspace-name">
          <span className="workspace-avatar">
            {who?.kind === "demo" ? "D" : "R"}
          </span>
          <div>
            <strong>
              {who?.kind === "demo" ? "Demo studio" : "Your studio"}
            </strong>
            <small>Website revision workspace</small>
          </div>
        </div>
        <span className="nav-label">WORKSPACE</span>
        <nav>
          <Link
            className={
              path === "/workspace" || path.startsWith("/agreements")
                ? "active"
                : ""
            }
            href="/workspace"
          >
            <LayoutGrid size={18} />
            Agreements
          </Link>
          {who?.role !== "buyer" && (
            <Link href="/agreements/new">
              <Plus size={18} />
              New agreement
            </Link>
          )}
          {who?.kind === "owner" && (
            <Link className={path === "/ops" ? "active" : ""} href="/ops">
              <ShieldCheck size={18} />
              Service status
            </Link>
          )}
          <a href="/#how-it-works">
            <CircleHelp size={18} />
            How it works
            <ArrowUpRight size={13} />
          </a>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <FileCheck2 size={21} />
            <strong>Good work. Clear terms.</strong>
            <p>One shared definition of done, from agreement to payment.</p>
          </div>
          <div className="profile">
            <span className="profile-avatar">
              {who?.role === "buyer" ? "B" : "S"}
            </span>
            <div>
              <strong>
                {who?.role === "buyer" ? "Buyer view" : "Seller view"}
              </strong>
              <small>
                {who?.kind === "demo"
                  ? "Private demo session"
                  : "Secure workspace"}
              </small>
            </div>
            {who && (
              <button
                className="icon-button"
                aria-label="Sign out"
                onClick={async () => {
                  await api("logout", {});
                  router.push("/");
                }}
              >
                <LogOut size={16} />
              </button>
            )}
          </div>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <div className="crumb">
            Your studio <span>/</span> <strong>{title}</strong>
          </div>
          <div className="topbar-right">
            <Badge tone={who?.kind === "demo" ? "amber" : "blue"}>
              {who?.kind === "demo" ? "Demo simulation" : "Sandbox workspace"}
            </Badge>
            {who?.kind === "demo" && (
              <Button
                className="small secondary"
                onClick={switchRole}
                busy={busy}
              >
                Switch to {who.role === "seller" ? "buyer" : "seller"}
              </Button>
            )}
          </div>
        </header>
        <main id="content" className="content">
          {who?.kind === "demo" && (
            <div className="demo-banner">
              <span className="demo-icon">D</span>
              <p>
                <strong>You’re in a private demo.</strong> Payments and
                verification are simulated. Try both roles to follow a revision
                from start to finish.
              </p>
            </div>
          )}
          <ErrorBox message={error} />
          {children}
        </main>
        <footer className="app-footer">
          <span>RevisionPay · Built for work that’s ready.</span>
          <span>
            PayPal sandbox <i>×</i> GenLayer Studionet
          </span>
        </footer>
      </div>
    </div>
  );
}
export function useMe() {
  const [who, setWho] = useState<Actor | null>();
  const [error, setError] = useState("");
  const reload = () =>
    api("me")
      .then((d) => setWho(d.actor))
      .catch((e) => setError(e.message));
  useEffect(() => {
    void reload();
  }, []);
  return { who, error, reload };
}
