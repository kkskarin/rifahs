import "server-only";

// Reads orders and stock from Shopify. Writes are limited to what the owner asked for:
//  - createShopifyOrder(): a manual entry made in Core becomes a Shopify order
//  - updateOrderDetails(): customer email, note and shipping address edited in Core
//  - changeLineSize(): a size changed in Core (Shopify order edit)
//  - fulfillOrder(): an order dispatched in Core is marked fulfilled, emailing the customer only if ticked
// Never cancel or refund from here.

const SHOP = process.env.SHOPIFY_STORE_DOMAIN ?? "xd1uww-uu.myshopify.com";
const VERSION = process.env.SHOPIFY_API_VERSION ?? "2026-10";

export function shopifyConfigured() {
  return Boolean(process.env.SHOPIFY_ADMIN_TOKEN || (process.env.SHOPIFY_CLIENT_ID && process.env.SHOPIFY_CLIENT_SECRET));
}

export function shopifyAdminUrl(path = "") {
  const handle = SHOP.replace(".myshopify.com", "");
  return `https://admin.shopify.com/store/${handle}${path}`;
}

// ── Access token ───────────────────────────────────────────────
// Dev Dashboard apps installed on your own store use the client-credentials grant;
// tokens last ~24h so we cache and refresh. A legacy shpat_ token wins if provided.
let cached: { token: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (process.env.SHOPIFY_ADMIN_TOKEN) return process.env.SHOPIFY_ADMIN_TOKEN;
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const res = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.SHOPIFY_CLIENT_ID ?? "",
      client_secret: process.env.SHOPIFY_CLIENT_SECRET ?? "",
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Shopify token request failed (${res.status}): ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; expires_in?: number };
  cached = { token: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 86_400) * 1000 };
  return cached.token;
}

export async function shopifyGraphQL<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`https://${SHOP}/admin/api/${VERSION}/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": await accessToken() },
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
    });
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      continue;
    }
    if (res.status === 401) cached = null;
    const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
    if (!res.ok || json.errors?.length) {
      const throttled = json.errors?.some((e) => /throttled/i.test(e.message));
      if (throttled) {
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
        continue;
      }
      const msg = json.errors?.map((e) => e.message).join("; ") ?? String(res.status);
      // A permission was refused: forget the saved access token, so the next try asks Shopify for a
      // fresh one that carries any permissions added since.
      if (/access denied|access scope/i.test(msg)) cached = null;
      throw new Error(`Shopify API error: ${msg}`);
    }
    return json.data as T;
  }
  throw new Error("Shopify API: too many retries");
}

// ── Orders ─────────────────────────────────────────────────────
export const ORDER_FIELDS = /* GraphQL */ `
  id
  legacyResourceId
  name
  createdAt
  updatedAt
  cancelledAt
  displayFinancialStatus
  displayFulfillmentStatus
  email
  phone
  sourceName
  tags
  note
  paymentGatewayNames
  customAttributes { key value }
  currentTotalPriceSet { shopMoney { amount currencyCode } }
  totalPriceSet { shopMoney { amount currencyCode } }
  customer { displayName }
  shippingAddress { name address1 address2 city province zip country countryCodeV2 phone }
  shippingLine { title }
  lineItems(first: 50) {
    nodes {
      title
      variantTitle
      quantity
      currentQuantity
      sku
      originalUnitPriceSet { shopMoney { amount } }
    }
  }
  fulfillments(first: 5) { createdAt trackingInfo { company number url } }
