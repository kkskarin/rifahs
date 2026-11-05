import "server-only";
import { cache } from "react";
import { supabaseServer } from "./supabase-server";
import type { Order, OrderStatus } from "./types";

export const getSummary = cache(async () => {
  const db = await supabaseServer();
  const { data } = await db.rpc("ops_summary").single<{
    sales: number;
    spent: number;
    not_dispatched: number;
    open_issues: number;
    express_due: number;
  }>();
  return {
    sales: Number(data?.sales ?? 0),
    spent: Number(data?.spent ?? 0),
    notDispatched: Number(data?.not_dispatched ?? 0),
    openIssues: Number(data?.open_issues ?? 0),
    expressDue: Number(data?.express_due ?? 0),
  };
});

export const getStatusCounts = cache(async () => {
  const db = await supabaseServer();
  const { data } = await db.rpc("order_status_counts");
  const counts = Object.fromEntries(((data ?? []) as { status: OrderStatus; n: number }[]).map((r) => [r.status, Number(r.n)]));
  return counts as Partial<Record<OrderStatus, number>>;
});

export const getIntlOpenCount = cache(async () => {
  const db = await supabaseServer();
  const { count } = await db
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("is_international", true)
    .in("status", ["new", "printing", "stitching", "checking", "ready"]);
  return count ?? 0;
});

const ORDER_COLS =
  "id, shopify_id, order_number, customer_name, customer_email, customer_phone, items, total, currency, source, channel, shopify_source_name, status, is_express, promise_date, is_international, ship_country, ship_city, courier, tracking_number, tracking_url, dispatched_at, shopify_fulfilled, financial_status, notes, tags, placed_at, created_at, updated_at";

export async function listOrders(opts: {
  statuses?: OrderStatus[];
  q?: string;
  express?: boolean;
  international?: boolean;
  orderBy?: "placed_at" | "promise_date";
  limit?: number;
}) {
  const db = await supabaseServer();
  let query = db.from("orders").select(ORDER_COLS);
  if (opts.statuses?.length) query = query.in("status", opts.statuses);
  if (opts.express) query = query.eq("is_express", true);
  if (opts.international) query = query.eq("is_international", true);
  if (opts.q) {
    const q = opts.q.replace(/[%,()]/g, " ").trim();
    const num = q.replace(/^#/, "");
    query = query.or(
      [
        `customer_name.ilike.%${q}%`,
        `order_number.ilike.%${num}%`,
        `customer_phone.ilike.%${q}%`,
        `items_text.ilike.%${q}%`,
        `notes.ilike.%${q}%`,
        `tracking_number.ilike.%${q}%`,
      ].join(","),
    );
  }
  if (opts.orderBy === "promise_date") {
    query = query.order("promise_date", { ascending: true, nullsFirst: false }).order("placed_at", { ascending: true });
  } else {
    query = query.order("placed_at", { ascending: false });
  }
  const { data, error } = await query.limit(opts.limit ?? 500);
  if (error) throw error;
  return (data ?? []) as unknown as Order[];
}
