"use client";

import SalesNav from "@/components/SalesNav";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import OrderList from "@/components/OrderList";
import SearchBox from "@/components/SearchBox";
import { downloadOrdersCsv } from "@/lib/csv";
import { DUE_LEVELS, dueInfo, saveDueRules, useDueRules, type DueLevel } from "@/lib/due";
import { itemsLine, money, shortDate } from "@/lib/format";
import { isAdmin } from "@/lib/roles";
import { matches } from "@/lib/search";
import { isOpen, setStatus, useMe, useOrders } from "@/lib/store";
import { OPEN_STATUSES, STATUSES, STATUS_LABEL, nextStatus, type Order, type OrderStatus } from "@/lib/types";

type Filter = "open" | "all" | "internal" | OrderStatus;
type Sort = "due" | "newest" | "oldest" | "amount" | "customer" | "status";
type View = { sort: Sort; layout: "cards" | "table"; notes: boolean; due: DueLevel | "" };
const SORTS: { key: Sort; label: string }[] = [
  { key: "due", label: "Due soonest" },
  { key: "newest", label: "Newest order first" },
  { key: "oldest", label: "Oldest order first" },
  { key: "amount", label: "Amount, high to low" },
  { key: "customer", label: "Customer A–Z" },
  { key: "status", label: "Status" },
];
const DEFAULT_VIEW: View = { sort: "due", layout: "cards", notes: true, due: "" };

export default function OrdersPage() {
  const sp = useSearchParams();
  const f = (sp.get("f") ?? "open") as Filter;
  const q = sp.get("q") ?? "";
  const { data: all, error } = useOrders();
  const { data: me } = useMe();
  const rules = useDueRules();
  const [view, setViewState] = useState<View>(DEFAULT_VIEW);
  const [showRules, setShowRules] = useState(false);

  // Remember each person's view on their own device.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("orders-view") ?? "null");
      if (saved) setViewState({ ...DEFAULT_VIEW, ...saved });
    } catch {}
  }, []);
  const setView = (patch: Partial<View>) =>
    setViewState((v) => {
      const next = { ...v, ...patch };
      try {
        localStorage.setItem("orders-view", JSON.stringify(next));
      } catch {}
      return next;
    });

  const { list, chips, dueCounts } = useMemo(() => {
    const orders = all ?? [];
    const real = orders.filter((o) => !o.is_internal);
    const count = (s: OrderStatus) => real.filter((o) => o.status === s).length;
    const internal = orders.length - real.length;
    const chips: { f: Filter; label: string; n: number }[] = [
      { f: "open", label: "Not dispatched", n: real.filter(isOpen).length },
      { f: "all", label: "All", n: real.length },
      ...STATUSES.filter((s) => count(s) > 0).map((s) => ({ f: s as Filter, label: STATUS_LABEL[s], n: count(s) })),
      ...(internal ? [{ f: "internal" as Filter, label: "Internal / test", n: internal }] : []),
    ];
    let base =
      f === "internal" ? orders.filter((o) => o.is_internal) : f === "open" ? real.filter(isOpen) : f === "all" ? real : real.filter((o) => o.status === f);
    base = base.filter((o) => matches(o, q));
    const due = new Map(base.map((o) => [o.id, dueInfo(o, rules)]));
    const openOnes = base.filter((o) => OPEN_STATUSES.includes(o.status));
    const dueCounts = Object.fromEntries(DUE_LEVELS.map((l) => [l.key, openOnes.filter((o) => due.get(o.id)!.level === l.key).length])) as Record<DueLevel, number>;
    if (view.due) base = base.filter((o) => OPEN_STATUSES.includes(o.status) && due.get(o.id)!.level === view.due);
    const openFirst = (o: Order) => (OPEN_STATUSES.includes(o.status) ? 0 : 1);
    const sorters: Record<Sort, (a: Order, b: Order) => number> = {
      due: (a, b) => openFirst(a) - openFirst(b) || (openFirst(a) ? b.placed_at.localeCompare(a.placed_at) : due.get(a.id)!.days - due.get(b.id)!.days),
      newest: (a, b) => b.placed_at.localeCompare(a.placed_at),
      oldest: (a, b) => a.placed_at.localeCompare(b.placed_at),
      amount: (a, b) => Number(b.total ?? 0) - Number(a.total ?? 0),
      customer: (a, b) => a.customer_name.localeCompare(b.customer_name),
      status: (a, b) => STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status) || due.get(a.id)!.days - due.get(b.id)!.days,
    };
    return { list: [...base].sort(sorters[view.sort]), chips, dueCounts };
  }, [all, f, q, view.sort, view.due, rules]);

  const href = (nf: Filter) => `/orders?${new URLSearchParams({ f: nf, ...(q ? { q } : {}) })}`;

  return (
    <>
      <SalesNav />
      <div className="toolbar">
        <SearchBox />
        <button className="btn ghost" onClick={() => downloadOrdersCsv(list, f)} disabled={!all}>
          Download CSV
        </button>
      </div>
      <nav className="chips" aria-label="Filter by status">
        {chips.map((c) => (
          <Link key={c.f} className="chip" aria-current={c.f === f ? "true" : undefined} href={href(c.f)} scroll={false} replace>
            <b>{c.label}</b> {c.n}
          </Link>
        ))}
      </nav>

      <div className="view-bar">
        <label className="field">
          <span>Sort by</span>
          <select value={view.sort} onChange={(e) => setView({ sort: e.target.value as Sort })}>
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Due</span>
          <select value={view.due} onChange={(e) => setView({ due: e.target.value as DueLevel | "" })}>
            <option value="">Any due date</option>
            {DUE_LEVELS.map((l) => (
              <option key={l.key} value={l.key}>
                {l.label} ({dueCounts[l.key] ?? 0})
              </option>
            ))}
          </select>
        </label>
        <div className="seg" role="group" aria-label="Layout">
          <button aria-pressed={view.layout === "cards"} onClick={() => setView({ layout: "cards" })}>
            Cards
          </button>
          <button aria-pressed={view.layout === "table"} onClick={() => setView({ layout: "table" })}>
            Table
          </button>
        </div>
        {view.layout === "cards" && (
          <label className="checkbox">
            <input type="checkbox" checked={view.notes} onChange={(e) => setView({ notes: e.target.checked })} /> Show notes
          </label>
        )}
        {me && isAdmin(me) && (
          <button className="link" onClick={() => setShowRules((s) => !s)}>
            Due-date rules
          </button>
        )}
      </div>
      {showRules && me && <RulesForm userId={me.id} onDone={() => setShowRules(false)} />}

      {error ? <p className="error">Couldn&apos;t load orders: {String(error.message ?? error)}</p> : null}
      {!all ? <p className="empty">Loading orders…</p> : view.layout === "table" ? <OrderTable orders={list} /> : <OrderList orders={list} showNotes={view.notes} />}
    </>
  );
}

