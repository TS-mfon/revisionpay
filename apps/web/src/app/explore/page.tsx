"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, BriefcaseBusiness, Plus, Search } from "lucide-react";
import { money } from "@revisionpay/domain";
import type { PublicWork } from "@revisionpay/domain/work";
import {
  api,
  Shell,
  useMe,
  Button,
  Badge,
  Loading,
  ErrorBox,
} from "@/components/ui";

export default function Explorer() {
  const { who } = useMe();
  const [view, setView] = useState("open"),
    [ready, setReady] = useState(false);
  const [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1);
  const [data, setData] = useState<{
    posts: (PublicWork & { myApplicationStatus?: string })[];
    hasMore: boolean;
    mode: string;
  }>();
  const [error, setError] = useState("");
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    setView(
      ["posts", "applications"].includes(q.get("view") || "")
        ? q.get("view")!
        : "open",
    );
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready || (view !== "open" && !who)) return;
    let active = true;
    setError("");
    setData(undefined);
    api(
      "explorer?" +
        new URLSearchParams({ view, q: search, page: String(page) }),
    )
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [view, search, page, ready, who]);
  function tab(value: string) {
    setView(value);
    setPage(1);
    history.replaceState(null, "", "/explore?view=" + value);
  }
  return (
    <Shell who={who} title="Explorer">
      <div className="page-heading">
        <div>
          <p className="eyebrow">THE WORK EXPLORER</p>
          <h1>Clear work. A good match.</h1>
          <p>
            Clients post a page and a checklist. Freelancers apply. Choose each
            other before starting a private agreement.
          </p>
        </div>
        <Link className="button" href="/explore/new">
          <Plus size={18} /> Post work as a client
        </Link>
      </div>
      <div className="explorer-intro">
        <BriefcaseBusiness size={24} />
        <p>
          <strong>Small website revisions, from $25 to $500.</strong> Copy and
          link changes on one public page. Payments currently use PayPal sandbox
          test funds.
        </p>
      </div>
      <div className="list-toolbar">
        <div className="filter-tabs" aria-label="Explore work">
          {[
            ["open", "Find work"],
            ["posts", "My posts"],
            ["applications", "My applications"],
          ].map(([id, label]) => (
            <button
              key={id}
              aria-pressed={view === id}
              className={view === id ? "selected" : ""}
              onClick={() => tab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <form
          className="explorer-search"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setSearch(query.trim());
          }}
        >
          <label className="search">
            <Search size={18} />
            <input
              aria-label="Search posted work"
              placeholder="Search a project or change"
              maxLength={100}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <Button className="secondary">Search</Button>
        </form>
      </div>
      <ErrorBox message={error} />
      {view !== "open" && who === null ? (
        <section className="welcome-panel">
          <h2>Keep your work and applications together.</h2>
          <p>Sign in to see your posts, invitations and applications.</p>
          <Link
            className="button"
            href={
              "/login?returnTo=" + encodeURIComponent("/explore?view=" + view)
            }
          >
            Sign in with Google
          </Link>
        </section>
      ) : !data ? (
        !error && <Loading />
      ) : (
        <>
          {data.posts.length === 0 ? (
            <section className="explorer-empty">
              <BriefcaseBusiness size={32} />
              <h2>
                {search
                  ? "No matching work yet"
                  : view === "posts"
                    ? "Your first work post starts here"
                    : view === "applications"
                      ? "Your next opportunity is out there"
                      : "Be the first to post work"}
              </h2>
              <p>
                {view === "applications"
                  ? "Apply to an open brief. Invitations and your next steps will appear here."
                  : "Post the website change you need, set the fee, and invite a freelancer from the applications."}
              </p>
              <Link
                className="button"
                href={view === "applications" ? "/explore" : "/explore/new"}
              >
                {view === "applications"
                  ? "Browse open work"
                  : "Post a website revision"}
                <ArrowRight size={18} />
              </Link>
            </section>
          ) : (
            <div className="work-grid">
              {data.posts.map((post) => (
                <Link
                  className="work-card"
                  href={"/explore/" + post.id}
                  key={post.id}
                >
                  <div className="section-top">
                    <Badge tone={post.status === "OPEN" ? "green" : "amber"}>
                      {post.status === "OPEN"
                        ? "Accepting applications"
                        : post.status === "INVITED"
                          ? "Invitation pending"
                          : post.status === "ASSIGNED"
                            ? "Freelancer selected"
                            : "Closed"}
                    </Badge>
                    <span className="work-fee">
                      {money(post.amountMinor)}
                      <small> USD</small>
                    </span>
                  </div>
                  <h2>{post.title}</h2>
                  <p>{post.description}</p>
                  <span className="work-meta">
                    Posted by {post.clientName} · {post.requirements.length}{" "}
                    clear requirements
                  </span>
                  <div className="work-card-bottom">
                    <span>
                      {post.status === "INVITED" &&
                      post.myApplicationStatus === "INVITED"
                        ? "You’re invited — respond"
                        : post.myApplicationStatus === "ACCEPTED"
                          ? "Open your agreement"
                          : `${post.applicantCount} ${post.applicantCount === 1 ? "application" : "applications"}`}
                    </span>
                    <ArrowRight size={19} />
                  </div>
                </Link>
              ))}
            </div>
          )}
          {(page > 1 || data.hasMore) && (
            <div className="action-row">
              <Button
                className="secondary"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <span>Page {page}</span>
              <Button
                className="secondary"
                disabled={!data.hasMore}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </Shell>
  );
}
