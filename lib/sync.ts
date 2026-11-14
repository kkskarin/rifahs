import "server-only";
import { supabaseAdmin } from "./supabase-server";
import { appAccess, fetchOrder, fetchOrdersPage, fetchStock, shopifyGraphQL, type ShopifyOrder } from "./shopify";
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

/** Customers whose orders are internal / test orders (kept out of sales and lists). */
const INTERNAL_EMAILS = (
  process.env.INTERNAL_CUSTOMER_EMAILS ?? "jashimraswi@gmail.com,nilofarthahir@gmail.com,a.thanisharin@gmail.com"
)
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

function mapItems(o: ShopifyOrder): OrderItem[] {
  // Skip pieces removed by an order edit or refund (currentQuantity 0).
  const lines = o.lineItems.nodes.filter((li) => (li.currentQuantity ?? li.quantity) > 0);
  return (lines.length ? lines : o.lineItems.nodes).map((li) => {
    const size = sizeFromVariantTitle(li.variantTitle);
    return {
      title: li.title,
      size,
      variant: li.variantTitle && li.variantTitle !== "Default Title" ? li.variantTitle : null,
      quantity: li.currentQuantity || li.quantity,
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
  // The courier (through Shopify) says every parcel has reached the customer.
  if (o.fulfillments.length && o.fulfillments.every((f) => f.displayStatus === "DELIVERED")) return "delivered";
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
    customer_name: cleanName(o.shippingAddress?.name || o.customer?.displayName) || o.email || "Customer",
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
    delivery_status: o.fulfillments.map((f) => f.displayStatus).filter(Boolean).join(", ").toLowerCase().replace(/_/g, " ") || null,
    tags: o.tags,
    placed_at: o.createdAt,
  };

  const cols = "id, status, is_express, notes, courier, tracking_number, dispatched_at, items";
  let { data: existing } = await db.from("orders").select(cols).eq("shopify_id", shopifyId).maybeSingle();
  if (!existing) {
    // An entry imported earlier (order sheet / Shopify export) without a Shopify id: adopt it, don't duplicate.
    const { data: byNumber } = await db
      .from("orders")
      .select(cols)
      .eq("order_number", o.name)
      .is("shopify_id", null)
      .maybeSingle();
    existing = byNumber;
  }

  const implied = shopifyStatus(o);

  if (!existing) {
    const notes = [o.sourceName === "shopify_draft_order" ? "Manual order in Shopify" : "", o.note ?? ""]
      .filter(Boolean)
      .join("\n");
    const { data, error } = await db
      .from("orders")
      .insert({
        ...shopifyOwned,
        is_internal: INTERNAL_EMAILS.includes((o.email ?? "").toLowerCase()) || o.tags.includes("Test"),
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
  // An order made in Core without an address has no name in Shopify: keep the name typed in Core.
  if (!cleanName(o.shippingAddress?.name || o.customer?.displayName)) delete patch.customer_name;
  // Sizes the team changed in Core win over Shopify's, and each item keeps the stock stage Core recorded
  // for it. Both are matched by item title, in order.
  const kept = ((existing.items ?? []) as OrderItem[]).filter((i) => i.size_changed || i.stage);
  if (kept.length) {
    patch.items = (shopifyOwned.items as OrderItem[]).map((it) => {
      const k = kept.findIndex((x) => x.title === it.title);
      if (k < 0) return it;
      const [mine] = kept.splice(k, 1);
      const staged = mine.stage ? { ...it, stage: mine.stage } : it;
      if (!mine.size_changed) return staged;
      return { ...staged, size: mine.size, size_changed: true, original_size: it.size && it.size !== mine.size ? it.size : (mine.original_size ?? null) };
    });
  }
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
        : implied === "delivered"
          ? openish || existing.status === "dispatched"
          : implied === "cancelled"
          ? existing.status !== "refunded"
          : true; // refunded always wins
    if (allow) {
      patch.status = implied;
      statusChanged = true;
      if ((implied === "dispatched" || implied === "delivered") && !existing.dispatched_at) patch.dispatched_at = firstFulfilledAt ?? new Date().toISOString();
      if (implied === "delivered") patch.delivered_at = o.fulfillments.map((f) => f.deliveredAt).filter(Boolean).sort().pop() ?? new Date().toISOString();
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

/** Copy Shopify's available quantities into Core (read-only). Records the outcome so the app can show it. */
export async function syncStock() {
  const db = supabaseAdmin();
  const now = new Date().toISOString();
  try {
    const rows = await fetchStock();
    if (rows.length) {
      const { error } = await db.from("shopify_stock").upsert(
        rows.map((r) => ({
          variant_id: r.variantId,
          product_id: r.productId,
          product_title: r.productTitle,
          variant_title: r.variantTitle,
          product_status: r.status.toLowerCase(),
          quantity: r.quantity,
          price: r.price,
          synced_at: now,
        })),
      );
      if (error) throw error;
      // Variants deleted in Shopify drop out of the copy.
      await db.from("shopify_stock").delete().lt("synced_at", now);
    }
    await db.from("sync_state").upsert({ key: "shopify_stock", value: { ok: true, variants: rows.length }, updated_at: now });
    return { ok: true as const, variants: rows.length };
  } catch (e) {
    const m = (e as Error).message;
    // Say exactly which app Core is connected as and what Shopify has granted it, so a refusal can be traced.
    let who = "";
    try {
      const a = await appAccess();
      who = ` Core is connected as the Shopify app "${a.title}" (${a.handle}). Permissions Shopify has granted it on this store: ${a.scopes.join(", ") || "none"}.`;
      if (!a.scopes.includes("read_products")) who += " read_products is not among them: open the app from Shopify admin → Settings → Apps to approve its new permissions, or check that the keys saved in Netlify belong to this app.";
    } catch {}
    const message = `Shopify said: ${m.replace(/^Shopify API error: /, "").slice(0, 220)}.${who}`;
    await db.from("sync_state").upsert({ key: "shopify_stock", value: { ok: false, message }, updated_at: now });
    return { ok: false as const, message };
  }
}

/**
 * Delivery status for orders already dispatched. The normal sync only fetches orders that changed in
 * Shopify since the last run, so orders dispatched earlier are checked here, a batch at a time.
 */
export async function syncDeliveries(budgetMs = 4_000) {
  const db = supabaseAdmin();
  const started = Date.now();
  const { data: state } = await db.from("sync_state").select("value").eq("key", "shopify_deliveries").maybeSingle();
  let offset = Number((state?.value as { offset?: number } | null)?.offset ?? 0);
  let checked = 0;
  let delivered = 0;
  let done = false;
  while (Date.now() - started < budgetMs) {
    const { data: rows } = await db
      .from("orders")
      .select("id, shopify_id, status, dispatched_at")
      .eq("status", "dispatched")
      .not("shopify_id", "is", null)
      .order("placed_at", { ascending: false })
      .range(offset, offset + 24);
    if (!rows?.length) {
      done = true;
      break;
    }
    const res = await shopifyGraphQL<{ nodes: ({ legacyResourceId: string; fulfillments: { createdAt: string; displayStatus: string | null; deliveredAt: string | null }[] } | null)[] }>(
      `query($ids: [ID!]!) { nodes(ids: $ids) { ... on Order { legacyResourceId fulfillments(first: 5) { createdAt displayStatus deliveredAt } } } }`,
      { ids: rows.map((r) => `gid://shopify/Order/${r.shopify_id}`) },
    );
    let moved = 0;
    // Saved together: the database is far from the server, so one at a time would be slow.
    const writes: PromiseLike<unknown>[] = [];
    for (const n of res.nodes) {
      if (!n) continue;
      const row = rows.find((r) => String(r.shopify_id) === n.legacyResourceId);
      if (!row) continue;
      const f = n.fulfillments ?? [];
      const patch: Record<string, unknown> = { delivery_status: f.map((x) => x.displayStatus).filter(Boolean).join(", ").toLowerCase().replace(/_/g, " ") || null };
      if (f.length && f.every((x) => x.displayStatus === "DELIVERED")) {
        patch.status = "delivered";
        patch.delivered_at = f.map((x) => x.deliveredAt).filter(Boolean).sort().pop() ?? new Date().toISOString();
        moved++;
      }
      writes.push(db.from("orders").update(patch).eq("id", row.id));
      if (patch.status) writes.push(db.from("order_events").insert({ order_id: row.id, kind: "shopify_sync", from_status: "dispatched", to_status: "delivered", message: "Courier marked this delivered (from Shopify)" }));
    }
    await Promise.all(writes);
    checked += rows.length;
    delivered += moved;
    // Orders that became Delivered drop out of the list, so only step past the ones that stayed.
    offset += rows.length - moved;
    if (rows.length < 25) {
      done = true;
      break;
    }
  }
  await db.from("sync_state").upsert({ key: "shopify_deliveries", value: { offset: done ? 0 : offset }, updated_at: new Date().toISOString() });
  return { checked, delivered, done };
}
