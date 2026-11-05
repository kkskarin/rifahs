"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireMember } from "@/lib/session";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase-server";
import { shopifyConfigured } from "@/lib/shopify";
import { syncBudgetMs, syncRecent } from "@/lib/sync";
import { siteUrl } from "@/lib/site";
import { STATUSES, nextStatus, type OrderItem, type OrderStatus, type TeamRole } from "@/lib/types";

export type ActionResult = { ok: boolean; message?: string };

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const optStr = (f: FormData, k: string) => str(f, k) || null;
const bool = (f: FormData, k: string) => f.get(k) === "on" || f.get(k) === "true";

function refreshAll() {
  revalidatePath("/", "layout");
}

// ───────────────────────── Orders ─────────────────────────

async function changeStatus(ids: string[], to: OrderStatus | "next", message = "") {
  const me = await requireMember();
  const db = await supabaseServer();
  const { data: rows, error } = await db.from("orders").select("id, status").in("id", ids);
  if (error) return { ok: false, message: error.message };

  let moved = 0;
  for (const row of rows ?? []) {
    const target = to === "next" ? nextStatus(row.status) : to;
    if (!target || target === row.status) continue;
    const patch: Record<string, unknown> = { status: target, updated_by: me.id };
    if (target === "dispatched") patch.dispatched_at = new Date().toISOString();
    const { error: e } = await db.from("orders").update(patch).eq("id", row.id);
    if (e) return { ok: false, message: e.message };
    await db.from("order_events").insert({
      order_id: row.id,
      kind: "status",
      from_status: row.status,
      to_status: target,
      message,
      actor: me.id,
    });
    moved++;
  }
  refreshAll();
  return { ok: true, message: `${moved} order${moved === 1 ? "" : "s"} updated` };
}

export async function advanceOrder(id: string): Promise<ActionResult> {
  return changeStatus([id], "next");
}

export async function bulkSetStatus(ids: string[], to: OrderStatus | "next"): Promise<ActionResult> {
  if (!ids.length) return { ok: false, message: "Nothing selected" };
  if (to !== "next" && !STATUSES.includes(to)) return { ok: false, message: "Unknown status" };
  return changeStatus(ids, to);
}

export async function dispatchOrder(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const me = await requireMember();
  const id = str(form, "id");
  const courier = optStr(form, "courier");
  const tracking = optStr(form, "tracking_number");
  const trackingUrl = optStr(form, "tracking_url");

  const db = await supabaseServer();
  const { data: order, error } = await db.from("orders").select("id, status").eq("id", id).single();
  if (error) return { ok: false, message: error.message };

  const { error: e2 } = await db
    .from("orders")
    .update({
      status: "dispatched",
      courier,
      tracking_number: tracking,
      tracking_url: trackingUrl,
      dispatched_at: new Date().toISOString(),
      updated_by: me.id,
    })
    .eq("id", id);
  if (e2) return { ok: false, message: e2.message };

  await db.from("order_events").insert({
    order_id: id,
    kind: "fulfillment",
    from_status: order.status,
    to_status: "dispatched",
    message: [courier, tracking].filter(Boolean).join(" · "),
    actor: me.id,
  });
  refreshAll();
  return { ok: true, message: "Dispatched" };
}

function parseItems(raw: string, size: string | null): OrderItem[] {
  // One item per line or separated by "·" / ",". "Ziya Plum Set x2" sets quantity.
  return raw
    .split(/\n|·|,/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = s.match(/^(.*?)\s*[x×]\s*(\d+)$/i);
      const sizeMatch = (m ? m[1] : s).match(/^(.*?)\s*\(([^)]+)\)$/);
      return {
        title: (sizeMatch ? sizeMatch[1] : m ? m[1] : s).trim(),
        size: sizeMatch ? sizeMatch[2] : size,
        quantity: m ? Number(m[2]) : 1,
      };
    });
}

