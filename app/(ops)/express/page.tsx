"use client";

import SalesNav from "@/components/SalesNav";
import { useMemo } from "react";
import OrderList from "@/components/OrderList";
import { isOpen, useOrders } from "@/lib/store";

export default function ExpressPage() {
  const { data } = useOrders();
  const list = useMemo(
    () =>
      (data ?? [])
        .filter((o) => isOpen(o) && o.is_express)
        .sort((a, b) => (a.promise_date ?? "9999").localeCompare(b.promise_date ?? "9999") || a.placed_at.localeCompare(b.placed_at)),
    [data],
  );
  return (
    <>
      <SalesNav />
      <p className="hint" style={{ marginTop: 0 }}>
        Express orders still to ship, soonest promise first. Set the promise date on each order so nothing slips.
      </p>
      {data ? <OrderList orders={list} /> : <p className="empty">Loading…</p>}
    </>
  );
}
