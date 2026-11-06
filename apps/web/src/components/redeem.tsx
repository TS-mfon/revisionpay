"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { api, Logo, Loading, ErrorBox, Button } from "./ui";
export function Redeem({ owner = false }: { owner?: boolean }) {
  const started = useRef(false),
    token = useRef(""),
    router = useRouter(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function redeem() {
    if (!token.current) {
      setError(
        "Open the complete private link you received, including the text after #.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      const d = await api(owner ? "owner/redeem" : "invite/redeem", {
        token: token.current,
      });
      history.replaceState(null, "", location.pathname);
      router.replace(owner ? "/workspace" : "/agreements/" + d.agreementId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    token.current = location.hash.slice(1);
    void redeem();
  }, []);
  return (
    <div className="auth-screen">
      <header className="product-header">
        <Logo />
      </header>
      <main className="auth-card">
        <p className="eyebrow">PRIVATE INVITATION</p>
        <h1>
          {owner ? "Opening your workspace" : "Let’s review your agreement"}
        </h1>
        {error ? (
          <>
            <ErrorBox message={error} />
            <p>
              If you already opened this link, return from the same browser. You
              can also sign in with the Google account matching the email your
              freelancer invited.
            </p>
            {token.current && (
              <Button onClick={redeem} busy={busy}>
                Try opening again
              </Button>
            )}
            <Link className="button secondary" href="/login">
              Sign in with Google <ArrowRight size={18} />
            </Link>
          </>
        ) : (
          <Loading message="Opening your private agreement…" />
        )}
        <Link className="text-link" href="/help#access">
          Help with access
        </Link>
      </main>
    </div>
  );
}