export async function saveOrder(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const me = await requireMember();
  const db = await supabaseServer();
  const id = str(form, "id");
  const status = str(form, "status") as OrderStatus;
  const totalRaw = str(form, "total").replace(/[₹,\s]/g, "");

  const fields: Record<string, unknown> = {
    customer_name: str(form, "customer_name"),
    customer_phone: optStr(form, "customer_phone"),
    customer_email: optStr(form, "customer_email"),
    status: STATUSES.includes(status) ? status : "new",
    is_express: bool(form, "is_express"),
    promise_date: optStr(form, "promise_date"),
    is_international: bool(form, "is_international"),
    ship_country: optStr(form, "ship_country"),
    courier: optStr(form, "courier"),
    tracking_number: optStr(form, "tracking_number"),
    notes: str(form, "notes"),
    updated_by: me.id,
  };
  if (!fields.customer_name) return { ok: false, message: "Customer name is required" };

  // Shopify owns items/price/source for synced orders; only manual entries edit them here.
  const isShopify = form.get("is_shopify") === "true";
  if (!isShopify) {
    fields.items = parseItems(str(form, "items"), optStr(form, "size"));
    fields.total = totalRaw ? Number(totalRaw) : null;
    fields.source = optStr(form, "source");
    fields.channel = str(form, "channel") || "Manual";
    fields.order_number = optStr(form, "order_number");
  }

  if (!id) {
    const { data, error } = await db
      .from("orders")
      .insert({ ...fields, created_by: me.id })
      .select("id")
      .single();
    if (error) return { ok: false, message: error.message };
    await db.from("order_events").insert({ order_id: data.id, kind: "edit", to_status: fields.status, message: "Entry added", actor: me.id });
    refreshAll();
    redirect(`/orders/${data.id}`);
  }

  const { data: before } = await db.from("orders").select("status").eq("id", id).single();
  if (fields.status === "dispatched" && before?.status !== "dispatched") fields.dispatched_at = new Date().toISOString();
  const { error } = await db.from("orders").update(fields).eq("id", id);
  if (error) return { ok: false, message: error.message };
  await db.from("order_events").insert({
    order_id: id,
    kind: before?.status !== fields.status ? "status" : "edit",
    from_status: before?.status ?? null,
    to_status: fields.status,
    message: before?.status !== fields.status ? "" : "Details edited",
    actor: me.id,
  });
  refreshAll();
  return { ok: true, message: "Saved" };
}

export async function addOrderNote(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const me = await requireMember();
  const msg = str(form, "message");
  if (!msg) return { ok: false, message: "Write something first" };
  const db = await supabaseServer();
  const { error } = await db.from("order_events").insert({ order_id: str(form, "id"), kind: "note", message: msg, actor: me.id });
  if (error) return { ok: false, message: error.message };
  refreshAll();
  return { ok: true };
}

export async function deleteOrder(id: string) {
  await requireAdmin();
  const db = await supabaseServer();
  await db.from("orders").delete().eq("id", id);
  refreshAll();
  redirect("/orders");
}

// ───────────────────────── Issues ─────────────────────────

export async function saveIssue(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const me = await requireMember();
  const db = await supabaseServer();
  const id = str(form, "id");
  const orderRef = str(form, "order_ref").replace(/^#/, "");

  let orderId: string | null = optStr(form, "order_id");
  if (!orderId && orderRef) {
    const { data } = await db.from("orders").select("id").eq("order_number", `#${orderRef}`).maybeSingle();
    if (!data) return { ok: false, message: `No order #${orderRef} in the book` };
    orderId = data.id;
  }

  const status = (str(form, "status") || "open") as "open" | "waiting" | "resolved";
  const fields = {
    title: str(form, "title"),
    kind: str(form, "kind") || "Courier",
    courier: optStr(form, "courier"),
    tracking_number: optStr(form, "tracking_number"),
    details: str(form, "details"),
    status,
    order_id: orderId,
    resolved_at: status === "resolved" ? new Date().toISOString() : null,
  };
  if (!fields.title) return { ok: false, message: "Give the issue a short title" };

  const { error } = id
    ? await db.from("issues").update(fields).eq("id", id)
    : await db.from("issues").insert({ ...fields, created_by: me.id });
  if (error) return { ok: false, message: error.message };
  refreshAll();
  return { ok: true, message: id ? "Issue updated" : "Issue logged" };
}

export async function setIssueStatus(id: string, status: "open" | "waiting" | "resolved") {
  await requireMember();
  const db = await supabaseServer();
  await db
    .from("issues")
    .update({ status, resolved_at: status === "resolved" ? new Date().toISOString() : null })
    .eq("id", id);
  refreshAll();
}

// ───────────────────────── Money ─────────────────────────

export async function addExpense(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const me = await requireAdmin();
  const amount = Number(str(form, "amount").replace(/[₹,\s]/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, message: "Enter an amount" };
  const db = await supabaseServer();
  const { error } = await db.from("expenses").insert({
    spent_on: str(form, "spent_on") || undefined,
    category: str(form, "category") || "Other",
    amount,
    paid_to: str(form, "paid_to"),
    note: str(form, "note"),
    created_by: me.id,
  });
  if (error) return { ok: false, message: error.message };
  refreshAll();
  return { ok: true, message: "Expense added" };
}

export async function deleteExpense(id: string) {
  await requireAdmin();
  const db = await supabaseServer();
  await db.from("expenses").delete().eq("id", id);
  refreshAll();
}

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
  refreshAll();
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
  refreshAll();
  return { ok: true };
}

// ───────────────────────── Shopify ─────────────────────────

export async function syncShopifyNow(): Promise<ActionResult> {
  await requireAdmin();
  if (!shopifyConfigured()) return { ok: false, message: "Shopify credentials aren't set yet" };
  try {
    const r = await syncRecent(syncBudgetMs());
    refreshAll();
    return {
      ok: true,
      message: `${r.created} new, ${r.updated} updated${r.done ? "" : " — more to fetch, press again"}`,
    };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}
