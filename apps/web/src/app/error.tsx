"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="auth-page">
      <div className="auth-card panel">
        <h1>Let’s try that again.</h1>
        <p>
          This page could not load. Your saved agreements remain available when
          the service reconnects.
        </p>
        <button className="button" onClick={reset}>
          Reload page
        </button>
      </div>
    </main>
  );
}
