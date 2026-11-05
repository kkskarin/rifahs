import "server-only";
import { headers } from "next/headers";

/**
 * The address people are using right now — rifahs.netlify.app today, ops.rifahs.com later —
 * taken from the request, so nothing needs changing when the domain changes.
 * NEXT_PUBLIC_SITE_URL, if set, wins.
 */
export async function siteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) return `${h.get("x-forwarded-proto") ?? "https"}://${host}`;
  return process.env.URL ?? "";
}
