import "server-only";
import { supabaseAdmin } from "./supabase-server";
import { fetchOrder, fetchOrdersPage, type ShopifyOrder } from "./shopify";
import { OPEN_STATUSES, type OrderItem, type OrderStatus } from "./types";

// Sizes as they appear in variant titles, e.g. "M", "XXL", "M / Cotton", "Unstitched", "Free Size".
const SIZE_TOKEN = /^(\d?X{0,3}[SML]|X{1,4}L|\d{2}|free\s*size|unstitched|custom(\s*size)?|stitched)$/i;

/** Read the size out of a variant title without needing product access (read_products). */
function sizeFromVariantTitle(title: string | null): string | null {
  if (!title || title === "Default Title") return null;
  const parts = title.split("/").map((p) => p.trim()).filter(Boolean);
  return parts.find((p) => SIZE_TOKEN.test(p)) ?? (parts.length === 1 ? parts[0] : null);
}

function detectSource(o: ShopifyOrder): string {
  const hay = [
    ...o.paymentGatewayNames,
    ...o.tags,
    ...o.customAttributes.map((a) => `${a.key} ${a.value ?? ""}`),
    o.sourceName ?? "",
  ]
    .join(" ")
    .toLowerCase();
  if (hay.includes("shopflo")) return "Shopflo";
  if (o.sourceName === "shopify_draft_order") return "Manual";
  if (hay.includes("razorpay")) return "Razorpay";
  if (o.sourceName === "pos") return "Walk-in";
  if (hay.includes("instagram")) return "Instagram";
  if (hay.includes("whatsapp")) return "WhatsApp";
  return o.paymentGatewayNames[0] ?? "Website";
}

/** "Lufra Imran Imran" → "Lufra Imran", "Sheetal ." → "Sheetal" (Shopify first names often include the surname). */
export function cleanName(raw: string | null | undefined): string {
  const words = (raw ?? "").replace(/\s+/g, " ").trim().split(" ").filter((w) => !/^[.\-_,]+$/.test(w));
  // Drop any run of 1–3 words that is immediately repeated ("Abdul azeez Abdul azeez").
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((w, i) => w.toLowerCase() === b[i].toLowerCase());
  for (let k = 3; k >= 1; k--) {
    for (let i = 0; i + 2 * k <= words.length; ) {
      if (same(words.slice(i, i + k), words.slice(i + k, i + 2 * k))) words.splice(i + k, k);
      else i++;
    }
  }
  return words.join(" ");
}

function mapItems(o: ShopifyOrder): OrderItem[] {
  return o.lineItems.nodes.map((li) => {
    const size = sizeFromVariantTitle(li.variantTitle);
    return {
      title: li.title,
      size,
      variant: li.variantTitle && li.variantTitle !== "Default Title" ? li.variantTitle : null,
      quantity: li.quantity,
      price: Number(li.originalUnitPriceSet.shopMoney.amount),
      sku: li.sku,
    };
  });
}

function isExpress(o: ShopifyOrder) {
  const hay = [o.shippingLine?.title ?? "", ...o.tags, ...o.lineItems.nodes.map((l) => l.title)].join(" ");
  return /express|priority|urgent/i.test(hay);
}

/** Status Shopify implies. null = Shopify has no opinion (leave the team's status alone). */
function shopifyStatus(o: ShopifyOrder): OrderStatus | null {
  if (o.cancelledAt) return "cancelled";
  if (o.displayFinancialStatus === "REFUNDED") return "refunded";
  if (o.displayFulfillmentStatus === "FULFILLED") return "dispatched";
  return null;
}

