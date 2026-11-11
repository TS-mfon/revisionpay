import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  metadataBase: new URL("https://revisionpay.vercel.app"),
  title: {
    default: "RevisionPay — Agree on done. Get paid on approval.",
    template: "%s · RevisionPay",
  },
  description:
    "Clear website revision agreements, AI checks with captured evidence, and PayPal payments approved by the client.",
  openGraph: {
    title: "RevisionPay — Agree on done. Get paid on approval.",
    description:
      "A clear checklist. Evidence of the work. A PayPal payment your client approves.",
    siteName: "RevisionPay",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
