import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Shown in the ☰ menu so anyone can tell which build their device is running.
  env: {
    NEXT_PUBLIC_BUILD: `${(process.env.COMMIT_REF ?? "local").slice(0, 7)} · ${new Date().toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}`,
  },
  images: { remotePatterns: [{ protocol: "https", hostname: "cdn.shopify.com" }] },
  async redirects() {
    return [
      { source: "/money", destination: "/reports", permanent: false },
      { source: "/issues", destination: "/disputes", permanent: false },
      { source: "/orders/:id((?!new$)[0-9a-f-]{36})", destination: "/order?id=:id", permanent: false },
    ];
  },
};

export default nextConfig;