export async function upsertShopifyOrder(o: ShopifyOrder) {
  const db = supabaseAdmin();
  const shopifyId = Number(o.legacyResourceId);
  const money = o.currentTotalPriceSet?.shopMoney ?? o.totalPriceSet.shopMoney;
  const country = o.shippingAddress?.countryCodeV2 ?? null;
  const tracking = o.fulfillments.flatMap((f) => f.trackingInfo).find((t) => t.number);
  const firstFulfilledAt = o.fulfillments[0]?.createdAt ?? null;

  const shopifyOwned = {
    shopify_id: shopifyId,
    order_number: o.name,
    customer_name: cleanName(o.customer?.displayName || o.shippingAddress?.name) || o.email || "Customer",
    customer_email: o.email,
    customer_phone: o.phone || o.shippingAddress?.phone || null,
    items: mapItems(o),
    total: Number(money.amount),
    currency: money.currencyCode,
    source: detectSource(o),
    channel: "Website",
    shopify_source_name: o.sourceName,
    is_international: Boolean(country && country !== "IN"),
    ship_country: o.shippingAddress?.country ?? null,
    ship_city: o.shippingAddress?.city ?? null,
    ship_address: o.shippingAddress,
    financial_status: o.displayFinancialStatus?.toLowerCase() ?? null,
    shopify_fulfilled: o.displayFulfillmentStatus === "FULFILLED",
    tags: o.tags,
    placed_at: o.createdAt,
  };

  const { data: existing } = await db
    .from("orders")
    .select("id, status, is_express, notes, courier, tracking_number, dispatched_at")
    .eq("shopify_id", shopifyId)
    .maybeSingle();

  const implied = shopifyStatus(o);

  if (!existing) {
    const notes = [o.sourceName === "shopify_draft_order" ? "Manual order in Shopify" : "", o.note ?? ""]
      .filter(Boolean)
      .join("\n");
    const { data, error } = await db
      .from("orders")
      .insert({
        ...shopifyOwned,
        status: implied ?? "new",
        is_express: isExpress(o),
        notes,
        courier: tracking?.company ?? null,
        tracking_number: tracking?.number ?? null,
        tracking_url: tracking?.url ?? null,
        dispatched_at: implied === "dispatched" ? firstFulfilledAt : null,
      })
      .select("id")
      .single();
    if (error) throw error;
    await db.from("order_events").insert({
      order_id: data.id,
      kind: "shopify_sync",
      to_status: implied ?? "new",
      message: `Imported from Shopify ${o.name}`,
    });
    return { id: data.id, created: true };
  }

  const patch: Record<string, unknown> = { ...shopifyOwned };
  // Never un-set express that the team flagged by hand.
  patch.is_express = existing.is_express || isExpress(o);
  if (!existing.courier && tracking?.company) patch.courier = tracking.company;
  if (!existing.tracking_number && tracking?.number) {
    patch.tracking_number = tracking.number;
    patch.tracking_url = tracking.url;
  }

  // Shopify can only push an order *forward* out of the production line
  // (cancelled / refunded / dispatched). It never drags a status backwards.
  let statusChanged = false;
  if (implied && implied !== existing.status) {
    const openish = OPEN_STATUSES.includes(existing.status as OrderStatus);
    const allow =
      implied === "dispatched"
        ? openish // don't drag "delivered" back to "dispatched"
        : implied === "cancelled"
          ? existing.status !== "refunded"
          : true; // refunded always wins
    if (allow) {
      patch.status = implied;
      statusChanged = true;
      if (implied === "dispatched" && !existing.dispatched_at) patch.dispatched_at = firstFulfilledAt ?? new Date().toISOString();
    }
  }

  const { error } = await db.from("orders").update(patch).eq("id", existing.id);
  if (error) throw error;
  if (statusChanged) {
    await db.from("order_events").insert({
      order_id: existing.id,
      kind: "shopify_sync",
      from_status: existing.status,
      to_status: patch.status,
      message: `Shopify marked this ${String(patch.status)}`,
    });
  }
  return { id: existing.id, created: false };
}

export async function syncOrderById(legacyId: string | number) {
  const o = await fetchOrder(legacyId);
  if (!o) return null;
  return upsertShopifyOrder(o);
}

/** Time a single sync call may spend before starting another page. Netlify cuts functions off at ~10s by default. */
export function syncBudgetMs() {
  return Number(process.env.SYNC_BUDGET_MS ?? 6_000);
}

/**
 * Pull every order updated since the last run (or the whole history the first time).
 * Stops before `budgetMs` so it fits inside a serverless invocation, and resumes from
 * the saved cursor next time.
 */
export async function syncRecent(budgetMs = syncBudgetMs()) {
  const db = supabaseAdmin();
  const started = Date.now();
  const { data: state } = await db.from("sync_state").select("value").eq("key", "shopify_orders").maybeSingle();
  const prev = (state?.value ?? {}) as { since?: string; cursor?: string | null; runStartedAt?: string };

  // When resuming a paginated run, keep the same query; otherwise start a new window.
  const runStartedAt = prev.cursor ? prev.runStartedAt! : new Date().toISOString();
  const since = prev.since;
  const query = since ? `updated_at:>='${new Date(new Date(since).getTime() - 10 * 60_000).toISOString()}'` : undefined;

  let cursor = prev.cursor ?? null;
  let created = 0;
  let updated = 0;
  let done = false;

  const save = (value: Record<string, unknown>) =>
    db.from("sync_state").upsert({ key: "shopify_orders", value, updated_at: new Date().toISOString() });

  // Small pages, several orders in parallel, progress saved after every page — so a run cut
  // short by the hosting time limit never loses work and the next press carries on.
  while (Date.now() - started < budgetMs) {
    const page = await fetchOrdersPage({ after: cursor, query, first: 15 });
    for (let i = 0; i < page.nodes.length; i += 5) {
      const results = await Promise.all(page.nodes.slice(i, i + 5).map((o) => upsertShopifyOrder(o)));
      for (const r of results) r.created ? created++ : updated++;
    }
    cursor = page.pageInfo.endCursor;
    if (!page.pageInfo.hasNextPage) {
      done = true;
      break;
    }
    await save({ since, cursor, runStartedAt });
  }

  await save(done ? { since: runStartedAt, cursor: null } : { since, cursor, runStartedAt });
  return { created, updated, done };
}
