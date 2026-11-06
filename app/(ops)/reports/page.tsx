"use client";

import { useMemo, useRef, useState } from "react";
import { money, shortDate, todayIST } from "@/lib/format";
import { isAdmin } from "@/lib/roles";
import { addExpense, countsAsSale, deleteExpense, useExpenses, useMe, useOrders } from "@/lib/store";
import { EXPENSE_CATEGORIES } from "@/lib/types";

const monthKey = (iso: string) =>
  new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }).slice(0, 7); // YYYY-MM in IST

export default function ReportsPage() {
  const { data: me } = useMe();
  const admin = me ? isAdmin(me) : false;
  const { data: orders } = useOrders();
  const { data: expenses } = useExpenses(admin);
  const [msg, setMsg] = useState<{ ok: boolean; message?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const { months, byCat } = useMemo(() => {
    const m = new Map<string, { sales: number; orders: number; spent: number }>();
    const get = (k: string) => m.get(k) ?? (m.set(k, { sales: 0, orders: 0, spent: 0 }), m.get(k)!);
    // Internal / test, cancelled and refunded orders never count.
    for (const o of (orders ?? []).filter(countsAsSale)) {
      const r = get(monthKey(o.placed_at));
      r.sales += Number(o.total ?? 0);
      r.orders += 1;
    }
    const cat = new Map<string, number>();
    for (const e of expenses ?? []) {
      get(e.spent_on.slice(0, 7)).spent += Number(e.amount);
      cat.set(e.category, (cat.get(e.category) ?? 0) + Number(e.amount));
    }
    return { months: [...m.entries()].sort((a, b) => b[0].localeCompare(a[0])), byCat: [...cat.entries()].sort((a, b) => b[1] - a[1]) };
  }, [orders, expenses]);

  if (me && !admin) return <p className="empty">Reports are visible to owners and admins.</p>;

  return (
    <>
      <div className="page-head">
        <h1>Reports</h1>
        <p>Sales, spending and approximate profit by month.</p>
      </div>
      <form
        ref={formRef}
        className="panel"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!me) return;
          const f = new FormData(e.currentTarget);
          const v = (k: string) => String(f.get(k) ?? "").trim();
          setBusy(true);
          const r = await addExpense(me, { amount: v("amount"), category: v("category"), spent_on: v("spent_on"), paid_to: v("paid_to"), note: v("note") });
          setBusy(false);
          setMsg(r);
          if (r.ok) formRef.current?.reset();
        }}
      >
        <h3>Add an expense</h3>
        <div className="grid">
          <label className="field">
            <span>Amount ₹</span>
            <input name="amount" inputMode="decimal" required />
          </label>
          <label className="field">
            <span>Category</span>
            <select name="category">
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Date</span>
            <input name="spent_on" type="date" defaultValue={todayIST()} />
          </label>
          <label className="field">
            <span>Paid to</span>
            <input name="paid_to" placeholder="Tailor / vendor" />
          </label>
          <label className="field full">
            <span>Note</span>
            <input name="note" />
          </label>
        </div>
        {msg && <p className={msg.ok ? "success" : "error"}>{msg.message}</p>}
        <div className="form-actions">
          <button className="btn primary" disabled={busy}>
            {busy ? "Saving…" : "Add expense"}
          </button>
        </div>
      </form>

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
                      <td>{new Date(k + "-01T00:00:00").toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</td>
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

      {byCat.length > 0 && (
        <div className="panel">
          <h3>Where the money went</h3>
          <table className="t">
            <tbody>
              {byCat.map(([c, v]) => (
                <tr key={c}>
                  <td>{c}</td>
                  <td className="n">{money(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="panel">
        <h3>Expenses</h3>
        {!expenses?.length ? (
          <p className="hint">{expenses ? "No expenses logged yet." : "Loading…"}</p>
        ) : (
          <div className="scroll-x">
            <table className="t">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Paid to</th>
                  <th>Note</th>
                  <th className="n">Amount</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => (
                  <tr key={e.id}>
                    <td>{shortDate(e.spent_on)}</td>
                    <td>{e.category}</td>
                    <td>{e.paid_to}</td>
                    <td className="hint">{e.note}</td>
                    <td className="n">{money(Number(e.amount))}</td>
                    <td>
                      <button className="link" onClick={() => confirm("Delete this expense?") && deleteExpense(e.id)} aria-label="Delete expense">
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
