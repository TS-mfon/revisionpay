"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCheck,
  FilePlus2,
  Plus,
  Search,
} from "lucide-react";
import { money, type Agreement } from "@revisionpay/domain";
import {
  api,
  Shell,
  useMe,
  Loading,
  ErrorBox,
  Status,
  formatDate,
} from "@/components/ui";
export default function Workspace() {
  const { who, error: authError, reload } = useMe();
  const [agreements, setAgreements] = useState<Agreement[]>();
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All agreements");
  useEffect(() => {
    if (who)
      void api("agreements")
        .then((d) => setAgreements(d.agreements))
        .catch((e) => setError(e.message));
  }, [who]);
  const visible = (agreements || []).filter(
    (a) =>
      (a.title + a.clientName).toLowerCase().includes(query.toLowerCase()) &&
      (filter === "All agreements" ||
        (filter === "Completed"
          ? a.payment.status === "PAID"
          : a.payment.status !== "PAID" && a.state !== "CANCELED")),
  );
  return (
    <Shell who={who} onRole={reload}>
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR WORK, MOVING FORWARD</p>
          <h1>Agreements</h1>
          <p>One place for the work, the evidence, and the payment.</p>
        </div>
        {who?.role === "seller" && (
          <Link href="/agreements/new" className="button">
            <Plus size={17} />
            New agreement
          </Link>
        )}
      </div>
      <ErrorBox message={error || authError} />
      {who === null ? (
        <div className="empty panel">
          <FilePlus2 size={35} />
          <h2>Your studio is one step away.</h2>
          <p>
            Sign in as the seller, open a buyer invitation, or try the private
            demo.
          </p>
          <Link className="button" href="/">
            Start here <ArrowUpRight size={16} />
          </Link>
        </div>
      ) : !agreements ? (
        <Loading />
      ) : (
        <>
          <div className="metrics">
            {[
              {
                title: "Awaiting completion",
                value: money(
                  agreements
                    .filter((a) => a.payment.status === "AUTHORIZED")
                    .reduce((n, a) => n + a.amountMinor, 0),
                ),
                caption: "Authorized, not yet charged",
                icon: ArrowDownLeft,
              },
              {
                title: "Work in progress",
                value: String(
                  agreements.filter((a) =>
                    ["ACTIVE", "REVIEW_HOLD"].includes(a.state),
                  ).length,
                ).padStart(2, "0"),
                caption: "Active revision agreements",
                icon: FilePlus2,
              },
              {
                title: "Payments completed",
                value: money(
                  agreements
                    .filter((a) => a.payment.status === "PAID")
                    .reduce((n, a) => n + a.amountMinor, 0),
                ),
                caption:
                  who?.kind === "demo"
                    ? "Simulated payments"
                    : "Confirmed in PayPal sandbox",
                icon: CheckCheck,
              },
            ].map((m) => (
              <div className="metric panel" key={m.title}>
                <div>
                  <span>{m.title}</span>
                  <m.icon size={19} />
                </div>
                <strong>{m.value}</strong>
                <small>{m.caption}</small>
              </div>
            ))}
          </div>
          <section className="panel agreements-panel">
            <div className="list-toolbar">
              <div className="filter-tabs">
                {["All agreements", "In progress", "Completed"].map((f) => (
                  <button
                    className={f === filter ? "selected" : ""}
                    onClick={() => setFilter(f)}
                    key={f}
                  >
                    {f}
                    {f === "All agreements" && <span>{agreements.length}</span>}
                  </button>
                ))}
              </div>
              <label className="search">
                <Search size={16} />
                <input
                  aria-label="Search agreements"
                  placeholder="Find an agreement…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
            </div>
            <div className="agreement-table">
              <div className="table-header">
                <span>AGREEMENT / CLIENT</span>
                <span>STATUS</span>
                <span>REVISION FEE</span>
                <span>LAST UPDATED</span>
              </div>
              {visible.map((a) => (
                <Link
                  className="table-row"
                  key={a.id}
                  href={"/agreements/" + a.id}
                >
                  <div className="agreement-cell">
                    <span className="client-icon small">{a.clientName[0]}</span>
                    <div>
                      <strong>{a.title}</strong>
                      <small>{a.clientName}</small>
                    </div>
                  </div>
                  <Status agreement={a} />
                  <strong className="table-amount">
                    {money(a.amountMinor)}
                    <small>USD</small>
                  </strong>
                  <span className="table-date">
                    {formatDate(a.updatedAt)}
                    <ArrowUpRight size={16} />
                  </span>
                </Link>
              ))}
              {visible.length === 0 && (
                <div className="empty">
                  <Search size={26} />
                  <h3>
                    {query ? "No matching agreements" : "Nothing here yet"}
                  </h3>
                  <p>
                    {query
                      ? "Try another search or status."
                      : "Create an agreement to get the next revision moving."}
                  </p>
                </div>
              )}
            </div>
          </section>
          <p className="under-table">
            <ShieldMark />
            Payments are collected only after the agreed conditions are met.
          </p>
        </>
      )}
    </Shell>
  );
}
function ShieldMark() {
  return <CheckCheck size={15} />;
}
