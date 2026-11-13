"use client";

import SalesNav from "@/components/SalesNav";
import { useMemo, useState } from "react";
import OrderList from "@/components/OrderList";
import { isOpen, useOrders } from "@/lib/store";

export default function InternationalPage() {
  const { data } = useOrders();
  const [all, setAll] = useState(false);
  const list = useMemo(
    () => (data ?? []).filter((o) => !o.is_internal && o.is_international && (all || isOpen(o))),
    [data, all],
  );
  return (
    <>
      <SalesNav />
      <p style={{ margin: "0 0 10px" }}>
        <a className="link" href="/orders">
          ← All Sales
        </a>
      </p>
      <nav className="chips">
        <button className="chip" aria-current={!all ? "true" : undefined} onClick={() => setAll(false)}>
          <b>In progress</b>
        </button>
        <button className="chip" aria-current={all ? "true" : undefined} onClick={() => setAll(true)}>
          <b>All international</b>
        </button>
      </nav>
      {data ? <OrderList orders={list} /> : <p className="empty">Loading…</p>}
    </>
  );
}