`;

export type ShopifyOrder = {
  id: string;
  legacyResourceId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
  displayFinancialStatus: string | null;
  displayFulfillmentStatus: string | null;
  email: string | null;
  phone: string | null;
  sourceName: string | null;
  tags: string[];
  note: string | null;
  paymentGatewayNames: string[];
  customAttributes: { key: string; value: string | null }[];
  currentTotalPriceSet: { shopMoney: { amount: string; currencyCode: string } } | null;
  totalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
  customer: { displayName: string } | null;
  shippingAddress: {
    name: string | null;
    address1: string | null;
    address2: string | null;
    city: string | null;
    province: string | null;
    zip: string | null;
    country: string | null;
    countryCodeV2: string | null;
    phone: string | null;
  } | null;
  shippingLine: { title: string } | null;
  lineItems: {
    nodes: {
      title: string;
      variantTitle: string | null;
      quantity: number;
      currentQuantity: number;
      sku: string | null;
      originalUnitPriceSet: { shopMoney: { amount: string } };
    }[];
  };
  fulfillments: { createdAt: string; trackingInfo: { company: string | null; number: string | null; url: string | null }[] }[];
};

export async function fetchOrder(legacyId: string | number) {
  const data = await shopifyGraphQL<{ order: ShopifyOrder | null }>(
    `query($id: ID!) { order(id: $id) { ${ORDER_FIELDS} } }`,
    { id: `gid://shopify/Order/${legacyId}` },
  );
  return data.order;
}

