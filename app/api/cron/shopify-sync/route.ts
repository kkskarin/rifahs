import { NextResponse, type NextRequest } from "next/server";
import { shopifyConfigured } from "@/lib/shopify";
import { syncBudgetMs, syncDeliveries, syncRecent, syncStock } from "@/lib/sync";

export const runtime = "nodejs";
export const maxDuration = 26;

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!shopifyConfigured()) return NextResponse.json({ ok: false, reason: "shopify not configured" });
  const r = await syncRecent(syncBudgetMs());
  const stock = await syncStock();
  const deliveries = await syncDeliveries(3_000).catch((e) => ({ error: (e as Error).message }));
  return NextResponse.json({ ok: true, ...r, stock, deliveries });
}
