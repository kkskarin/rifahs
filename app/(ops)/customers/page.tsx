"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { money, shortDate } from "@/lib/format";
import { useCan } from "@/lib/perms";
import { useOrders } from "@/lib/store";

type Customer = { key: string; name: string; phone: string; email: string; city: string; orders: number; total: number; last: string; names: Set<string> };
type Sort = "recent" | "orders" | "total" | "name";

const digits = (p: string | null | undefined) => (p ?? "").replace(/\D/g, "").slice(-10);

/** Everyone who has ordered, worked out from the orders in Core: one row per phone number (or email). */
export default function CustomersPage() {
  const { can } = useCan();
  const { data: orders } = useOrders();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("recent");
  const [limit, setLimit] = useState(100);
  const showMoney = can("see_amounts");

  const list = useMemo(() => {
    const m = new Map<string, Customer>();
    for (const o of orders ?? []) {
      if (o.is_internal) continue;
      const phone = digits(o.customer_phone);
      const email = (o.customer_email ?? "").trim().toLowerCase();
      const key = phone ? `p:${phone}` : email ? `e:${email}` : `n:${o.customer_name.trim().toLowerCase()}`;
      const c = m.get(key) ?? { key, name: o.customer_name, phone: o.customer_phone ?? "", email, city: o.ship_city ?? "", orders: 0, total: 0, last: "", names: new Set<string>() };
      c.orders += 1;
      if (o.status !== "cancelled" && o.status !== "refunded") c.total += Number(o.total ?? 0);
      c.names.add(o.customer_name.trim());
      if (o.placed_at > c.last) {
        // The newest order has the most up-to-date details.
        c.last = o.placed_at;
        c.name = o.customer_name;
        c.phone = o.customer_phone ?? c.phone;
        c.email = email || c.email;
        c.city = o.ship_city ?? c.city;
      }
      m.set(key, c);
    }
    return [...m.values()];
  }, [orders]);

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    const rows = n ? list.filter((c) => [c.name, ...c.names, c.phone, c.email, c.city].join(" ").toLowerCase().includes(n)) : list;
    const by: Record<Sort, (a: Customer, b: Customer) => number> = {
      recent: (a, b) => b.last.localeCompare(a.last),
      orders: (a, b) => b.orders - a.orders || b.last.localeCompare(a.last),
      total: (a, b) => b.total - a.total,
      name: (a, b) => a.name.localeCompare(b.name),
    };
    return [...rows].sort(by[sort]);
  }, [list, q, sort]);

  if (!can("see_contact")) return <p className="empty">Your role doesn&apos;t include customer details. Ask the owner if you need it.</p>;
  const repeat = list.filter((c) => c.orders > 1).length;

  return (
    <>
      <section className="stats" aria-label="Summary">
        <div className="stat">
          <div className="label">Customers</div>
          <div className="value">{orders ? list.length : "…"}</div>
        </div>
        <div className="stat">
          <div className="label">Ordered more than once</div>
          <div className="value accent">{orders ? repeat : "…"}</div>
        </div>
      </section>
      <p className="hint">
        Built from the orders in Core: one row per phone number, or per email when there is no phone. Editing a customer and merging duplicates
        will come here once the Shopify app has the customer permissions.
      </p>
      <div className="toolbar">
        <label className="search">
          <span className="sr-only">Search customers</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone, email, city" />
        </label>
        <label className="field" style={{ minWidth: 190 }}>
          <span className="sr-only">Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
            <option value="recent">Most recent order</option>
            <option value="orders">Most orders</option>
            {showMoney && <option value="total">Highest spend</option>}
            <option value="name">Name A–Z</option>
          </select>
        </label>
      </div>

      {!orders ? (
        <p className="empty">Loading…</p>
      ) : !shown.length ? (
        <p className="empty">No customers match.</p>
      ) : (
        <div className="panel" style={{ padding: 0 }}>
          <div className="scroll-x">
            <table className="t stack">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>City</th>
                  <th className="n">Orders</th>
                  {showMoney && <th className="n">Spent</th>}
                  <th>Last order</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.slice(0, limit).map((c) => (
                  <tr key={c.key}>
                    <td className="stack-title">
                      {c.name}
                      {c.names.size > 1 && <div className="meta">also: {[...c.names].filter((x) => x !== c.name.trim()).join(", ")}</div>}
                    </td>
                    <td data-label="Phone">{c.phone ? <a href={`tel:${c.phone}`}>{c.phone}</a> : <span className="meta">—</span>}</td>
                    <td data-label="Email">{c.email || <span className="meta">—</span>}</td>
                    <td data-label="City">{c.city || <span className="meta">—</span>}</td>
                    <td className="n" data-label="Orders">
                      {c.orders}
                    </td>
                    {showMoney && (
                      <td className="n" data-label="Spent">
                        {money(c.total)}
                      </td>
                    )}
                    <td data-label="Last order">{shortDate(c.last)}</td>
                    <td className="stack-actions">
                      <Link className="link" href={`/orders?${new URLSearchParams({ f: "all", q: digits(c.phone) || c.email || c.name })}`}>
                        Orders
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {shown.length > limit && (
        <div className="form-actions" style={{ justifyContent: "center" }}>
          <button className="btn ghost" onClick={() => setLimit((l) => l + 200)}>
            Show more ({shown.length - limit} left)
          </button>
        </div>
      )}
    </>
  );
}