export async function fetchOrdersPage(opts: { after?: string | null; query?: string; first?: number }) {
  const data = await shopifyGraphQL<{
    orders: { nodes: ShopifyOrder[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
  }>(
    `query($first: Int!, $after: String, $query: String) {
      orders(first: $first, after: $after, query: $query, sortKey: UPDATED_AT) {
        nodes { ${ORDER_FIELDS} }
        pageInfo { hasNextPage endCursor }
      }
    }`,
    { first: opts.first ?? 50, after: opts.after ?? null, query: opts.query ?? null },
  );
  return data.orders;
}

// ── The one write: create a manual order ───────────────────────
export type NewShopifyOrder = {
  name: string;
  email: string | null;
  phone: string | null;
  address: { address1?: string | null; city?: string | null; province?: string | null; zip?: string | null; country?: string | null } | null;
  items: { title: string; size: string | null; quantity: number; price: number; taxRate?: number }[];
  /** GST: "none", "inclusive" (prices contain GST) or "exclusive" (GST added on top), and how it splits. */
  taxMode?: "none" | "inclusive" | "exclusive";
  taxType?: "" | "cgst_sgst" | "igst";
  shipping?: number;
  paid: boolean;
  note: string;
  tags: string[];
};

// Shopify wants Indian states as codes.
const IN_STATES: Record<string, string> = Object.fromEntries(
  (
    "andhra pradesh:AP,arunachal pradesh:AR,assam:AS,bihar:BR,chhattisgarh:CG,goa:GA,gujarat:GJ,haryana:HR,himachal pradesh:HP," +
    "jharkhand:JH,karnataka:KA,kerala:KL,madhya pradesh:MP,maharashtra:MH,manipur:MN,meghalaya:ML,mizoram:MZ,nagaland:NL,odisha:OR,orissa:OR," +
    "punjab:PB,rajasthan:RJ,sikkim:SK,tamil nadu:TN,tamilnadu:TN,telangana:TS,tripura:TR,uttar pradesh:UP,uttarakhand:UK,west bengal:WB," +
    "delhi:DL,new delhi:DL,jammu and kashmir:JK,ladakh:LA,chandigarh:CH,puducherry:PY,pondicherry:PY,andaman and nicobar islands:AN," +
    "dadra and nagar haveli and daman and diu:DN,lakshadweep:LD"
  )
    .split(",")
    .map((x) => x.split(":") as [string, string]),
);

const normSize = (s: string | null | undefined) => (s ?? "").trim().toUpperCase().replace("2XL", "XXL").replace("3XL", "XXXL");

/** Find the Shopify variant for "Design" + size so stock and reports stay right. Needs read_products; null if unavailable. */
async function findVariant(title: string, size: string | null): Promise<string | null> {
  try {
    const data = await shopifyGraphQL<{
      products: { nodes: { title: string; variants: { nodes: { id: string; title: string }[] } }[] };
    }>(
      `query($q: String!) { products(first: 5, query: $q) { nodes { title variants(first: 50) { nodes { id title } } } } }`,
      { q: `title:"${title.replace(/"/g, "")}"` },
    );
    const product = data.products.nodes.find((p) => p.title.trim().toLowerCase() === title.trim().toLowerCase());
    if (!product) return null;
    const vs = product.variants.nodes;
    if (!size) return vs.length === 1 ? vs[0].id : null;
    return vs.find((v) => normSize(v.title) === normSize(size))?.id ?? vs.find((v) => v.title.split("/").some((part) => normSize(part) === normSize(size)))?.id ?? null;
  } catch {
    return null;
  }
}

/** GST lines for one item, split CGST + SGST or as IGST, so Shopify's tax report matches Core's. */
function taxLinesFor(it: NewShopifyOrder["items"][number], mode: string, type: string) {
  const rate = (it.taxRate ?? 0) / 100;
  if (mode === "none" || !rate) return null;
  const gross = it.price * it.quantity;
  const tax = mode === "inclusive" ? gross - gross / (1 + rate) : gross * rate;
  const line = (title: string, r: number, amt: number) => ({ title, rate: Number(r.toFixed(4)), priceSet: { shopMoney: { amount: amt.toFixed(2), currencyCode: "INR" } } });
  return { taxLines: type === "cgst_sgst" ? [line("CGST", rate / 2, tax / 2), line("SGST", rate / 2, tax / 2)] : [line("IGST", rate, tax)] };
}

export async function createShopifyOrder(o: NewShopifyOrder) {
  const [first, ...rest] = o.name.trim().split(/\s+/);
  const last = rest.join(" ") || first;
  const lineItems = [];
  let matched = 0;
  for (const it of o.items) {
    const variantId = await findVariant(it.title, it.size);
    if (variantId) matched++;
    lineItems.push({
      ...(variantId ? { variantId } : { title: it.title, ...(it.size ? { variantTitle: it.size } : {}), requiresShipping: true }),
      quantity: it.quantity,
      priceSet: { shopMoney: { amount: it.price.toFixed(2), currencyCode: "INR" } },
      ...(taxLinesFor(it, o.taxMode ?? "none", o.taxType ?? "") ?? {}),
    });
  }
  const a = o.address;
  const hasAddress = Boolean(a?.address1 && a?.city);
  const india = !a?.country || /^(india|in|bharat)$/i.test(a.country.trim());
  const stateCode = IN_STATES[(a?.province ?? "").trim().toLowerCase().replace(/\s+/g, " ")] ?? null;
  const order: Record<string, unknown> = {
    currency: "INR",
    lineItems,
    financialStatus: o.paid ? "PAID" : "PENDING",
    ...(o.taxMode && o.taxMode !== "none" ? { taxesIncluded: o.taxMode === "inclusive" } : {}),
    ...(o.shipping && o.shipping > 0
      ? { shippingLines: [{ title: "Shipping", priceSet: { shopMoney: { amount: o.shipping.toFixed(2), currencyCode: "INR" } } }] }
      : {}),
    note: o.note || undefined,
    tags: o.tags,
    ...(o.email ? { email: o.email } : {}),
    ...(o.phone ? { phone: o.phone } : {}),
    ...(hasAddress
      ? {
          shippingAddress: {
            firstName: first,
            lastName: last,
            address1: a!.address1,
            city: a!.city,
            ...(india ? { countryCode: "IN" } : { country: a!.country }),
            ...(india && stateCode ? { provinceCode: stateCode } : a!.province ? { address2: a!.province } : {}),
            zip: a!.zip || undefined,
            phone: o.phone || undefined,
          },
        }
      : {}),
  };
  const data = await shopifyGraphQL<{
    orderCreate: { userErrors: { field: string[] | null; message: string }[]; order: { legacyResourceId: string; name: string } | null };
  }>(
    `mutation($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
      orderCreate(order: $order, options: $options) { userErrors { field message } order { legacyResourceId name } }
    }`,
    // No emails to the customer; stock is only reduced for items matched to a real variant.
    { order, options: { sendReceipt: false, sendFulfillmentReceipt: false, inventoryBehaviour: matched ? "DECREMENT_IGNORING_POLICY" : "BYPASS" } },
  );
  const errs = data.orderCreate.userErrors;
  if (errs.length || !data.orderCreate.order) throw new Error(errs.map((e) => e.message).join("; ") || "Shopify did not create the order");
  return { id: Number(data.orderCreate.order.legacyResourceId), name: data.orderCreate.order.name, matched, total: o.items.length };
}

// ── Stock (read-only) ──────────────────────────────────────────
export type ShopifyVariantStock = {
  variantId: number;
  productId: number;
  productTitle: string;
  variantTitle: string;
  status: string;
  quantity: number | null;
  price: number | null;
};

/** What Shopify says is available to buy, per product and size. Needs the read_products permission. */
export async function fetchStock(): Promise<ShopifyVariantStock[]> {
  const out: ShopifyVariantStock[] = [];
  let after: string | null = null;
  for (let page = 0; page < 20; page++) {
    const data: {
      products: {
        nodes: { legacyResourceId: string; title: string; status: string; variants: { nodes: { legacyResourceId: string; title: string; inventoryQuantity: number | null; price: string | null }[] } }[];
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    } = await shopifyGraphQL(
      `query($after: String) {
        products(first: 40, after: $after) {
          nodes { legacyResourceId title status variants(first: 60) { nodes { legacyResourceId title inventoryQuantity price } } }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { after },
    );
    for (const p of data.products.nodes)
      for (const v of p.variants.nodes)
        out.push({
          variantId: Number(v.legacyResourceId),
          productId: Number(p.legacyResourceId),
          productTitle: p.title,
          variantTitle: v.title === "Default Title" ? "" : v.title,
          status: p.status,
          quantity: v.inventoryQuantity,
          price: v.price ? Number(v.price) : null,
        });
    if (!data.products.pageInfo.hasNextPage) break;
    after = data.products.pageInfo.endCursor;
  }
  return out;
}

// ── Which app is this, and what has Shopify actually allowed it to do? ──
export async function appAccess() {
  const data = await shopifyGraphQL<{ currentAppInstallation: { app: { title: string; handle: string }; accessScopes: { handle: string }[] } }>(
    `{ currentAppInstallation { app { title handle } accessScopes { handle } } }`,
  );
  return { title: data.currentAppInstallation.app.title, handle: data.currentAppInstallation.app.handle, scopes: data.currentAppInstallation.accessScopes.map((s) => s.handle).sort() };
}

const gid = (legacyId: number | string) => `gid://shopify/Order/${legacyId}`;
const userErrors = (errs: { message: string }[] | undefined) => {
  if (errs?.length) throw new Error(errs.map((e) => e.message).join("; "));
};

// ── Edit: customer details ─────────────────────────────────────
export async function updateOrderDetails(
  legacyId: number,
  d: { name: string; email: string | null; phone: string | null; address: Record<string, string | null> | null },
) {
  const [first, ...rest] = d.name.trim().split(/\s+/);
  const a = d.address;
  const india = !a?.country || /^(india|in)$/i.test(String(a.country).trim()) || a?.countryCodeV2 === "IN";
  const stateCode = IN_STATES[String(a?.province ?? "").trim().toLowerCase().replace(/\s+/g, " ")] ?? null;
  const input: Record<string, unknown> = { id: gid(legacyId) };
  if (d.email) input.email = d.email;
  if (a?.address1 && a?.city) {
    input.shippingAddress = {
      firstName: first,
      lastName: rest.join(" ") || first,
      address1: a.address1,
      ...(a.address2 ? { address2: a.address2 } : {}),
      city: a.city,
      zip: a.zip || undefined,
      phone: d.phone || a.phone || undefined,
      ...(india ? { countryCode: "IN" } : a.countryCodeV2 ? { countryCode: a.countryCodeV2 } : {}),
      ...(india && stateCode ? { provinceCode: stateCode } : {}),
    };
  }
  const r = await shopifyGraphQL<{ orderUpdate: { userErrors: { message: string }[] } }>(
    `mutation($input: OrderInput!) { orderUpdate(input: $input) { userErrors { message } } }`,
    { input },
  );
  userErrors(r.orderUpdate.userErrors);
}

// ── Edit: swap an item to another size ─────────────────────────
export async function changeLineSize(legacyId: number, title: string, fromSize: string | null, toSize: string) {
  const newVariant = await findVariant(title, toSize);
  if (!newVariant) return { ok: false as const, message: `Shopify has no "${title}" in size ${toSize}, so the change is kept in Core only.` };

  const begin = await shopifyGraphQL<{
    orderEditBegin: {
      userErrors: { message: string }[];
      calculatedOrder: { id: string; lineItems: { nodes: { id: string; title: string; quantity: number; variant: { id: string; title: string } | null }[] } } | null;
    };
  }>(
    `mutation($id: ID!) { orderEditBegin(id: $id) { userErrors { message } calculatedOrder { id lineItems(first: 50) { nodes { id title quantity variant { id title } } } } } }`,
    { id: gid(legacyId) },
  );
  userErrors(begin.orderEditBegin.userErrors);
  const calc = begin.orderEditBegin.calculatedOrder!;
  const same = (t: string) => t.trim().toLowerCase() === title.trim().toLowerCase();
  const lines = calc.lineItems.nodes.filter((l) => l.quantity > 0 && same(l.title));
  const line = lines.find((l) => fromSize && l.variant?.title.split("/").some((p) => normSize(p) === normSize(fromSize))) ?? lines[0];
  if (!line) return { ok: false as const, message: `Couldn't find "${title}" on the Shopify order, so the change is kept in Core only.` };
  if (line.variant?.id === newVariant) return { ok: true as const, message: "Shopify already has that size." };

  // Nothing changes in Shopify until the final commit; if any step fails the edit is simply dropped.
  const add = await shopifyGraphQL<{ orderEditAddVariant: { userErrors: { message: string }[] } }>(
    `mutation($id: ID!, $v: ID!, $q: Int!) { orderEditAddVariant(id: $id, variantId: $v, quantity: $q, allowDuplicates: true) { userErrors { message } } }`,
    { id: calc.id, v: newVariant, q: line.quantity },
  );
  userErrors(add.orderEditAddVariant.userErrors);
  const rm = await shopifyGraphQL<{ orderEditSetQuantity: { userErrors: { message: string }[] } }>(
    `mutation($id: ID!, $l: ID!) { orderEditSetQuantity(id: $id, lineItemId: $l, quantity: 0) { userErrors { message } } }`,
    { id: calc.id, l: line.id },
  );
  userErrors(rm.orderEditSetQuantity.userErrors);
  const commit = await shopifyGraphQL<{ orderEditCommit: { userErrors: { message: string }[] } }>(
    `mutation($id: ID!, $note: String) { orderEditCommit(id: $id, notifyCustomer: false, staffNote: $note) { userErrors { message } } }`,
    { id: calc.id, note: `Size changed in Kaleidoscope Core: ${title} ${fromSize ?? "—"} → ${toSize}` },
  );
  userErrors(commit.orderEditCommit.userErrors);
  return { ok: true as const, message: `Shopify order updated to size ${toSize}.` };
}

// ── Dispatch: mark fulfilled, with tracking ────────────────────
export async function fulfillOrder(legacyId: number, t: { company?: string | null; number?: string | null; url?: string | null }, notifyCustomer: boolean) {
  const fo = await shopifyGraphQL<{ order: { fulfillmentOrders: { nodes: { id: string; status: string }[] } } | null }>(
    `query($id: ID!) { order(id: $id) { fulfillmentOrders(first: 10) { nodes { id status } } } }`,
    { id: gid(legacyId) },
  );
  const open = fo.order?.fulfillmentOrders.nodes.filter((n) => ["OPEN", "IN_PROGRESS", "SCHEDULED"].includes(n.status)) ?? [];
  if (!open.length) return { ok: true as const, message: "Shopify already shows this order as fulfilled." };
  const trackingInfo: Record<string, string> = {};
  if (t.company) trackingInfo.company = t.company;
  if (t.number) trackingInfo.number = t.number;
  if (t.url) trackingInfo.url = t.url;
  const r = await shopifyGraphQL<{ fulfillmentCreate: { userErrors: { message: string }[] } }>(
    `mutation($f: FulfillmentInput!) { fulfillmentCreate(fulfillment: $f) { userErrors { message } } }`,
    { f: { lineItemsByFulfillmentOrder: open.map((n) => ({ fulfillmentOrderId: n.id })), notifyCustomer, ...(Object.keys(trackingInfo).length ? { trackingInfo } : {}) } },
  );
  userErrors(r.fulfillmentCreate.userErrors);
  return { ok: true as const, message: notifyCustomer ? "Marked fulfilled in Shopify; the customer was emailed." : "Marked fulfilled in Shopify (no email sent)." };
}
