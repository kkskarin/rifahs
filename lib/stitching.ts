"use client";

import useSWR, { mutate } from "swr";
import { sb } from "./supabase-browser";

export type StitchLine = { id: string; product_id: string; size: string; qty: number; received: number; order_id: string | null; item_index: number | null };
export type StitchingOrder = {
  id: string;
  number: number;
  tailor: string;
  notes: string;
  status: "committed" | "sent" | "received" | "cancelled";
  created_at: string;
  sent_at: string | null;
  received_at: string | null;
  lines: StitchLine[];
};

/** Stitching orders: the document that commits fabric sets to the tailor (spec: Committed to Stitch → In Stitching → On Hand). */
export function useStitchingOrders() {
  return useSWR<StitchingOrder[]>(
    "stitching-orders",
    async () => {
      const { data, error } = await sb()
        .from("stitching_orders")
        .select("id, number, tailor, notes, status, created_at, sent_at, received_at, lines:stitching_order_lines(id, product_id, size, qty, received, order_id, item_index)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as StitchingOrder[];
    },
    { revalidateOnFocus: true, dedupingInterval: 4000, keepPreviousData: true },
  );
}

type R = { ok: boolean; message?: string };
const refresh = () => {
  mutate("stitching-orders");
  mutate("products");
  mutate("orders");
};
async function call(fn: string, args: Record<string, unknown>, done: string): Promise<R> {
  const { error } = await sb().rpc(fn, args);
  refresh();
  return error ? { ok: false, message: error.message } : { ok: true, message: done };
}

export type NewStitchLine = { product_id: string; size: string; qty: number; order_id: string | null; item_index: number | null };
export const createStitchingOrder = (lines: NewStitchLine[], tailor: string, notes: string) =>
  call("create_stitching_order", { p_lines: lines, p_tailor: tailor, p_notes: notes }, "Stitching order created. The fabric is now Committed to Stitch.");
export const sendStitchingOrder = (id: string) => call("send_stitching_order", { p_id: id }, "Sent to the tailor. The sets are now In Stitching.");
export const receiveStitchLine = (line: string, qty: number) => call("receive_stitching_line", { p_line: line, p_qty: qty }, "Received.");
export const cancelStitchingOrder = (id: string) => call("cancel_stitching_order", { p_id: id }, "Cancelled. The fabric is back On Hand.");
/** Give On Hand stock to "Order Received" items, oldest order first. */
export async function allocateOnHand(): Promise<R & { n?: number }> {
  const { data, error } = await sb().rpc("allocate_on_hand");
  refresh();
  if (error) return { ok: false, message: error.message };
  const n = Number(data ?? 0);
  return { ok: true, n, message: n ? `${n} item${n === 1 ? "" : "s"} moved to Committed to Dispatch.` : "No On Hand stock matches the waiting orders." };
}
