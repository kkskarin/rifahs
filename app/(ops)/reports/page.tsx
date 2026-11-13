"use client";

import Link from "next/link";
import { useMemo } from "react";
import { money } from "@/lib/format";
import { useExpenseCategories } from "@/lib/money";
import { useCan } from "@/lib/perms";
import { countsAsSale, useExpenses, useMe, useOrders } from "@/lib/store";

const monthKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }).slice(0, 7); // YYYY-MM in IST

export default function ReportsPage() {
  const { data: me } = useMe();
  const { can } = useCan();
  const admin = can("reports");
  const { data: orders } = useOrders();
  const { data: expenses } = useExpenses(can("purchase"));
  const { data: cats } = useExpenseCategories();



  const months = useMemo(() => {
    const m = new Map<string, { sales: number; orders: number; spent: number }>();
    const get = (k: string) => m.get(k) ?? (m.set(k, { sales: 0, orders: 0, spent: 0 }), m.get(k)!);
    // Internal / test, cancelled and refunded orders never count.
    for (const o of (orders ?? []).filter(countsAsSale)) {
      const r = get(monthKey(o.placed_at));
      r.sales += Number(o.total ?? 0);
      r.orders += 1;
    }
    for (const e of expenses ?? []) get(e.spent_on.slice(0, 7)).spent += Number(e.amount);
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [orders, expenses]);

  const byCategoryAll = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of expenses ?? []) {
      const c = (cats ?? []).find((x) => x.id === e.category_id);
      const top = c?.parent_id ? (cats ?? []).find((x) => x.id === c.parent_id) : c;
      const k = top?.name ?? (e.category || "Uncategorised");
      m.set(k, (m.get(k) ?? 0) + Number(e.amount));
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [expenses, cats]);

  if (me && !admin) return <p className="empty">Reports are visible to owners and admins.</p>;
  return (
    <>
      <div className="page-head">
        <h1>Reports</h1>
        <p>Sales, spending and approximate profit, month by month.</p>
      </div>


      <div className="panel">
        <h3>Month by month</h3>
        {!orders || !expenses ? (
          <p className="hint">Loading…</p>
        ) : (
          <div className="scroll-x">
            <table className="t">
              <thead>
                <tr>
                  <th>Month</th>
                  <th className="n">Orders</th>
                  <th className="n">Sales</th>
                  <th className="n">Spent</th>
                  <th className="n">Approx. profit</th>
                </tr>
              </thead>
              <tbody>
                {months.map(([k, r]) => {
                  const profit = r.sales - r.spent;
                  return (
                    <tr key={k}>
                      <td style={{ whiteSpace: "nowrap" }}>{new Date(k + "-01T00:00:00").toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</td>
                      <td className="n">{r.orders}</td>
                      <td className="n">{money(r.sales)}</td>
                      <td className="n">{money(r.spent)}</td>
                      <td className="n" style={{ color: profit < 0 ? "var(--danger)" : undefined }}>
                        {money(profit)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="hint">Sales count customer orders that weren&apos;t cancelled or refunded, by order date. Internal / test orders never count.</p>
      </div>

      <div className="panel">
        <h3>Spending by category</h3>
        {byCategoryAll.length ? (
          <table className="t">
            <tbody>
              {byCategoryAll.map(([name, v]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td className="n">{money(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="hint">No expenses recorded yet.</p>
        )}
        <p className="hint">
          Add expenses and filter them by period, category and vendor in{" "}
          <Link className="link" href="/expenses">
            Expenses
          </Link>
          .
        </p>
      </div>
    </>
  );
}
