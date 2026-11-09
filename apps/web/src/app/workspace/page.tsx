"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Plus, ArrowRight, FileText, Search } from "lucide-react";
import { money, nextAction, type Agreement } from "@revisionpay/domain";
import { AgreementTemplates } from "@/components/agreement-templates";
import {
  api,
  Shell,
  useMe,
  Loading,
  ErrorBox,
  Status,
  agreementHref,
  Button,
  RetryPanel,
} from "@/components/ui";
export default function Workspace() {
  const { who, error: authError } = useMe(),
    [agreements, setAgreements] = useState<Agreement[]>(),
    [error, setError] = useState(""),
    [filter, setFilter] = useState("All"),
    [query, setQuery] = useState(""),
    [profile, setProfile] = useState<any>(),
    [profileError, setProfileError] = useState("");
  async function loadProfile() {
    try {
      setProfile(await api("profile"));
      setProfileError("");
    } catch {
      setProfileError(
        "Payment setup could not be checked. You can still open your saved agreements.",
      );
    }
  }
  useEffect(() => {
    if (who) {
      void api("agreements")
        .then((d) => setAgreements(d.agreements))
        .catch((e) => setError(e.message));
      if (who.role === "seller") void loadProfile();
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
          <p className="eyebrow">YOUR WORKSPACE</p>
          <h1>
            {who?.name
              ? "Your next step, " + who.name.split(" ")[0] + "."
              : "Your agreements"}
          </h1>
          <p>
            Agree on website changes, share them with your client, and get paid
            after approval.
          </p>
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
        error || authError ? (
          <RetryPanel onRetry={() => location.reload()} />
        ) : (
          <Loading />
        )
      ) : (
        <>
          {who?.role === "seller" && (
            <details className="workspace-start" open={agreements.length === 0}>
              <summary>
                New here? Here’s how to finish your first agreement
              </summary>
              <p>
                Start with a ready-made test agreement or add your own page. You
                are the freelancer; your client reviews the work and decides
                when to pay.
              </p>
              <ol>
                <li>
                  <strong>Create a draft.</strong> Choose a page, 3–5 changes
                  and a fixed fee.
                </li>
                <li>
                  <strong>Share the client link.</strong> Connect PayPal first.
                  Your client reviews the agreement and authorizes the fee
                  without paying yet.
                </li>
                <li>
                  <strong>Submit the updated page.</strong> Publish the changes,
                  then return here to check them.
                </li>
                <li>
                  <strong>Your client approves.</strong> They review the work
                  and approve payment, or ask for changes.
                </li>
              </ol>
              {profile?.readiness?.mode !== "live" && (
                <a className="text-link" href="#templates">
                  Choose a ready-made test agreement ↓
                </a>
              )}
            </details>
          )}
          {profile?.readiness?.mode !== "live" && profile && (
            <div className="notice info">
              <div>
                <strong>Connected PayPal testing · no real money</strong>
                <p>
                  This workspace saves real agreements and uses PayPal sandbox
                  accounts. Live payments are not enabled.
                </p>
              </div>
            </div>
          )}
          {profileError && (
            <div className="notice warning">
              <p>{profileError}</p>
              <Button className="secondary" onClick={loadProfile}>
                Check setup again
              </Button>
            </div>
          )}
          {profile &&
            profile.merchant?.status !== "READY" &&
            who?.role === "seller" && (
              <div className="onboarding-strip">
                <div>
                  <strong>Connect PayPal before sharing with a client</strong>
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
            <p>
              No agreements yet. Pick a template below, or choose New revision
              to use your own page.
            </p>
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
                  href={
                    who?.role === "buyer"
                      ? "/agreements/" + a.id
                      : agreementHref(a)
                  }
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
          {who?.role === "seller" && profile?.readiness?.mode !== "live" && (
            <div id="templates">
              <AgreementTemplates />
            </div>
          )}
        </>
      )}
    </Shell>
  );
}
