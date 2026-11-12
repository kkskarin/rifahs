"use client";

import useSWR, { mutate } from "swr";
import { sb } from "./supabase-browser";
import { isOpen, type OrderRow } from "./store";
import type { Order, Product, Profile, StockField, StockMove } from "./types";

/** Same rule as the database's norm_design(): "Mitti - Rose (Unstitched)" → "mittirose". */
export function normDesign(t: string | null | undefined) {
  return (t ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b(unstitched|stitched|suit set|set|printed|pants?)\b|[()]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function useProducts() {
  return useSWR<Product[]>(
    "products",
    async () => {
      const { data, error } = await sb().from("products").select("*, stitched:stitched_stock(size, qty)").order("name");
      if (error) throw error;
      return (data ?? []) as Product[];
    },
    { revalidateOnFocus: true, dedupingInterval: 4000, keepPreviousData: true },
  );
}

export function useMoves(productId: string | null) {
  return useSWR<StockMove[]>(
    productId ? ["moves", productId] : null,
    async () => {
      const { data, error } = await sb()
        .from("stock_moves")
        .select("*")
        .eq("product_id", productId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as StockMove[];
    },
  );
}

export type Demand = {
  waiting: Order[]; // New / Printing — still needs fabric from stock
  inWork: Order[]; // Stitching / Checking / Ready — fabric already used
  waitingQty: number;
  inWorkQty: number;
};

/** Which open orders need each design, plus ordered designs we don't track yet. */
export function demandByProduct(products: Product[] | undefined, orders: OrderRow[] | undefined) {
  const keyToId = new Map<string, string>();
  for (const p of products ?? []) for (const n of [p.name, ...p.aliases]) keyToId.set(normDesign(n), p.id);

  const demand = new Map<string, Demand>();
  const untracked = new Map<string, { title: string; qty: number; orders: Order[] }>();
  for (const o of orders ?? []) {
    if (!isOpen(o)) continue;
    const early = o.status === "new" || o.status === "printing";
    for (const it of o.items ?? []) {
      const qty = Number(it.quantity || 1);
      const id = keyToId.get(normDesign(it.title));
      if (!id) {
        const k = normDesign(it.title);
        const u = untracked.get(k) ?? { title: it.title, qty: 0, orders: [] };
        u.qty += qty;
        if (!u.orders.includes(o)) u.orders.push(o);
        untracked.set(k, u);
        continue;
      }
      const d = demand.get(id) ?? { waiting: [], inWork: [], waitingQty: 0, inWorkQty: 0 };
      if (early) {
        d.waitingQty += qty;
        if (!d.waiting.includes(o)) d.waiting.push(o);
      } else {
        d.inWorkQty += qty;
        if (!d.inWork.includes(o)) d.inWork.push(o);
      }
      demand.set(id, d);
    }
  }
  return { demand, untracked: [...untracked.values()].sort((a, b) => b.qty - a.qty), keyToId };
}

function patchProduct(id: string, fn: (p: Product) => Product) {
  return mutate<Product[]>("products", (l) => (l ?? []).map((p) => (p.id === id ? fn(p) : p)), { revalidate: false });
}

function applyLocal(p: Product, field: StockField, delta: number, size?: string | null): Product {
  if (field === "stitched") {
    const rows = [...p.stitched];
    const i = rows.findIndex((r) => r.size === size);
    if (i >= 0) rows[i] = { ...rows[i], qty: Math.max(rows[i].qty + delta, 0) };
    else if (delta > 0 && size) rows.push({ size, qty: delta });
    return { ...p, stitched: rows };
  }
  return { ...p, [field]: Math.max((p[field] as number) + delta, 0) };
}

/** Change one stock number (or several, as one move). Screen updates at once; the database follows. */
export async function adjust(
  p: Product,
  changes: { field: StockField; delta: number; size?: string | null }[],
  reason: string,
) {
  await patchProduct(p.id, (x) => changes.reduce((acc, c) => applyLocal(acc, c.field, c.delta, c.size), x));
  try {
    for (const c of changes) {
      const { error } = await sb().rpc("adjust_stock", {
        p_product: p.id,
        p_field: c.field,
        p_delta: c.delta,
        p_size: c.size ?? null,
        p_reason: reason,
      });
      if (error) throw error;
    }
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, message: (e as Error).message };
  } finally {
    mutate("products");
    mutate(["moves", p.id]);
  }
}

export async function saveProduct(
  me: Profile,
  existing: Product | null,
  input: { name: string; aliases: string; category: string; collection: string; low_at: string; notes: string },
) {
  const name = input.name.trim();
  if (!name) return { ok: false as const, message: "Give the design a name" };
  const fields = {
    name,
    aliases: input.aliases
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean),
    category: input.category || "Suit set",
    collection: input.collection || "Current",
    low_at: Math.max(Number(input.low_at) || 0, 0),
    notes: input.notes.trim(),
  };
  const { error } = existing
    ? await sb().from("products").update(fields).eq("id", existing.id)
    : await sb().from("products").insert(fields);
  mutate("products");
  if (error) return { ok: false as const, message: /duplicate/i.test(error.message) ? "A design with that name already exists" : error.message };
  void me;
  return { ok: true as const };
}

export type ShopStock = { variant_id: number; product_id: number; product_title: string; variant_title: string; product_status: string; quantity: number | null };

/** Shopify's own available quantities (read-only copy, refreshed with every sync). */
export function useShopifyStock() {
  return useSWR<ShopStock[]>(
    "shopify-stock",
    async () => {
      const { data, error } = await sb().from("shopify_stock").select("variant_id, product_id, product_title, variant_title, product_status, quantity").limit(5000);
      if (error) throw error;
      return (data ?? []) as ShopStock[];
    },
    { revalidateOnFocus: true, dedupingInterval: 10000, keepPreviousData: true },
  );
}

const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "2XL", "3XL", "XXXL", "UNSTITCHED"];
const sizeRank = (t: string) => {
  const i = SIZE_ORDER.indexOf(t.trim().toUpperCase());
  return i < 0 ? 99 : i;
};

/** Group Shopify's stock by Core design (matched on name and other spellings). */
export function shopifyByProduct(products: Product[] | undefined, stock: ShopStock[] | undefined) {
  const keyToId = new Map<string, string>();
  for (const p of products ?? []) for (const n of [p.name, ...p.aliases]) keyToId.set(normDesign(n), p.id);
  const byId = new Map<string, { sizes: { label: string; qty: number | null }[]; total: number; live: boolean }>();
  const unmatched = new Map<string, { title: string; total: number; status: string }>();
  for (const s of stock ?? []) {
    const id = keyToId.get(normDesign(s.product_title));
    const qty = s.quantity ?? 0;
    if (!id) {
      const u = unmatched.get(s.product_title) ?? { title: s.product_title, total: 0, status: s.product_status };
      u.total += Math.max(qty, 0);
      unmatched.set(s.product_title, u);
      continue;
    }
    const g = byId.get(id) ?? { sizes: [], total: 0, live: false };
    g.sizes.push({ label: s.variant_title.split("/")[0].trim() || "One size", qty: s.quantity });
    g.total += Math.max(qty, 0);
    g.live = g.live || s.product_status === "active";
    byId.set(id, g);
  }
  for (const g of byId.values()) g.sizes.sort((a, b) => sizeRank(a.label) - sizeRank(b.label));
  return { byId, unmatched: [...unmatched.values()].filter((u) => u.status === "active").sort((a, b) => a.title.localeCompare(b.title)) };
}
