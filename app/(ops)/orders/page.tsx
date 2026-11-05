"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import OrderList from "@/components/OrderList";
import SearchBox from "@/components/SearchBox";
import { downloadOrdersCsv } from "@/lib/csv";
import { matches } from "@/lib/search";
import { isOpen, useOrders } from "@/lib/store";
import { STATUSES, STATUS_LABEL, type OrderStatus } from "@/lib/types";

type Filter = "open" | "all" | "internal" | OrderStatus;

export default function OrdersPage() {
  const sp = useSearchParams();
  const f = (sp.get("f") ?? "open") as Filter;
  const q = sp.get("q") ?? "";
  const { data: all, error } = useOrders();

  const { list, chips } = useMemo(() => {
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
    const base =
      f === "internal" ? orders.filter((o) => o.is_internal) : f === "open" ? real.filter(isOpen) : f === "all" ? real : real.filter((o) => o.status === f);
    return { list: base.filter((o) => matches(o, q)), chips };
  }, [all, f, q]);

  const href = (nf: Filter) => `/orders?${new URLSearchParams({ f: nf, ...(q ? { q } : {}) })}`;

  return (
    <>
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
      {error ? <p className="error">Couldn&apos;t load orders: {String(error.message ?? error)}</p> : null}
      {all ? <OrderList orders={list} /> : <p className="empty">Loading orders…</p>}
    </>
  );
}
