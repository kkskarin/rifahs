"use client";

// One shared, cached copy of the data for the whole app. Everything is read straight from Supabase
// in the browser and kept in memory, so switching tabs, filters and searches is instant.

import useSWR, { mutate } from "swr";
import { sb } from "./supabase-browser";
import { cleanItemsInput } from "./items";
import {
  OPEN_STATUSES,
  STATUSES,
  nextStatus,
  type Expense,
  type Issue,
  type IssueStatus,
  type Order,
  type OrderEvent,
  type OrderStatus,
  type Profile,
} from "./types";

export type Result = { ok: boolean; message?: string; id?: string };

const ORDER_COLS =
  "id, shopify_id, order_number, customer_name, customer_email, customer_phone, items, items_text, total, currency, source, channel, shopify_source_name, status, is_express, promise_date, is_international, is_internal, is_exchange, ship_country, ship_city, ship_address, courier, tracking_number, tracking_url, dispatched_at, shopify_fulfilled, financial_status, notes, tags, placed_at, created_at, updated_at";

const swrOpts = { revalidateOnFocus: true, dedupingInterval: 4000, keepPreviousData: true };

// ───────────────────────── Reads ─────────────────────────

export function useMe() {
  return useSWR<Profile | null>(
    "me",
    async () => {
      const { data: s } = await sb().auth.getSession();
      const uid = s.session?.user.id;
      if (!uid) return null;
      const { data } = await sb().from("profiles").select("*").eq("id", uid).maybeSingle();
      return (data as Profile) ?? null;
    },
    { revalidateOnFocus: false },
  );
}

export type OrderRow = Order & { items_text?: string };

export function useOrders() {
  return useSWR<OrderRow[]>(
    "orders",
    async () => {
      // Two pages of 1,000 keeps us under PostgREST's default row cap as the book grows.
      const out: OrderRow[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await sb()
          .from("orders")
          .select(ORDER_COLS)
          .order("placed_at", { ascending: false })
          .range(from, from + 999);
        if (error) throw error;
        out.push(...((data ?? []) as unknown as OrderRow[]));
        if (!data || data.length < 1000) break;
      }
      return out;
    },
    { ...swrOpts, refreshInterval: 60_000 },
  );
}

export function useIssues() {
  return useSWR<(Issue & { order: { id: string; order_number: string | null; customer_name: string } | null })[]>(
    "issues",
    async () => {
      const { data, error } = await sb()
        .from("issues")
        .select("*, order:orders(id, order_number, customer_name), updates:issue_updates(id, message, actor, created_at)")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as never;
    },
    swrOpts,
  );
}

export function useExpenses(enabled: boolean) {
  return useSWR<Expense[]>(
    enabled ? "expenses" : null,
    async () => {
      const { data, error } = await sb().from("expenses").select("*").order("spent_on", { ascending: false }).limit(5000);
      if (error) throw error;
      return (data ?? []) as Expense[];
    },
    swrOpts,
  );
}

