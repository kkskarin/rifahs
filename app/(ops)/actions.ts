"use server";

// Only the jobs that need server-side secrets live here: adding/removing team members
// (Supabase admin key), the Shopify sync, and the few things Core writes to Shopify (Shopify keys):
// a new manual order, customer details, a size change, and marking an order fulfilled.
import { requireAdmin, requireMember } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase-server";
import { changeLineSize, createShopifyOrder, fulfillOrder, shopifyConfigured, updateOrderDetails } from "@/lib/shopify";
import { syncBudgetMs, syncRecent, syncStock } from "@/lib/sync";
import { siteUrl } from "@/lib/site";
import type { OrderItem, TeamRole } from "@/lib/types";

export type ActionResult = { ok: boolean; message?: string };

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

// ───────────────────────── Team ─────────────────────────

export async function inviteMember(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const me = await requireAdmin();
  const email = str(form, "email").toLowerCase();
  const role = (str(form, "role") || "staff") as TeamRole;
  if (!/^\S+@\S+\.\S+$/.test(email)) return { ok: false, message: "Enter a valid email" };
  if (role === "owner" && me.role !== "owner") return { ok: false, message: "Only the owner can add another owner" };

  const admin = supabaseAdmin();
  const { data: existing } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
  if (existing) {
    await admin.from("profiles").update({ active: true, role }).eq("id", existing.id);
  } else {
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      app_metadata: { invited_role: role },
      user_metadata: { full_name: str(form, "full_name") },
    });
    if (error) return { ok: false, message: error.message };
    // Don't rely only on the database trigger — make sure the profile exists.
    await admin
      .from("profiles")
      .upsert({ id: created.user.id, email, full_name: str(form, "full_name"), role, active: true }, { onConflict: "id", ignoreDuplicates: true });
  }
  return { ok: true, message: `${email} can now sign in at ${await siteUrl()}` };
}

export async function updateMember(id: string, patch: { role?: TeamRole; active?: boolean }): Promise<ActionResult> {
  const me = await requireAdmin();
  if (id === me.id) return { ok: false, message: "You can't change your own access" };
  const admin = supabaseAdmin();
  const { data: target } = await admin.from("profiles").select("role").eq("id", id).single();
  if ((target?.role === "owner" || patch.role === "owner") && me.role !== "owner")
    return { ok: false, message: "Only the owner can change an owner" };
  const { error } = await admin.from("profiles").update(patch).eq("id", id);
  if (error) return { ok: false, message: error.message };
  if (patch.active === false) await admin.auth.admin.signOut(id).catch(() => undefined);
  return { ok: true };
}

// ───────────────────────── Shopify ─────────────────────────

