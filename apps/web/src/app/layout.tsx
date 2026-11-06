import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "RevisionPay — Good work deserves a clear path to payment",
    template: "%s · RevisionPay",
  },
  description:
    "Agree on website revisions, verify the delivered version, and collect the authorized PayPal payment. Built with GenLayer Studionet.",
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