export function useTeam(enabled: boolean) {
  return useSWR<Profile[]>(
    enabled ? "team" : null,
    async () => {
      const { data, error } = await sb().from("profiles").select("*").order("created_at");
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
    swrOpts,
  );
}

export function useOrderEvents(orderId: string | null) {
  return useSWR<OrderEvent[]>(
    orderId ? ["events", orderId] : null,
    async () => {
      const { data, error } = await sb()
        .from("order_events")
        .select("*")
        .eq("order_id", orderId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as OrderEvent[];
    },
    swrOpts,
  );
}

export function useSyncState(enabled: boolean) {
  return useSWR(
    enabled ? "sync" : null,
    async () => {
      const [{ data: state }, { count }] = await Promise.all([
        sb().from("sync_state").select("value, updated_at").eq("key", "shopify_orders").maybeSingle(),
        sb().from("orders").select("id", { count: "exact", head: true }).not("shopify_id", "is", null),
      ]);
      return { updatedAt: (state?.updated_at as string | undefined) ?? null, synced: count ?? 0 };
    },
    swrOpts,
  );
}

// ───────────────────────── Numbers (one set of rules everywhere) ─────────────────────────

/** Counts toward sales / profit: real customer orders that weren't cancelled or refunded. */
export const countsAsSale = (o: Order) => !o.is_internal && o.status !== "refunded" && o.status !== "cancelled";
export const isOpen = (o: Order) => !o.is_internal && OPEN_STATUSES.includes(o.status);

export function summarize(orders: Order[] | undefined, expenses: Expense[] | undefined) {
  const list = orders ?? [];
  const sales = list.filter(countsAsSale).reduce((a, o) => a + Number(o.total ?? 0), 0);
  const spent = (expenses ?? []).reduce((a, e) => a + Number(e.amount), 0);
  return {
    sales,
    spent,
    profit: sales - spent,
    notDispatched: list.filter(isOpen).length,
    expressDue: list.filter((o) => isOpen(o) && o.is_express).length,
    international: list.filter((o) => isOpen(o) && o.is_international).length,
  };
}

// ───────────────────────── Writes ─────────────────────────

const now = () => new Date().toISOString();

/** Apply a change to the cached order list immediately; Supabase catches up in the background. */
function patchOrdersCache(update: (o: OrderRow) => OrderRow | null) {
  return mutate<OrderRow[]>(
    "orders",
    (list) => (list ?? []).map((o) => update(o)).filter((o): o is OrderRow => o !== null),
    { revalidate: false },
  );
}

async function logEvents(rows: Partial<OrderEvent>[]) {
  if (rows.length) await sb().from("order_events").insert(rows);
}

export async function setStatus(me: Profile, orders: Order[], to: OrderStatus | "next"): Promise<Result> {
  const changes = orders
    .map((o) => ({ o, target: to === "next" ? nextStatus(o.status) : to }))
    .filter((c): c is { o: Order; target: OrderStatus } => Boolean(c.target) && c.target !== c.o.status);
  if (!changes.length) return { ok: true, message: "Nothing to change" };

  const byId = new Map(changes.map((c) => [c.o.id, c.target]));
  await patchOrdersCache((o) => {
    const t = byId.get(o.id);
    return t ? { ...o, status: t, dispatched_at: t === "dispatched" && !o.dispatched_at ? now() : o.dispatched_at } : o;
  });

  try {
    // Group by target status → one request per target.
    const groups = new Map<OrderStatus, string[]>();
    for (const c of changes) groups.set(c.target, [...(groups.get(c.target) ?? []), c.o.id]);
    for (const [target, ids] of groups) {
      const patch: Record<string, unknown> = { status: target, updated_by: me.id };
      if (target === "dispatched") patch.dispatched_at = now();
      const { error } = await sb().from("orders").update(patch).in("id", ids);
      if (error) throw error;
    }
    await logEvents(changes.map((c) => ({ order_id: c.o.id, kind: "status", from_status: c.o.status, to_status: c.target, actor: me.id })));
    return { ok: true, message: `${changes.length} order${changes.length === 1 ? "" : "s"} updated` };
  } catch (e) {
    await mutate("orders");
    return { ok: false, message: (e as Error).message };
  } finally {
    mutate("orders");
  }
}

export async function dispatch(
  me: Profile,
  o: Order,
  t: { courier: string | null; tracking_number: string | null; tracking_url: string | null },
): Promise<Result> {
  const patch = { status: "dispatched" as OrderStatus, ...t, dispatched_at: now(), updated_by: me.id };
  await patchOrdersCache((x) => (x.id === o.id ? { ...x, ...patch } : x));
  const { error } = await sb().from("orders").update(patch).eq("id", o.id);
  if (error) {
    mutate("orders");
    return { ok: false, message: error.message };
  }
  await logEvents([
    { order_id: o.id, kind: "fulfillment", from_status: o.status, to_status: "dispatched", message: [t.courier, t.tracking_number].filter(Boolean).join(" · "), actor: me.id },
  ]);
  mutate("orders");
  mutate(["events", o.id]);
  return { ok: true, message: "Dispatched" };
}

export type OrderInput = {
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  status: OrderStatus;
  is_express: boolean;
  is_international: boolean;
  is_internal: boolean;
  is_exchange: boolean;
  promise_date: string | null;
  ship_country: string | null;
  courier: string | null;
  tracking_number: string | null;
  notes: string;
  // manual entries only
  items_raw?: string;
  size?: string | null;
  total?: string;
  source?: string | null;
  channel?: string;
  order_number?: string | null;
};

export async function saveOrder(me: Profile, existing: Order | null, input: OrderInput): Promise<Result> {
  if (!input.customer_name.trim()) return { ok: false, message: "Customer name is required" };
  const fields: Record<string, unknown> = {
    customer_name: input.customer_name.trim(),
    customer_phone: input.customer_phone,
    customer_email: input.customer_email,
    status: STATUSES.includes(input.status) ? input.status : "new",
    is_express: input.is_express,
    is_international: input.is_international,
    is_internal: input.is_internal,
    is_exchange: input.is_exchange,
    promise_date: input.promise_date,
    ship_country: input.ship_country,
    courier: input.courier,
    tracking_number: input.tracking_number,
    notes: input.notes,
    updated_by: me.id,
  };
  if (!existing?.shopify_id) {
    const totalRaw = (input.total ?? "").replace(/[₹,\s]/g, "");
    fields.items = cleanItemsInput(input.items_raw ?? "", input.size ?? null);
    fields.total = totalRaw ? Number(totalRaw) : null;
    fields.source = input.source || null;
    fields.channel = input.channel || "Manual";
    fields.order_number = input.order_number || null;
  }
  if (existing && fields.status === "dispatched" && existing.status !== "dispatched") fields.dispatched_at = now();

  if (!existing) {
    const { data, error } = await sb().from("orders").insert({ ...fields, created_by: me.id }).select("id").single();
    if (error) return { ok: false, message: error.message };
    await logEvents([{ order_id: data.id, kind: "edit", to_status: fields.status as OrderStatus, message: "Entry added", actor: me.id }]);
    await mutate("orders");
    return { ok: true, message: "Added", id: data.id };
  }

  await patchOrdersCache((o) => (o.id === existing.id ? ({ ...o, ...fields } as OrderRow) : o));
  const { error } = await sb().from("orders").update(fields).eq("id", existing.id);
  if (error) {
    mutate("orders");
    return { ok: false, message: error.message };
  }
  const statusChanged = existing.status !== fields.status;
  await logEvents([
    {
      order_id: existing.id,
      kind: statusChanged ? "status" : "edit",
      from_status: existing.status,
      to_status: fields.status as OrderStatus,
      message: statusChanged ? "" : "Details edited",
      actor: me.id,
    },
  ]);
  mutate("orders");
  mutate(["events", existing.id]);
  return { ok: true, message: "Saved" };
}

/** Change one item's size here. Core is the record for production; the Shopify sync keeps the change. */
export async function changeItemSize(me: Profile, o: Order, index: number, size: string): Promise<Result> {
  const item = o.items[index];
  const next = size.trim();
  if (!item || !next || next === (item.size ?? "")) return { ok: true };
  const items = o.items.map((it, i) =>
    i === index ? { ...it, size: next, size_changed: true, original_size: it.size_changed ? (it.original_size ?? null) : (it.size ?? null) } : it,
  );
  await patchOrdersCache((x) => (x.id === o.id ? { ...x, items } : x));
  const { error } = await sb().from("orders").update({ items, updated_by: me.id }).eq("id", o.id);
  if (error) {
    mutate("orders");
    return { ok: false, message: error.message };
  }
  await logEvents([{ order_id: o.id, kind: "edit", message: `Size changed: ${item.title} ${item.size ?? "—"} → ${next}`, actor: me.id }]);
  mutate("orders");
  mutate(["events", o.id]);
  return { ok: true, message: "Size updated" };
}

export async function addNote(me: Profile, orderId: string, message: string): Promise<Result> {
  if (!message.trim()) return { ok: false, message: "Write something first" };
  const { error } = await sb().from("order_events").insert({ order_id: orderId, kind: "note", message: message.trim(), actor: me.id });
  if (error) return { ok: false, message: error.message };
  mutate(["events", orderId]);
  return { ok: true };
}

export async function deleteOrder(id: string): Promise<Result> {
  await patchOrdersCache((o) => (o.id === id ? null : o));
  const { error } = await sb().from("orders").delete().eq("id", id);
  mutate("orders");
  return error ? { ok: false, message: error.message } : { ok: true };
}

export async function saveIssue(
  me: Profile,
  orders: Order[],
  input: { title: string; kind: string; courier: string | null; tracking_number: string | null; details: string; order_ref: string; category?: "shipping" | "customer" },
): Promise<Result> {
  if (!input.title.trim()) return { ok: false, message: "Give the issue a short title" };
  let orderId: string | null = null;
  const ref = input.order_ref.replace(/^#/, "").trim();
  if (ref) {
    const match = orders.find((o) => o.order_number === `#${ref}`);
    if (!match) return { ok: false, message: `No order #${ref} in the book` };
    orderId = match.id;
  }
  const { error } = await sb().from("issues").insert({
    title: input.title.trim(),
    kind: input.kind || "Courier",
    courier: input.courier,
    tracking_number: input.tracking_number,
    details: input.details,
    order_id: orderId,
    category: input.category ?? "shipping",
    created_by: me.id,
  });
  if (error) return { ok: false, message: error.message };
  mutate("issues");
  return { ok: true, message: "Issue logged" };
}

export async function addIssueUpdate(me: Profile, issueId: string, message: string): Promise<Result> {
  if (!message.trim()) return { ok: false, message: "Write the update first" };
  const { error } = await sb().from("issue_updates").insert({ issue_id: issueId, message: message.trim(), actor: me.id });
  if (error) return { ok: false, message: error.message };
  await sb().from("issues").update({ updated_at: new Date().toISOString() }).eq("id", issueId);
  mutate("issues");
  return { ok: true };
}

export async function setIssueStatus(id: string, status: IssueStatus): Promise<Result> {
  mutate<{ id: string; status: IssueStatus }[]>("issues", (l) => (l ?? []).map((i) => (i.id === id ? { ...i, status } : i)), {
    revalidate: false,
  });
  const { error } = await sb()
    .from("issues")
    .update({ status, resolved_at: status === "resolved" ? now() : null })
    .eq("id", id);
  mutate("issues");
  return error ? { ok: false, message: error.message } : { ok: true };
}

export async function deleteExpense(id: string): Promise<Result> {
  mutate<Expense[]>("expenses", (l) => (l ?? []).filter((e) => e.id !== id), { revalidate: false });
  const { error } = await sb().from("expenses").delete().eq("id", id);
  mutate("expenses");
  return error ? { ok: false, message: error.message } : { ok: true };
}

export async function signOutEverywhere() {
  await sb().auth.signOut();
  await mutate(() => true, undefined, { revalidate: false });
  window.location.href = "/login";
}
