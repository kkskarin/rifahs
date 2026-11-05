import { NextResponse, type NextRequest } from "next/server";
import { verifyWebhook } from "@/lib/shopify";
import { syncOrderById } from "@/lib/sync";

export const runtime = "nodejs";
export const maxDuration = 26;

// Shopify → ops.rifahs.com. We verify the signature, then re-fetch the order through the
// Admin API so every path (webhook, hourly sync, manual sync) uses one mapping.
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifyWebhook(raw, req.headers.get("x-shopify-hmac-sha256"))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }
  const topic = req.headers.get("x-shopify-topic") ?? "";
  let body: { id?: number; order_id?: number };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const orderId = topic.startsWith("refunds/") ? body.order_id : body.id;
  if (!orderId) return NextResponse.json({ ok: true, skipped: true });

  try {
    await syncOrderById(orderId);
  } catch (e) {
    console.error("webhook sync failed", topic, orderId, e);
    // 500 makes Shopify retry; the hourly sync is a second safety net.
    return NextResponse.json({ error: "sync failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
