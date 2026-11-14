"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { money } from "@/lib/format";
import { useCan } from "@/lib/perms";
import { summarize, useExpenses, useIssues, useMe, useOrders } from "@/lib/store";

/** Sub-navigation + key numbers for the Sales header. */
export default function SalesNav() {
  const path = usePathname();
  const { data: me } = useMe();
  const { can } = useCan();
  const admin = can("purchase");
  const { data: orders } = useOrders();
  const { data: expenses } = useExpenses(admin);
  const { data: issues } = useIssues();
  const s = summarize(orders, expenses);
  const openIssues = (issues ?? []).filter((i) => i.status !== "resolved").length;
  const all = (orders ?? []).filter((o) => !o.is_internal).length;
  const dash = (v: string | number) => (orders ? v : "…");

  return (
    <>
      <section className="stats" aria-label="Summary">
        {can("see_sales_total") && (
          <div className="stat">
            <div className="label">Sales</div>
            <div className="value">{dash(money(s.sales))}</div>
          </div>
        )}
        <div className="stat">
          <div className="label">Not dispatched</div>
          <div className="value accent">{dash(s.notDispatched)}</div>
        </div>
        <div className="stat">
          <div className="label">Express due</div>
          <div className="value">{dash(s.expressDue)}</div>
        </div>
        <Link href={can("sales_disputes") ? "/disputes" : "#"} className="stat" style={{ textDecoration: "none" }}>
          <div className="label">Open disputes</div>
          <div className="value">{issues ? openIssues : "…"}</div>
        </Link>
      </section>
      {can("sales_all") && can("edit_orders") && path !== "/orders/new" && (
        <div className="subnav-row actions-only">
          <Link href="/orders/new" className="btn primary small">
            + Add entry
          </Link>
        </div>
      )}
    </>
  );
}
