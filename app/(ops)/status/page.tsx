"use client";

import Link from "next/link";
import SalesNav from "@/components/SalesNav";
import { useMemo, useState } from "react";
import { dueInfo, useDueRules } from "@/lib/due";
import { itemsLine, shortDate } from "@/lib/format";
import { matches } from "@/lib/search";
import { useIssues, useOrders } from "@/lib/store";
import { OPEN_STATUSES, STATUS_LABEL, type Order, type OrderStatus } from "@/lib/types";

// The eight views asked for, plus Dispatched (in transit) which sits between Ready and Delivered.
type Bucket = "new" | "printing" | "stitching" | "checking" | "ready" | "dispatched" | "delivered" | "issue" | "closed";
const BUCKETS: { key: Bucket; label: string }[] = [
  { key: "new", label: "Open" },
  { key: "printing", label: "Fabric" },
  { key: "stitching", label: "Stitching" },
  { key: "checking", label: "QC & Packing" },
  { key: "ready", label: "Ready to Dispatch" },
  { key: "dispatched", label: "Dispatched" },
  { key: "delivered", label: "Delivered" },
  { key: "issue", label: "Issue" },
  { key: "closed", label: "Closed" },
];
const CHOICES: OrderStatus[] = ["new", "printing", "stitching", "checking", "ready", "dispatched", "delivered", "cancelled", "refunded"];
const bucketOf = (o: Order): Bucket => (o.status === "cancelled" || o.status === "refunded" ? "closed" : (o.status as Bucket));

export default function OrderStatusPage() {
  const { data: orders } = useOrders();
  const { data: issues } = useIssues();
  const rules = useDueRules();
  const [pick, setPick] = useState<Bucket | "active" | "all">("active");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(200);

  const withIssue = useMemo(() => new Set((issues ?? []).filter((i) => i.status !== "resolved" && i.order_id).map((i) => i.order_id as string)), [issues]);
  const real = useMemo(() => (orders ?? []).filter((o) => !o.is_internal), [orders]);
  const counts = useMemo(() => {
    const c = Object.fromEntries(BUCKETS.map((b) => [b.key, 0])) as Record<Bucket, number>;
    for (const o of real) {
      c[bucketOf(o)] += 1;
      if (withIssue.has(o.id)) c.issue += 1;
    }
    return c;
  }, [real, withIssue]);

  const list = useMemo(() => {
    const rows = real
      .filter((o) =>
        pick === "all" ? true : pick === "active" ? OPEN_STATUSES.includes(o.status) || o.status === "dispatched" || withIssue.has(o.id) : pick === "issue" ? withIssue.has(o.id) : bucketOf(o) === pick,
      )
      .filter((o) => matches(o, q));
    const rank = (o: Order) => CHOICES.indexOf(o.status);
    return rows.sort((a, b) => rank(a) - rank(b) || dueInfo(a, rules).days - dueInfo(b, rules).days);
  }, [real, pick, q, withIssue, rules]);

  return (
    <>
      <SalesNav />
      <p className="hint" style={{ marginTop: 0 }}>Every order by where it stands. To change a status, open the order or use All Sales.</p>

      <div className="status-chips">
        <button className="schip" aria-pressed={pick === "active"} onClick={() => setPick("active")}>
          In progress
        </button>
        {BUCKETS.map((b) => (
          <button key={b.key} className={`schip st-${b.key}`} aria-pressed={pick === b.key} onClick={() => setPick(b.key)}>
            {b.label} <b>{orders ? counts[b.key] : "…"}</b>
          </button>
        ))}
        <button className="schip" aria-pressed={pick === "all"} onClick={() => setPick("all")}>
          All <b>{real.length}</b>
        </button>
      </div>

      <div className="toolbar">
        <label className="search">
          <span className="sr-only">Search</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, product, order #, AWB" />
        </label>
      </div>

      {!orders ? (
        <p className="empty">Loading…</p>
      ) : !list.length ? (
        <p className="empty">No orders here.</p>
      ) : (
        <div className="panel" style={{ padding: 0 }}>
          <div className="scroll-x">
            <table className="t stack status-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Items</th>
                  <th>Ordered</th>
                  <th>Due by</th>
                  <th>Courier · AWB</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {list.slice(0, limit).map((o) => {
                  const due = dueInfo(o, rules);
                  const open = OPEN_STATUSES.includes(o.status);
                  const b = bucketOf(o);
                  return (
                    <tr key={o.id} className={`st-${b}${withIssue.has(o.id) ? " has-issue" : ""}`}>
                      <td className="stack-title" style={{ whiteSpace: "nowrap" }}>
                        <Link href={`/order?id=${o.id}`}>{o.order_number ?? "—"}</Link>
                      </td>
                      <td data-label="Customer">
                        {o.customer_name}
                        {o.is_express && <span className="flag express"> Express</span>}
                      </td>
                      <td data-label="Items">{itemsLine(o.items)}</td>
                      <td data-label="Ordered" style={{ whiteSpace: "nowrap" }}>
                        {shortDate(o.placed_at)}
                      </td>
                      <td data-label="Due by">
                        {open ? (
                          <span className={`due due-${due.level}`} style={{ marginTop: 0 }}>
                            {due.label}
                          </span>
                        ) : (
                          <span className="meta">—</span>
                        )}
                      </td>
                      <td data-label="Courier · AWB">{[o.courier, o.tracking_number].filter(Boolean).join(" · ")}</td>
                      <td data-label="Status">
                        <span className="status-cell">
                          <span className={`status-select st-${b}`}>{STATUS_LABEL[o.status]}</span>
                          {withIssue.has(o.id) && (
                            <Link href="/disputes" className="issue-tag">
                              Issue
                            </Link>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {list.length > limit && (
        <div className="form-actions" style={{ justifyContent: "center" }}>
          <button className="btn ghost" onClick={() => setLimit((l) => l + 300)}>
            Show more ({list.length - limit} left)
          </button>
        </div>
      )}
    </>
  );
}
