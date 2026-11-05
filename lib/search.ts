import type { Order } from "./types";
import { itemsLine } from "./format";

/** In-browser search over name, order #, phone, items, notes, tracking. */
export function matches(o: Order & { items_text?: string }, q: string) {
  const needle = q.trim().toLowerCase().replace(/^#/, "");
  if (!needle) return true;
  const hay = [o.customer_name, o.order_number, o.customer_phone, o.customer_email, o.items_text ?? itemsLine(o.items), o.notes, o.tracking_number, o.ship_city]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return needle.split(/\s+/).every((w) => hay.includes(w));
}
