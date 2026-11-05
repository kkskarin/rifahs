import { requireAdmin } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase-server";
import { money, shortDate } from "@/lib/format";
import type { Expense } from "@/lib/types";
import ExpenseForm from "@/components/ExpenseForm";
import DeleteExpense from "@/components/DeleteExpense";

export const metadata = { title: "Money" };

export default async function MoneyPage() {
  await requireAdmin();
  const db = await supabaseServer();
  const [{ data: months }, { data: expenses }] = await Promise.all([
    db.rpc("money_by_month", { months: 12 }),
    db.from("expenses").select("*").order("spent_on", { ascending: false }).limit(200),
  ]);
  const rows = (months ?? []) as { month: string; sales: number; spent: number; orders: number }[];

  const byCat = new Map<string, number>();
  for (const e of (expenses ?? []) as Expense[]) byCat.set(e.category, (byCat.get(e.category) ?? 0) + Number(e.amount));

  return (
    <>
      <ExpenseForm />

      <div className="panel">
        <h3>Month by month</h3>
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
              {rows.map((r) => {
                const profit = Number(r.sales) - Number(r.spent);
                return (
                  <tr key={r.month}>
                    <td>{new Date(r.month).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</td>
                    <td className="n">{r.orders}</td>
                    <td className="n">{money(Number(r.sales))}</td>
                    <td className="n">{money(Number(r.spent))}</td>
                    <td className="n" style={{ color: profit < 0 ? "var(--danger)" : undefined }}>
                      {money(profit)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="hint">Sales count every order that isn&apos;t refunded or cancelled, by the date it was placed.</p>
      </div>

      {byCat.size > 0 && (
        <div className="panel">
          <h3>Where the money went (last 200 entries)</h3>
          <table className="t">
            <tbody>
              {[...byCat.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([c, v]) => (
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
          <p className="hint">No expenses logged yet.</p>
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
                {(expenses as Expense[]).map((e) => (
                  <tr key={e.id}>
                    <td>{shortDate(e.spent_on)}</td>
                    <td>{e.category}</td>
                    <td>{e.paid_to}</td>
                    <td className="hint">{e.note}</td>
                    <td className="n">{money(Number(e.amount))}</td>
                    <td>
                      <DeleteExpense id={e.id} />
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
