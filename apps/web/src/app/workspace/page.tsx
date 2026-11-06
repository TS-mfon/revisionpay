"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Plus, ArrowRight, FileText, Search } from "lucide-react";
import { money, nextAction, type Agreement } from "@revisionpay/domain";
import {
  api,
  Shell,
  useMe,
  Loading,
  ErrorBox,
  Status,
  agreementHref,
} from "@/components/ui";
export default function Workspace() {
  const { who, error: authError } = useMe(),
    [agreements, setAgreements] = useState<Agreement[]>(),
    [error, setError] = useState(""),
    [filter, setFilter] = useState("All"),
    [query, setQuery] = useState(""),
    [profile, setProfile] = useState<any>();
  useEffect(() => {
    if (who) {
      void api("agreements")
        .then((d) => setAgreements(d.agreements))
        .catch((e) => setError(e.message));
      if (who.role === "seller")
        void api("profile")
          .then(setProfile)
          .catch(() => {});
    }
  }, [who]);
  const visible = (agreements || []).filter(
    (a) =>
      (a.title + " " + a.clientName)
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (filter === "All" || nextAction(a, who?.role).group === filter),
  );
  return (
    <Shell who={who}>
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR REAL WORKSPACE</p>
          <h1>
            {who?.name
              ? "Your next step, " + who.name.split(" ")[0] + "."
              : "Your agreements"}
          </h1>
          <p>See what needs your attention and what happens next.</p>
        </div>
        {who?.role === "seller" && (
          <Link className="button" href="/agreements/new">
            <Plus size={18} />
            New revision
          </Link>
        )}
      </div>
      <ErrorBox message={error || authError} />
      {who === null ? (
        <section className="welcome-panel">
          <FileText size={34} />
          <h2>A clear agreement starts here.</h2>
          <p>
            Save your work, invite your client, and keep payment connected to
            their approval.
          </p>
          <Link className="button" href="/login">
            Open your workspace <ArrowRight size={18} />
          </Link>
          <Link className="text-link" href="/demo">
            Explore an example first
          </Link>
        </section>
      ) : !agreements ? (
        <Loading />
      ) : (
        <>
          {profile?.merchant?.status !== "READY" && who?.role === "seller" && (
            <div className="onboarding-strip">
              <div>
                <strong>Set up once. Keep every revision moving.</strong>
                <p>
                  Create a draft now. Connect PayPal before sending it to your
                  client.
                </p>
              </div>
              <Link className="button secondary" href="/settings">
                Set up payments <ArrowRight size={16} />
              </Link>
            </div>
          )}
          {agreements.length === 0 ? (
            <section className="welcome-panel">
              <span className="welcome-number">01</span>
              <h2>What needs to change?</h2>
              <p>
                Start with a page link, a short checklist and your fee. We’ll
                turn them into an agreement your client can review.
              </p>
              <Link className="button" href="/agreements/new">
                Create your first revision <ArrowRight size={18} />
              </Link>
              <p className="small-text">
                Your draft stays private until you send it.
              </p>
            </section>
          ) : (
            <section className="agreement-list">
              <div className="list-toolbar">
                <div className="filter-tabs" aria-label="Filter agreements">
                  {["All", "Needs your action", "Waiting", "Completed"].map(
                    (f) => (
                      <button
                        key={f}
                        aria-pressed={f === filter}
                        className={f === filter ? "selected" : ""}
                        onClick={() => setFilter(f)}
                      >
                        {f}
                      </button>
                    ),
                  )}
                </div>
                <label className="search">
                  <Search size={18} />
                  <input
                    aria-label="Search agreements"
                    placeholder="Find a client or revision"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
              </div>
              {visible.map((a) => (
                <Link
                  className="revision-row"
                  href={agreementHref(a)}
                  key={a.id}
                >
                  <span className="row-avatar">{a.clientName[0]}</span>
                  <div className="row-title">
                    <strong>{a.title}</strong>
                    <span>{a.clientName}</span>
                  </div>
                  <Status agreement={a} />
                  <strong className="row-fee">
                    {money(a.amountMinor)}
                    <small>USD</small>
                  </strong>
                  <span className="row-next">
                    {nextAction(a, who?.role).label}
                    <ArrowRight size={18} />
                  </span>
                </Link>
              ))}
              {visible.length === 0 && (
                <div className="empty">
                  <h3>No agreements here.</h3>
                  <p>Try another filter or search.</p>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </Shell>
  );
}
