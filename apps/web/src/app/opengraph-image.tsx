import { ImageResponse } from "next/og";
export const alt =
  "RevisionPay — Agree on done. Get paid on approval. PayPal + AI for clearer freelance website revisions.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          background: "#eef2e8",
          color: "#153b30",
          padding: 64,
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 26,
          }}
        >
          <strong>revisionpay</strong>
          <span>PayPal + AI</span>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: 78,
            fontWeight: 700,
            letterSpacing: -4,
            lineHeight: 1.05,
          }}
        >
          <span>Agree on done.</span>
          <span>Get paid on approval.</span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 25,
          }}
        >
          <span>Clear scope. Captured evidence. Client control.</span>
          <span
            style={{
              background: "#d9f389",
              padding: "14px 24px",
              borderRadius: 30,
            }}
          >
            revisionpay.vercel.app
          </span>
        </div>
      </div>
    ),
    size,
  );
}
