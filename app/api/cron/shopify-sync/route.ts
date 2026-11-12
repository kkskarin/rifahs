import { NextResponse, type NextRequest } from "next/server";
import { shopifyConfigured } from "@/lib/shopify";
import { syncBudgetMs, syncRecent, syncStock } from "@/lib/sync";

export const runtime = "nodejs";
export const maxDuration = 26;

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!shopifyConfigured()) return NextResponse.json({ ok: false, reason: "shopify not configured" });
  const r = await syncRecent(syncBudgetMs());
  const stock = await syncStock();
  return NextResponse.json({ ok: true, ...r, stock });
}
