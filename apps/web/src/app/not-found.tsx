import Link from "next/link";
export default function NotFound() {
  return (
    <main className="auth-page">
      <div className="auth-card panel">
        <p className="eyebrow">404 · NOT FOUND</p>
        <h1>This page isn’t here.</h1>
        <p>Return to your workspace to find your agreements.</p>
        <Link className="button" href="/workspace">
          Open workspace
        </Link>
      </div>
    </main>
  );
}
