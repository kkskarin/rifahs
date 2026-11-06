import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: { remotePatterns: [{ protocol: "https", hostname: "cdn.shopify.com" }] },
  async redirects() {
    return [
      { source: "/money", destination: "/reports", permanent: false },
      { source: "/orders/:id((?!new$)[0-9a-f-]{36})", destination: "/order?id=:id", permanent: false },
    ];
  },
};

export default nextConfig;
