import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  typedRoutes: true,
  serverExternalPackages: ["pdf-parse", "mammoth"],
  // Dev only: lets a phone/laptop on the LAN load HMR assets when the app is opened via the network URL.
  allowedDevOrigins: ["192.168.1.3"],
  images: { remotePatterns: [] },
  // Security headers that do not need a per-request nonce live here; CSP is set in src/proxy.ts.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
