import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: { remotePatterns: [{ protocol: "https", hostname: "cdn.shopify.com" }] },
};

export default nextConfig;