export async function syncShopifyNow(): Promise<ActionResult> {
  await requireAdmin();
  if (!shopifyConfigured()) return { ok: false, message: "Shopify credentials aren't set yet" };
  try {
    const r = await syncRecent(syncBudgetMs());
    const stock = await syncStock();
    return {
      ok: true,
      message:
        `Orders: ${r.created} new, ${r.updated} updated${r.done ? "" : " — more to fetch, press again"}. ` +
        (stock.ok ? `Stock: ${stock.variants} sizes read from Shopify.` : `Stock not read: ${stock.message}`),
    };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

// ───────────────────────── Manual order → Shopify ─────────────────────────

/** Create a Core entry as a real order in Shopify, then link the two so the sync keeps them together. */
export async function pushOrderToShopify(orderId: string): Promise<ActionResult> {
  const me = await requireMember();
  if (!shopifyConfigured()) return { ok: false, message: "Shopify isn't connected, so the entry was saved in Core only." };
  const db = supabaseAdmin();
  const { data: o } = await db.from("orders").select("*").eq("id", orderId).single();
  if (!o) return { ok: false, message: "Order not found" };
  if (o.shopify_id) return { ok: false, message: `Already in Shopify as ${o.order_number}` };
  if (o.is_internal) return { ok: false, message: "Internal / test entries aren't sent to Shopify." };
  const items = (o.items ?? []) as OrderItem[];
  if (!items.length) return { ok: false, message: "Add at least one item before sending to Shopify." };
  const total = Number(o.total ?? 0);
  if (!(total > 0)) return { ok: false, message: "Enter the amount before sending to Shopify." };

  // Use each item's own price. Older entries have only an order amount: split it evenly across the pieces.
  const pieces = items.reduce((n, i) => n + Number(i.quantity || 1), 0);
  const priced = items.every((i) => typeof i.price === "number" && i.price > 0);
  const shipping = Number(o.shipping_charge ?? 0);
  const each = Math.floor(((total - shipping) / pieces) * 100) / 100;
  const lines = items.map((i) => ({ title: i.title, size: i.size ?? null, quantity: Number(i.quantity || 1), price: priced ? Number(i.price) : each, taxRate: Number(i.tax_rate ?? 0) }));
  const paidAmount = Number(o.amount_paid ?? (o.financial_status === "pending" ? 0 : total));
  const fullyPaid = paidAmount >= total;
  const paymentNote = fullyPaid ? "" : `Payment: ${paidAmount > 0 ? `₹${paidAmount} received, ` : ""}₹${Math.round((total - paidAmount) * 100) / 100} balance${o.payment_terms ? ` — ${o.payment_terms}` : ""}`;

  try {
    const r = await createShopifyOrder({
      name: o.customer_name,
      email: o.customer_email,
      phone: o.customer_phone,
      address: o.ship_address ?? (o.ship_city ? { city: o.ship_city, country: o.ship_country } : null),
      items: lines,
      taxMode: o.tax_mode ?? "none",
      taxType: o.tax_type ?? "",
      shipping,
      paid: fullyPaid,
      note: [o.notes ?? "", paymentNote].filter(Boolean).join("\n"),
      tags: ["Kaleidoscope Core", o.channel, o.is_express ? "Express" : "", o.is_exchange ? "Exchange" : ""].filter(Boolean),
    });
    await db
      .from("orders")
      .update({ shopify_id: r.id, order_number: r.name, shopify_source_name: "kaleidoscope_core", updated_by: me.id })
      .eq("id", orderId);
    await db.from("order_events").insert({ order_id: orderId, kind: "shopify_sync", message: `Created in Shopify as ${r.name}`, actor: me.id });
    const note = r.matched < r.total ? ` (${r.total - r.matched} item${r.total - r.matched === 1 ? "" : "s"} added as custom lines — no matching product/size found)` : "";
    return { ok: true, message: `Created in Shopify as ${r.name}${note}` };
  } catch (e) {
    const m = (e as Error).message;
    if (/access denied|write_orders|scope/i.test(m))
      return { ok: false, message: "Saved in Core, but Shopify refused: the Rifah's Ops app needs the write_orders permission (Dev Dashboard → app → Versions → add write_orders → Release, then approve on the store)." };
    return { ok: false, message: `Saved in Core, but Shopify refused: ${m.slice(0, 200)}` };
  }
}

// ───────────────────────── Edits made in Core → Shopify ─────────────────────────
// The change is always saved in Core first. If Shopify refuses, Core keeps it and says so.

const NEEDS: Record<string, string> = {
  details: "write_orders",
  size: "write_order_edits (and read_products)",
  fulfil: "write_merchant_managed_fulfillment_orders",
};

async function linkedOrder(orderId: string) {
  const me = await requireMember();
  const db = supabaseAdmin();
  const { data: o } = await db.from("orders").select("*").eq("id", orderId).single();
  return { me, db, o };
}

function refused(kind: keyof typeof NEEDS, e: unknown): ActionResult {
  const m = (e as Error).message.replace(/^Shopify API error: /, "");
  const hint = /access denied|scope|permission/i.test(m) ? ` The Rifah's Ops app needs the ${NEEDS[kind]} permission approved on the store.` : "";
  return { ok: false, message: `Saved in Core, but Shopify refused: ${m.slice(0, 200)}.${hint}` };
}

/** Customer name, email, phone and shipping address as they now stand in Core. */
export async function pushDetailsToShopify(orderId: string): Promise<ActionResult> {
  const { me, db, o } = await linkedOrder(orderId);
  if (!o?.shopify_id) return { ok: true };
  if (!shopifyConfigured()) return { ok: false, message: "Saved in Core. Shopify isn't connected, so it wasn't updated there." };
  try {
    await updateOrderDetails(o.shopify_id, { name: o.customer_name, email: o.customer_email, phone: o.customer_phone, address: o.ship_address });
    await db.from("order_events").insert({ order_id: orderId, kind: "shopify_sync", message: "Customer details updated in Shopify", actor: me.id });
    return { ok: true, message: "Saved, and updated in Shopify." };
  } catch (e) {
    return refused("details", e);
  }
}

export async function pushSizeToShopify(orderId: string, title: string, fromSize: string | null, toSize: string): Promise<ActionResult> {
  const { me, db, o } = await linkedOrder(orderId);
  if (!o?.shopify_id) return { ok: true };
  if (!shopifyConfigured()) return { ok: false, message: "Size saved in Core. Shopify isn't connected, so it wasn't updated there." };
  try {
    const r = await changeLineSize(o.shopify_id, title, fromSize, toSize);
    await db.from("order_events").insert({ order_id: orderId, kind: "shopify_sync", message: r.message, actor: me.id });
    return { ok: r.ok, message: r.ok ? `Size saved. ${r.message}` : `Size saved in Core. ${r.message}` };
  } catch (e) {
    return refused("size", e);
  }
}

/** Mark the Shopify order fulfilled with Core's courier and tracking. The customer is emailed only if asked. */
export async function fulfilInShopify(orderId: string, notifyCustomer: boolean): Promise<ActionResult> {
  const { me, db, o } = await linkedOrder(orderId);
  if (!o?.shopify_id) return { ok: true };
  if (!shopifyConfigured()) return { ok: false, message: "Dispatched in Core. Shopify isn't connected, so it wasn't marked fulfilled there." };
  try {
    const r = await fulfillOrder(o.shopify_id, { company: o.courier, number: o.tracking_number, url: o.tracking_url }, notifyCustomer);
    await db.from("orders").update({ shopify_fulfilled: true }).eq("id", orderId);
    await db.from("order_events").insert({ order_id: orderId, kind: "shopify_sync", message: r.message, actor: me.id });
    return { ok: true, message: r.message };
  } catch (e) {
    return refused("fulfil", e);
  }
}
