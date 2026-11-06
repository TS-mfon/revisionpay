import type { NextConfig } from "next";
const config: NextConfig = {
  transpilePackages: ["@revisionpay/domain"],
  serverExternalPackages: ["mongodb", "genlayer-js"],
  outputFileTracingIncludes: {
    "/*": ["../../contracts/revision_agreement.py"],
  },
  outputFileTracingExcludes: {
    "/*": ["../../.env*", "../../.local/**", "../../.git/**"],
  },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};
export default config;
