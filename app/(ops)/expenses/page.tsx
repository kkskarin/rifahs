"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { VendorLinkFields } from "@/components/MoneyMasters";
import { saveVendor } from "@/lib/money";
import type { Profile } from "@/lib/types";
import { money, shortDate, todayIST } from "@/lib/format";
import { addExpense, categoryLabel, categoryTree, downloadExpensesCsv, useExpenseCategories, useVendors } from "@/lib/money";
import { useCan } from "@/lib/perms";
import { deleteExpense, useExpenses, useMe } from "@/lib/store";

type Period = "this-month" | "last-month" | "3-months" | "fy" | "all" | "custom";
const PERIODS: { key: Period; label: string }[] = [
  { key: "this-month", label: "This month" },
  { key: "last-month", label: "Last month" },
  { key: "3-months", label: "Last 3 months" },
  { key: "fy", label: "This financial year" },
  { key: "all", label: "All time" },
  { key: "custom", label: "Custom dates" },
];

/** [from, to] as YYYY-MM-DD (inclusive) for a period, in India time. */
function periodRange(p: Period, from: string, to: string): [string, string] {
  const today = todayIST();
  const [y, m] = today.split("-").map(Number);
  const ym = (yy: number, mm: number) => {
    const d = new Date(Date.UTC(yy, mm - 1, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  const lastDay = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).toISOString().slice(0, 10);
  if (p === "this-month") return [`${ym(y, m)}-01`, today];
  if (p === "last-month") return [`${ym(y, m - 1)}-01`, lastDay(m === 1 ? y - 1 : y, m === 1 ? 12 : m - 1)];
  if (p === "3-months") return [`${ym(y, m - 2)}-01`, today];
  if (p === "fy") return [`${m >= 4 ? y : y - 1}-04-01`, today];
  if (p === "custom") return [from || "0000-01-01", to || "9999-12-31"];
  return ["0000-01-01", "9999-12-31"];
}

export default function ExpensesPage() {
  const { data: me } = useMe();
  const admin = useCan().can("purchase");
  const { data: expenses } = useExpenses(admin);
  const { data: cats } = useExpenseCategories();
  const { data: vendors } = useVendors();

  const [period, setPeriod] = useState<Period>("this-month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [cat, setCat] = useState("");
  const [vendor, setVendor] = useState("");
  const [q, setQ] = useState("");

  const tree = useMemo(() => categoryTree(cats), [cats]);
  const vendorName = (id: string | null, fallback: string) => (vendors ?? []).find((v) => v.id === id)?.name ?? fallback;

  const filtered = useMemo(() => {
    const [a, b] = periodRange(period, from, to);
    // Choosing a parent category includes its sub-categories.
    const catIds = cat ? new Set([cat, ...(cats ?? []).filter((c) => c.parent_id === cat).map((c) => c.id)]) : null;
    const needle = q.trim().toLowerCase();
    return (expenses ?? []).filter(
      (e) =>
        e.spent_on >= a &&
        e.spent_on <= b &&
        (!catIds || (e.category_id !== null && catIds.has(e.category_id))) &&
        (!vendor || (vendor === "none" ? !e.vendor_id : e.vendor_id === vendor)) &&
        (!needle || [e.note, e.paid_to, e.category].join(" ").toLowerCase().includes(needle)),
    );
  }, [expenses, cats, period, from, to, cat, vendor, q]);

  const total = filtered.reduce((a, e) => a + Number(e.amount), 0);

  const byCategory = useMemo(() => {
    const sum = (ids: (string | null)[]) => filtered.filter((e) => ids.includes(e.category_id)).reduce((a, e) => a + Number(e.amount), 0);
    const rows = tree
      .map((c) => ({
        id: c.id,
        name: c.name,
        total: sum([c.id, ...c.children.map((x) => x.id)]),
        children: c.children.map((x) => ({ id: x.id, name: x.name, total: sum([x.id]) })).filter((x) => x.total > 0),
      }))
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total);
    const known = new Set((cats ?? []).map((c) => c.id));
    const other = filtered.filter((e) => !e.category_id || !known.has(e.category_id)).reduce((a, e) => a + Number(e.amount), 0);
    if (other > 0) rows.push({ id: "", name: "Uncategorised", total: other, children: [] });
    return rows;
  }, [filtered, tree, cats]);

  const byVendor = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of filtered) {
      const k = vendorName(e.vendor_id, e.paid_to) || "No vendor";
      m.set(k, (m.get(k) ?? 0) + Number(e.amount));
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, vendors]);

  if (me && !admin) return <p className="empty">Purchase is visible to owners and admins.</p>;
  const bar = (v: number) => ({ width: `${total ? Math.max((v / total) * 100, 1.5) : 0}%` });
  const pct = (v: number) => (total ? `${Math.round((v / total) * 100)}%` : "");

  return (
    <>
      <div className="page-head">
        <h1>Purchase</h1>
        <p>Record what was bought or spent, on what and from whom — then see where the money went.</p>
      </div>

      {me && <ExpenseForm me={me} />}

      <div className="panel">
        <h3>Where the money went</h3>
        <div className="grid filters">
          <label className="field">
            <span>Period</span>
            <select value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
              {PERIODS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          {period === "custom" && (
            <>
              <label className="field">
                <span>From</span>
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </label>
              <label className="field">
                <span>To</span>
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </label>
            </>
          )}
          <label className="field">
            <span>Category</span>
            <select value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="">All categories</option>
              {tree.map((c) => [
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.children.length ? " (all)" : ""}
                </option>,
                ...c.children.map((x) => (
                  <option key={x.id} value={x.id}>
                    {"  › "}
                    {x.name}
                  </option>
                )),
              ])}
            </select>
          </label>
          <label className="field">
            <span>Vendor</span>
            <select value={vendor} onChange={(e) => setVendor(e.target.value)}>
              <option value="">All vendors</option>
              {(vendors ?? []).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
              <option value="none">No vendor</option>
            </select>
          </label>
          <label className="field">
            <span>Search notes</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. October" />
          </label>
        </div>

        <div className="spend-total">
          <div>
            <span>Total spent</span>
            <b>{expenses ? money(total) : "…"}</b>
          </div>
          <div>
            <span>Entries</span>
            <b>{filtered.length}</b>
          </div>
          <button className="btn ghost small" disabled={!filtered.length} onClick={() => downloadExpensesCsv(filtered, cats, vendors, period)}>
            Download CSV
          </button>
        </div>

        {filtered.length > 0 && (
          <div className="spend-grid">
            <div>
              <h4>By category</h4>
              {byCategory.map((r) => (
                <div key={r.id || "none"} className="spend-row">
                  <button className="spend-label" onClick={() => r.id && setCat(r.id)} title="Filter by this category">
                    {r.name}
                  </button>
                  <span className="spend-amt">
                    {money(r.total)} <small>{pct(r.total)}</small>
                  </span>
                  <span className="spend-bar">
                    <i style={bar(r.total)} />
                  </span>
                  {r.children.map((x) => (
                    <span key={x.id} className="spend-child">
                      <button className="spend-label" onClick={() => setCat(x.id)}>
                        › {x.name}
                      </button>
                      <span>{money(x.total)}</span>
                    </span>
                  ))}
                </div>
              ))}
            </div>
            <div>
              <h4>By vendor</h4>
              {byVendor.map(([name, v]) => (
                <div key={name} className="spend-row">
                  <span className="spend-label">{name}</span>
                  <span className="spend-amt">
                    {money(v)} <small>{pct(v)}</small>
                  </span>
                  <span className="spend-bar">
                    <i style={bar(v)} />
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="panel" style={{ padding: 0 }}>
        {!expenses ? (
          <p className="hint" style={{ padding: 18 }}>
            Loading…
          </p>
        ) : !filtered.length ? (
          <p className="hint" style={{ padding: 18 }}>
            {expenses.length ? "No expenses match these filters." : "No expenses logged yet."}
          </p>
        ) : (
          <div className="scroll-x">
            <table className="t stack">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Vendor</th>
                  <th>Note</th>
                  <th className="n">Amount</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.id}>
                    <td className="stack-title" style={{ whiteSpace: "nowrap" }}>
                      {shortDate(e.spent_on)}
                    </td>
                    <td data-label="Category">{categoryLabel(cats, e.category_id, e.category)}</td>
                    <td data-label="Vendor">{vendorName(e.vendor_id, e.paid_to)}</td>
                    <td className="hint" data-label="Note">
                      {e.note}
                    </td>
                    <td className="n" data-label="Amount">
                      {money(Number(e.amount))}
                    </td>
                    <td className="stack-actions">
                      <button className="link" onClick={() => confirm("Delete this expense?") && deleteExpense(e.id)}>
                        Delete
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

function ExpenseForm({ me }: { me: Profile }) {
  const { data: cats } = useExpenseCategories();
  const { data: vendors } = useVendors();
  const tree = useMemo(() => categoryTree(cats), [cats]);
  const [vendorId, setVendorId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; message?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const vendor = (vendors ?? []).find((v) => v.id === vendorId);

  // Picking a vendor fills in that vendor's usual expense category.
  const pickVendor = (id: string) => {
    if (id === "__new") return setAdding(true);
    setVendorId(id);
    const v = (vendors ?? []).find((x) => x.id === id);
    if (v?.default_category_id) setCategoryId(v.default_category_id);
  };

  return (
    <div className="panel">
      <h3>Add an expense</h3>
      <form
        ref={formRef}
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const v = (k: string) => String(f.get(k) ?? "").trim();
          setBusy(true);
          const r = await addExpense(me, cats ?? [], vendors ?? [], {
            amount: v("amount"),
            category_id: categoryId,
            vendor: "",
            vendor_id: vendorId || undefined,
            spent_on: v("spent_on"),
            note: v("note"),
          });
          setBusy(false);
          setMsg(r);
          if (r.ok) {
            formRef.current?.reset();
            setVendorId("");
            setCategoryId("");
          }
        }}
      >
        <div className="grid">
          <label className="field">
            <span>Amount ₹</span>
            <input name="amount" inputMode="decimal" required />
          </label>
          <label className="field">
            <span>Vendor</span>
            <select value={vendorId} onChange={(e) => pickVendor(e.target.value)}>
              <option value="">No vendor</option>
              {(vendors ?? []).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                  {v.vendor_type ? ` — ${v.vendor_type}` : ""}
                </option>
              ))}
              <option value="__new">+ Add a new vendor…</option>
            </select>
          </label>
          <label className="field">
            <span>Category</span>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
              <option value="" disabled>
                Choose…
              </option>
              {tree.map((c) =>
                c.children.length ? (
                  <optgroup key={c.id} label={c.name}>
                    {c.children.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                    <option value={c.id}>{c.name} — other</option>
                  </optgroup>
                ) : (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ),
              )}
            </select>
          </label>
          <label className="field">
            <span>Date</span>
            <input name="spent_on" type="date" defaultValue={todayIST()} />
          </label>
          <label className="field full">
            <span>Note</span>
            <input name="note" />
          </label>
        </div>
        {vendor?.default_category_id && categoryId === vendor.default_category_id && (
          <p className="hint">Category filled in from {vendor.name}&apos;s default. You can change it for this expense.</p>
        )}
        {msg && <p className={msg.ok ? "success" : "error"}>{msg.message}</p>}
        <div className="form-actions" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <span className="hint">
            Manage{" "}
            <Link className="link" href="/masters?m=categories">
              categories
            </Link>{" "}
            and{" "}
            <Link className="link" href="/masters?m=vendors">
              vendors
            </Link>{" "}
            in Masters.
          </span>
          <button className="btn primary" disabled={busy}>
            {busy ? "Saving…" : "Add expense"}
          </button>
        </div>
      </form>

      {adding && (
        <form
          className="quick-add"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const v = (k: string) => String(f.get(k) ?? "").trim();
            const r = await saveVendor({ name: v("name"), phone: v("phone"), vendor_type: v("vendor_type"), default_category_id: v("default_category_id") || null });
            if (!r.ok || !r.id) return setMsg({ ok: false, message: r.message ?? "Couldn't add the vendor" });
            setAdding(false);
            setVendorId(r.id);
            if (v("default_category_id")) setCategoryId(v("default_category_id"));
            setMsg({ ok: true, message: `${v("name")} added to vendors` });
          }}
        >
          <h3>New vendor</h3>
          <div className="grid">
            <label className="field">
              <span>Name</span>
              <input name="name" required autoFocus />
            </label>
            <VendorLinkFields />
            <label className="field">
              <span>Phone</span>
              <input name="phone" type="tel" />
            </label>
          </div>
          <div className="form-actions">
            <button type="button" className="btn ghost" onClick={() => setAdding(false)}>
              Cancel
            </button>
            <button className="btn primary">Add vendor</button>
          </div>
        </form>
      )}
    </div>
  );
}
