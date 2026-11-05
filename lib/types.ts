export type TeamRole = "owner" | "admin" | "staff";

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  role: TeamRole;
  active: boolean;
  created_at: string;
};

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
  new: "New",
  printing: "Printing",
  stitching: "Stitching",
  checking: "Checking",
  ready: "Ready to ship",
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
};

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
};

export type Expense = {
  id: string;
  spent_on: string;
  category: string;
  amount: number;
  paid_to: string;
  note: string;
  created_at: string;
};

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
