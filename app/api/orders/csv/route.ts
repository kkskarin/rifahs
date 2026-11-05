import { type NextRequest } from "next/server";
import { listOrders } from "@/lib/data";
import { requireMember } from "@/lib/session";
import { OPEN_STATUSES, STATUSES, STATUS_LABEL, type OrderStatus } from "@/lib/types";
import { itemsLine, todayIST } from "@/lib/format";

export async function GET(req: NextRequest) {
  await requireMember();
  const f = req.nextUrl.searchParams.get("f") ?? "all";
  const q = req.nextUrl.searchParams.get("q") ?? undefined;
  const statuses = f === "open" ? OPEN_STATUSES : STATUSES.includes(f as OrderStatus) ? [f as OrderStatus] : undefined;
  const orders = await listOrders({ statuses, q, limit: 10_000, internalOnly: f === "internal" });

  const cols = [
    "Order #", "Placed", "Customer", "Phone", "Email", "Items", "Amount", "Status", "Express", "Promise date",
    "International", "Country", "Source", "Channel", "Courier", "AWB", "Dispatched", "Notes",
  ];
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    // Guard against spreadsheet formula injection.
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const lines = [cols.join(",")];
  for (const o of orders) {
    lines.push(
      [
        o.order_number, o.placed_at.slice(0, 10), o.customer_name, o.customer_phone, o.customer_email, itemsLine(o.items),
        o.total, STATUS_LABEL[o.status], o.is_express ? "Yes" : "", o.promise_date, o.is_international ? "Yes" : "",
        o.ship_country, o.source, o.channel, o.courier, o.tracking_number, o.dispatched_at?.slice(0, 10), o.notes,
      ]
        .map(esc)
        .join(","),
    );
  }
  return new Response("﻿" + lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="rifahs-orders-${f}-${todayIST()}.csv"`,
    },
  });
}
