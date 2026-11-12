import "server-only";

// Reads orders from Shopify. The ONLY write is createShopifyOrder(): a manual entry made in Core
// is created as an order in Shopify, at the user's request. Nothing else is ever changed there.

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
  items: { title: string; size: string | null; quantity: number; price: number }[];
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

const normSize = (s: string | null | undefined) => (s ?? "").trim().toUpperCase().replace("2XL", "XXL");

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
    return vs.find((v) => v.title.split("/").some((part) => normSize(part) === normSize(size)))?.id ?? null;
  } catch {
    return null;
  }
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
};

/** What Shopify says is available to buy, per product and size. Needs the read_products permission. */
export async function fetchStock(): Promise<ShopifyVariantStock[]> {
  const out: ShopifyVariantStock[] = [];
  let after: string | null = null;
  for (let page = 0; page < 20; page++) {
    const data: {
      products: {
        nodes: { legacyResourceId: string; title: string; status: string; variants: { nodes: { legacyResourceId: string; title: string; inventoryQuantity: number | null }[] } }[];
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    } = await shopifyGraphQL(
      `query($after: String) {
        products(first: 40, after: $after) {
          nodes { legacyResourceId title status variants(first: 60) { nodes { legacyResourceId title inventoryQuantity } } }
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
        });
    if (!data.products.pageInfo.hasNextPage) break;
    after = data.products.pageInfo.endCursor;
  }
  return out;
}
