import { itemsLine, todayIST } from "./format";
import { STATUS_LABEL, type Order } from "./types";

export function downloadOrdersCsv(orders: Order[], label: string) {
  const cols = [
    "Order #", "Placed", "Customer", "Phone", "Email", "City", "Items", "Amount", "Status", "Express", "Promise date",
    "International", "Country", "Source", "Courier", "AWB", "Dispatched", "Internal", "Notes",
  ];
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; // no spreadsheet formula injection
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const lines = [cols.join(",")];
  for (const o of orders) {
    lines.push(
      [
        o.order_number, o.placed_at.slice(0, 10), o.customer_name, o.customer_phone, o.customer_email, o.ship_city,
        itemsLine(o.items), o.total, STATUS_LABEL[o.status], o.is_express ? "Yes" : "", o.promise_date,
        o.is_international ? "Yes" : "", o.ship_country, o.source, o.courier, o.tracking_number,
        o.dispatched_at?.slice(0, 10), o.is_internal ? "Yes" : "", o.notes,
      ]
        .map(esc)
        .join(","),
    );
  }
  const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `rifahs-orders-${label}-${todayIST()}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
