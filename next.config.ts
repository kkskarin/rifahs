import type { NextConfig } from "next";
import { writeFileSync } from "node:fs";

// The commit this build is made from. Also written to /version.json (a plain public file, no login needed)
// so an open app can tell when a newer build has been published and offer a reload.
const COMMIT = (process.env.COMMIT_REF ?? "local").slice(0, 7);
try {
  writeFileSync("public/version.json", JSON.stringify({ commit: COMMIT }));
} catch {}


const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Bill photos and PDFs are sent to the server to be read, so allow a larger request than the 1 MB default.
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
  // Shown in the ☰ menu so anyone can tell which build their device is running.
  env: {
    NEXT_PUBLIC_COMMIT: COMMIT,
    NEXT_PUBLIC_BUILD: `${COMMIT} · ${new Date().toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}`,
  },
  images: { remotePatterns: [{ protocol: "https", hostname: "cdn.shopify.com" }] },
  async redirects() {
    return [
      { source: "/money", destination: "/reports", permanent: false },
      { source: "/purchase", destination: "/expenses", permanent: false },
      { source: "/issues", destination: "/disputes", permanent: false },
      { source: "/orders/:id((?!new$)[0-9a-f-]{36})", destination: "/order?id=:id", permanent: false },
    ];
  },
};

export default nextConfig;
