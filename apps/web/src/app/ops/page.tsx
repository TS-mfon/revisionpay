"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, RefreshCw, Server, ShieldCheck } from "lucide-react";
import {
  api,
  Shell,
  useMe,
  ErrorBox,
  Badge,
  Button,
  Loading,
} from "@/components/ui";
import type { Agreement } from "@revisionpay/domain";
export default function Operations() {
  const { who, error: authError } = useMe();
  const [data, setData] = useState<{
    readiness: Record<string, any>;
    agreements: Agreement[];
  }>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const load = () =>
    api("ops")
      .then(setData)
      .catch((e) => setError(e.message));
  useEffect(() => {
    if (who) void load();
  }, [who]);
  return (
    <Shell who={who} title="Service status">
      <div className="page-heading">
        <div>
          <p className="eyebrow">OWNER OPERATIONS</p>
          <h1>A clear view of every service.</h1>
          <p>Configuration and payment outcomes for your sandbox workspace.</p>
        </div>
        <Button className="secondary" onClick={load}>
          <RefreshCw size={16} />
          Refresh
        </Button>
      </div>
      <ErrorBox message={error || authError} />
      {!data ? (
        !error && <Loading />
      ) : (
        <>
          <div className="service-grid">
            {[
              {
                id: "database",
                name: "MongoDB Atlas",
                description: "Durable agreement state and leased jobs",
              },
              {
                id: "paypal",
                name: "PayPal sandbox",
                description: "Orders, authorizations, capture, and void",
              },
              {
                id: "genlayer",
                name: "GenLayer Studionet",
                description: "Dedicated development relayer · chain 61999",
              },
              {
                id: "capture",
                name: "Page capture",
                description: "Isolated Vercel browser function",
              },
            ].map((s) => (
              <article className="panel service-card" key={s.id}>
                <Server size={22} />
                <h2>{s.name}</h2>
                <p>{s.description}</p>
                <Badge tone={data.readiness[s.id] ? "green" : "amber"}>
                  {data.readiness[s.id] ? "Configured" : "Setup needed"}
                </Badge>
              </article>
            ))}
          </div>
          <div className="notice neutral">
            <ShieldCheck size={18} />
            <p>
              These indicators confirm configuration, not a live service health
              check. Settlement is{" "}
              {data.readiness.paused ? "paused" : "enabled"}. Preview
              deployments always pause settlement.
            </p>
          </div>
          <section className="panel ops-list">
            <div className="panel-title">
              <CheckCircle2 size={21} />
              <div>
                <h2>Payment reconciliation</h2>
                <p>
                  Reads authoritative PayPal state. Never sends a second
                  capture.
                </p>
              </div>
            </div>
            {data.agreements
              .filter((a) => a.payment.orderId)
              .map((a) => (
                <div className="ops-row" key={a.id}>
                  <div>
                    <Link href={"/agreements/" + a.id}>{a.title}</Link>
                    <small>{a.payment.status}</small>
                  </div>
                  <Button
                    className="secondary small"
                    busy={busy === a.id}
                    onClick={async () => {
                      setBusy(a.id);
                      setError("");
                      try {
                        await api(`agreements/${a.id}/reconcile`, {});
                        await load();
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        setBusy("");
                      }
                    }}
                  >
                    Reconcile
                  </Button>
                </div>
              ))}
            {!data.agreements.some((a) => a.payment.orderId) && (
              <div className="empty">
                <p>No PayPal orders to reconcile yet.</p>
              </div>
            )}
          </section>
        </>
      )}
    </Shell>
  );
}
