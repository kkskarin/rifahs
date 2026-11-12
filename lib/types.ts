export type TeamRole = "owner" | "admin" | "staff";

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  role: TeamRole;
  active: boolean;
  created_at: string;
  avatar_url?: string | null;
  phone?: string;
  contact_email?: string;
  dob?: string | null;
  gender?: string;
  prefs?: Prefs;
  /** Set (in the browser only) while an owner is looking at the app as this person. */
  viewingAs?: string;
};
export type Prefs = { theme?: string; font?: string };
export const THEMES: { key: string; label: string; swatch: [string, string, string] }[] = [
  { key: "cream", label: "Kaleidoscope cream", swatch: ["#f4eac4", "#fbf6e6", "#822537"] },
  { key: "light", label: "Light", swatch: ["#f7f6f3", "#ffffff", "#822537"] },
  { key: "dark", label: "Dark", swatch: ["#1b1213", "#2a1d1f", "#e3a4b0"] },
  { key: "rose", label: "Rose", swatch: ["#f8e4e4", "#fdf3f2", "#8f2a44"] },
  { key: "sage", label: "Sage", swatch: ["#e4ead8", "#f3f6ec", "#55622a"] },
  { key: "indigo", label: "Indigo", swatch: ["#e2e6f3", "#f3f5fb", "#34407a"] },
];
export const FONT_SIZES = [
  { key: "normal", label: "Normal" },
  { key: "large", label: "Large" },
  { key: "xlarge", label: "Extra large" },
];

export const STATUSES = [
  "new",
  "printing",
  "stitching",
  "checking",
  "ready",
  "dispatched",
  "delivered",
  "refunded",
  "cancelled",
] as const;
export type OrderStatus = (typeof STATUSES)[number];

/** The production line, in order. "Mark X →" moves an order one step along. */
export const FLOW: OrderStatus[] = ["new", "printing", "stitching", "checking", "ready", "dispatched", "delivered"];

export const STATUS_LABEL: Record<OrderStatus, string> = {
  new: "Open",
  printing: "Fabric",
  stitching: "Stitching",
  checking: "QC & Packing",
  ready: "Ready to Dispatch",
  dispatched: "Dispatched",
  delivered: "Delivered",
  refunded: "Refunded",
  cancelled: "Cancelled",
};

export const OPEN_STATUSES: OrderStatus[] = ["new", "printing", "stitching", "checking", "ready"];

export function nextStatus(s: OrderStatus): OrderStatus | null {
  const i = FLOW.indexOf(s);
  return i >= 0 && i < FLOW.length - 1 ? FLOW[i + 1] : null;
}

export type OrderItem = {
  title: string;
  size?: string | null;
  variant?: string | null;
  quantity: number;
  price?: number | null;
  sku?: string | null;
  /** Set when the team changed the size here; the Shopify sync then leaves this item's size alone. */
  size_changed?: boolean;
  original_size?: string | null;
};
export const SIZE_OPTIONS = ["XS", "S", "M", "L", "XL", "XXL", "3XL", "Unstitched", "Free size"];

export type Order = {
  id: string;
  shopify_id: number | null;
  order_number: string | null;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  items: OrderItem[];
  total: number | null;
  currency: string;
  source: string | null;
  channel: string;
  shopify_source_name: string | null;
  status: OrderStatus;
  is_express: boolean;
  promise_date: string | null;
  is_international: boolean;
  is_internal: boolean;
  is_exchange: boolean;
  ship_country: string | null;
  ship_city: string | null;
  ship_address: Record<string, unknown> | null;
  courier: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  dispatched_at: string | null;
  shopify_fulfilled: boolean;
  financial_status: string | null;
  notes: string;
  tags: string[];
  placed_at: string;
  created_at: string;
  updated_at: string;
};

export type OrderEvent = {
  id: number;
  order_id: string;
  kind: string;
  from_status: OrderStatus | null;
  to_status: OrderStatus | null;
  message: string;
  actor: string | null;
  created_at: string;
};

export type IssueStatus = "open" | "waiting" | "resolved";
export type Issue = {
  id: string;
  order_id: string | null;
  title: string;
  kind: string;
  courier: string | null;
  tracking_number: string | null;
  details: string;
  status: IssueStatus;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  category: "shipping" | "customer";
  updates?: IssueUpdate[];
};
export type IssueUpdate = { id: number; message: string; actor: string | null; created_at: string };
export const DISPUTE_KINDS: Record<"shipping" | "customer", string[]> = {
  shipping: ["Delayed in transit", "Stuck at hub", "Lost", "Damaged in transit", "Returned to origin (RTO)", "Wrong address", "Other"],
  customer: ["Size / fit", "Alteration", "Wrong item", "Quality", "Return", "Exchange", "Refund", "Payment", "Other"],
};

export type Expense = {
  id: string;
  spent_on: string;
  category: string;
  amount: number;
  paid_to: string;
  note: string;
  created_at: string;
  category_id: string | null;
  vendor_id: string | null;
};
export type ExpenseCategory = { id: string; name: string; parent_id: string | null; sort: number };
export type Vendor = { id: string; name: string; phone: string; notes: string; vendor_type: string; default_category_id: string | null };
export const VENDOR_TYPES = ["Fabric supplier", "Printer", "Stitching unit", "Laces & trims supplier", "Courier / transport", "Marketing agency", "Influencer", "Photographer", "Software", "Other"];

export const ISSUE_KINDS = ["Courier", "Delayed", "Damaged", "Wrong item", "Return", "Exchange", "Payment", "Other"];
export const EXPENSE_CATEGORIES = [
  "Fabric",
  "Printing",
  "Stitching",
  "Embroidery",
  "Courier",
  "Packaging",
  "Marketing",
  "Photoshoot",
  "Salaries",
  "Software",
  "Other",
];
export const SOURCES = ["Shopflo", "Razorpay", "Instagram", "WhatsApp", "Exhibition", "Walk-in", "Manual"];
export const COURIERS = ["Delhivery", "Shiprocket", "DTDC", "Blue Dart", "India Post", "DHL", "FedEx", "Aramex", "Other"];

export type StitchedRow = { size: string; qty: number };
export type Product = {
  id: string;
  name: string;
  aliases: string[];
  category: string;
  collection: string;
  in_stock: number;
  at_stitching: number;
  in_production: number;
  low_at: number;
  active: boolean;
  notes: string;
  updated_at: string;
  stitched: StitchedRow[];
};
export type StockField = "in_stock" | "at_stitching" | "in_production" | "stitched";
export type StockMove = {
  id: number;
  product_id: string;
  field: StockField;
  size: string | null;
  delta: number;
  reason: string;
  order_id: string | null;
  actor: string | null;
  created_at: string;
};
export const STOCK_LABEL: Record<StockField, string> = {
  in_stock: "Fabric in stock",
  at_stitching: "At stitching unit",
  in_production: "In production",
  stitched: "Ready stitched",
};
