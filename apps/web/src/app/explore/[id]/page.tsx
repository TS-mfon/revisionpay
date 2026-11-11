"use client";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ExternalLink } from "lucide-react";
import { money } from "@revisionpay/domain";
import {
  api,
  Shell,
  useMe,
  Button,
  Badge,
  Loading,
  ErrorBox,
} from "@/components/ui";

export default function WorkDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params),
    { who } = useMe();
  const [data, setData] = useState<any>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState("");
  const [message, setMessage] = useState(""),
    [portfolioUrl, setPortfolioUrl] = useState(""),
    [closing, setClosing] = useState(false);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const d = await api("explorer/" + id);
        if (active) {
          setData(d);
          setError("");
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      }
    }
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [id]);
  async function act(action: string, input: unknown = {}) {
    setBusy(action);
    setError("");
    try {
      setData(await api("explorer/" + id + "/" + action, input));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  const post = data?.post,
    application = data?.application;
  const status = {
    OPEN: "Accepting applications",
    INVITED: "Waiting for the freelancer",
    ASSIGNED: "Agreement started",
    CLOSED: "Closed",
  };
  return (
    <Shell who={who} title="Posted work">
      <Link className="text-link" href="/explore">
        <ArrowLeft size={16} /> Back to Explorer
      </Link>
      <ErrorBox message={error} />
      {!post ? (
        !error && <Loading />
      ) : (
        <>
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {data.isOwner
                  ? "YOUR WORK POST · YOU’RE THE CLIENT"
                  : "A CLIENT IS LOOKING FOR A FREELANCER"}
              </p>
              <h1>{post.title}</h1>
              <p>Posted by {post.clientName}</p>
            </div>
            <div className="work-detail-fee">
              <strong>{money(post.amountMinor)}</strong>
              <span>
                Fixed fee · USD ·{" "}
                {post.mode === "sandbox" ? "test funds" : "live"}
              </span>
            </div>
          </div>
          <div className="work-detail-grid">
            <div>
              <section className="form-section">
                <Badge tone={post.status === "OPEN" ? "green" : "amber"}>
                  {status[post.status as keyof typeof status]}
                </Badge>
                <h2>The work</h2>
                <p className="preserve-lines">{post.description}</p>
                <a
                  className="text-link break-url"
                  href={post.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {post.sourceUrl} <ExternalLink size={15} />
                </a>
                <h2>Agreed outcomes</h2>
                <ol className="work-requirements">
                  {post.requirements.map((r: any) => (
                    <li key={r.id}>{r.description}</li>
                  ))}
                </ol>
              </section>
              {data.isOwner && (
                <section className="form-section">
                  <h2>Applications ({data.applications.length})</h2>
                  <p>
                    Read each proposal and invite one freelancer. They must
                    accept before the private agreement starts.
                  </p>
                  {data.applications.length === 0 && (
                    <div className="empty">
                      <p>
                        No applications yet. Your post is available in the
                        Explorer.
                      </p>
                    </div>
                  )}
                  {data.applications.map((a: any) => (
                    <article className="application-card" key={a.id}>
                      <div className="section-top">
                        <h3>{a.name}</h3>
                        <Badge
                          tone={a.status === "ACCEPTED" ? "green" : "amber"}
                        >
                          {a.status.toLowerCase()}
                        </Badge>
                      </div>
                      <p className="preserve-lines">{a.message}</p>
                      {a.portfolioUrl && (
                        <a
                          className="text-link"
                          href={a.portfolioUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View work sample <ExternalLink size={14} />
                        </a>
                      )}
                      {post.status === "OPEN" && a.status === "APPLIED" && (
                        <Button
                          busy={busy === "invite"}
                          onClick={() => act("invite", { applicationId: a.id })}
                        >
                          Invite {a.name}
                          <ArrowRight size={16} />
                        </Button>
                      )}
                    </article>
                  ))}
                </section>
              )}
            </div>
            <aside className="work-next">
              {data.agreementId ? (
                <section className="form-section">
                  <Check size={27} />
                  <h2>Your agreement is ready</h2>
                  <p>
                    {data.isOwner
                      ? "Your freelancer will finish setup and freeze the requirements. Then review and authorize the fee. You approve the completed work before payment."
                      : "Review your draft, connect PayPal if needed, then create the client link. Your client already has access through their account."}
                  </p>
                  <Link
                    className="button"
                    href={
                      "/agreements/" +
                      data.agreementId +
                      (data.agreementRole === "seller"
                        ? "?view=freelancer"
                        : "")
                    }
                  >
                    Open agreement <ArrowRight size={18} />
                  </Link>
                </section>
              ) : data.preparingAgreement ? (
                <section className="form-section">
                  <h2>Preparing your agreement</h2>
                  <p>
                    The invitation was accepted. The agreement is being saved.
                  </p>
                  {!data.isOwner && (
                    <Button
                      busy={busy === "respond"}
                      onClick={() => act("respond", { accept: true })}
                    >
                      Finish creating agreement
                    </Button>
                  )}
                </section>
              ) : data.isOwner ? (
                <section className="form-section">
                  <h2>
                    {post.status === "INVITED"
                      ? "Invitation sent in RevisionPay"
                      : post.status === "CLOSED"
                        ? "This post is closed"
                        : "Choose who you work with"}
                  </h2>
                  <p>
                    {post.status === "INVITED"
                      ? "The selected freelancer can accept from My applications. No email has been sent. Your agreement will appear here when they accept."
                      : post.status === "CLOSED"
                        ? "This brief is no longer accepting applications."
                        : "Applications appear here. Inviting a freelancer reserves this post while they decide."}
                  </p>
                  {post.status !== "CLOSED" &&
                    (closing ? (
                      <div>
                        <p>
                          Close this post and stop accepting applications? Any
                          pending work invitation will end.
                        </p>
                        <div className="action-row">
                          <Button
                            busy={busy === "close"}
                            onClick={() => act("close")}
                          >
                            Close post
                          </Button>
                          <Button
                            className="secondary"
                            onClick={() => setClosing(false)}
                          >
                            Keep open
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        className="secondary"
                        onClick={() => setClosing(true)}
                      >
                        Close this post
                      </Button>
                    ))}
                </section>
              ) : application?.status === "INVITED" &&
                post.status === "INVITED" ? (
                <section className="form-section">
                  <p className="eyebrow">YOU’RE INVITED</p>
                  <h2>{post.clientName} chose your application.</h2>
                  <p>
                    Accept to create your private agreement for{" "}
                    {money(post.amountMinor)}. Connect PayPal before sharing it.
                    Work starts after the client authorizes the fee.
                  </p>
                  <Button
                    busy={busy === "respond"}
                    onClick={() => act("respond", { accept: true })}
                  >
                    Accept invitation <ArrowRight size={18} />
                  </Button>
                  <Button
                    className="secondary"
                    disabled={Boolean(busy)}
                    onClick={() => act("respond", { accept: false })}
                  >
                    Decline invitation
                  </Button>
                </section>
              ) : application ? (
                <section className="form-section">
                  <h2>
                    {post.status === "CLOSED"
                      ? "This post is closed"
                      : post.status === "ASSIGNED"
                        ? "A freelancer has been selected"
                        : application.status === "APPLIED"
                          ? "Application sent"
                          : "Application " + application.status.toLowerCase()}
                  </h2>
                  <p className="preserve-lines">{application.message}</p>
                  {application.status === "APPLIED" &&
                    post.status === "OPEN" && (
                      <>
                        <p>
                          You’ll see an invitation here and in My applications
                          if the client selects you.
                        </p>
                        <Button
                          className="secondary"
                          busy={busy === "withdraw"}
                          onClick={() => act("withdraw")}
                        >
                          Withdraw application
                        </Button>
                      </>
                    )}
                </section>
              ) : post.status === "OPEN" ? (
                <section className="form-section">
                  <p className="eyebrow">YOU’RE THE FREELANCER</p>
                  <h2>Apply for this revision</h2>
                  <p>
                    Explain how you’ll handle the checklist. The client will
                    review your application before inviting you.
                  </p>
                  {!who || who.kind === "demo" ? (
                    <Link
                      className="button"
                      href={
                        "/login?returnTo=" +
                        encodeURIComponent("/explore/" + id)
                      }
                    >
                      Sign in to apply <ArrowRight size={18} />
                    </Link>
                  ) : (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void act("apply", {
                          message,
                          ...(portfolioUrl.trim()
                            ? { portfolioUrl: portfolioUrl.trim() }
                            : {}),
                        });
                      }}
                    >
                      <label>
                        Your proposal
                        <textarea
                          required
                          minLength={20}
                          maxLength={1200}
                          rows={5}
                          value={message}
                          onChange={(e) => setMessage(e.target.value)}
                          placeholder="Here’s how I would complete these changes…"
                        />
                      </label>
                      <label>
                        Work sample URL{" "}
                        <span className="optional">Optional</span>
                        <input
                          type="url"
                          value={portfolioUrl}
                          onChange={(e) => setPortfolioUrl(e.target.value)}
                          placeholder="https://your-portfolio.com"
                        />
                      </label>
                      <Button busy={busy === "apply"}>
                        Send application <ArrowRight size={18} />
                      </Button>
                      <p className="small-text">
                        Your proposal is visible only to you and the client.
                      </p>
                    </form>
                  )}
                </section>
              ) : null}
            </aside>
          </div>
        </>
      )}
    </Shell>
  );
}
