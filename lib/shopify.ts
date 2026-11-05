import "server-only";

// READ-ONLY by design: this app never writes to Shopify (no mutations).

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
      throw new Error(`Shopify API error: ${json.errors?.map((e) => e.message).join("; ") ?? res.status}`);
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