function RulesForm({ userId, onDone }: { userId: string; onDone: () => void }) {
  const rules = useDueRules();
  const [err, setErr] = useState<string | null>(null);
  return (
    <form
      className="panel"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const n = (k: string, d: number) => Math.max(Number(f.get(k)) || d, 0);
        const r = await saveDueRules(
          { standard_days: n("standard_days", 21), express_days: n("express_days", 7), unstitched_days: n("unstitched_days", 5) },
          userId,
        );
        if (r.ok) onDone();
        else setErr(r.message ?? "Couldn't save");
      }}
    >
      <h3>Due-date rules</h3>
      <p className="hint" style={{ marginTop: -6 }}>
        An order is due on its promise date if one is set. Otherwise it is due this many days after the order date.
      </p>
      <div className="grid">
        <label className="field">
          <span>Stitched orders (days)</span>
          <input name="standard_days" type="number" min={0} defaultValue={rules.standard_days} />
        </label>
        <label className="field">
          <span>Express orders (days)</span>
          <input name="express_days" type="number" min={0} defaultValue={rules.express_days} />
        </label>
        <label className="field">
          <span>Unstitched-only orders (days)</span>
          <input name="unstitched_days" type="number" min={0} defaultValue={rules.unstitched_days} />
        </label>
      </div>
      <p className="hint">
        Colours: <span className="due due-green">more than 10 days</span> <span className="due due-yellow">6–10 days — be ready</span>{" "}
        <span className="due due-red">today to 5 days</span> <span className="due due-overdue">overdue</span>
      </p>
      {err && <p className="error">{err}</p>}
      <div className="form-actions">
        <button type="button" className="btn ghost" onClick={onDone}>
          Cancel
        </button>
        <button className="btn primary">Save</button>
      </div>
    </form>
  );
}

function OrderTable({ orders }: { orders: Order[] }) {
  const rules = useDueRules();
  const { data: me } = useMe();
  const [limit, setLimit] = useState(150);
  if (!orders.length) return <p className="empty">Nothing here — all caught up.</p>;
  return (
    <>
      <p className="hint">
        {orders.length} order{orders.length === 1 ? "" : "s"}
      </p>
      <div className="panel" style={{ padding: 0 }}>
        <div className="scroll-x">
          <table className="t stack">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Order</th>
                <th>Items</th>
                <th>Due by</th>
                <th>Status</th>
                <th className="n">Amount</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {orders.slice(0, limit).map((o) => {
                const open = OPEN_STATUSES.includes(o.status);
                const due = dueInfo(o, rules);
                const next = nextStatus(o.status);
                return (
                  <tr key={o.id}>
                    <td className="stack-title">{o.customer_name}</td>
                    <td data-label="Order" style={{ whiteSpace: "nowrap" }}>
                      {o.order_number} <span className="meta">{shortDate(o.placed_at)}</span>
                    </td>
                    <td data-label="Items">{itemsLine(o.items)}</td>
                    <td data-label="Due by">{open ? <span className={`due due-${due.level}`} style={{ marginTop: 0 }}>{due.label}</span> : <span className="meta">—</span>}</td>
                    <td data-label="Status">
                      <span className={`pill ${o.status}`}>{STATUS_LABEL[o.status]}</span>
                    </td>
                    <td className="n" data-label="Amount">
                      {money(o.total, o.currency)}
                    </td>
                    <td className="stack-actions">
                      {me && next && next !== "dispatched" && (
                        <button className="link" onClick={() => setStatus(me, [o], "next")}>
                          → {STATUS_LABEL[next]}
                        </button>
                      )}{" "}
                      <Link className="link" href={`/order?id=${o.id}`}>
                        Open
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {orders.length > limit && (
        <div className="form-actions" style={{ justifyContent: "center" }}>
          <button className="btn ghost" onClick={() => setLimit((l) => l + 200)}>
            Show more ({orders.length - limit} left)
          </button>
        </div>
      )}
    </>
  );
}
