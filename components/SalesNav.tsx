"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { money } from "@/lib/format";
import { isAdmin } from "@/lib/roles";
import { summarize, useExpenses, useIssues, useMe, useOrders } from "@/lib/store";

/** Sub-navigation + key numbers for the Sales header. */
export default function SalesNav() {
  const path = usePathname();
  const { data: me } = useMe();
  const admin = me ? isAdmin(me) : false;
  const { data: orders } = useOrders();
  const { data: expenses } = useExpenses(admin);
  const { data: issues } = useIssues();
  const s = summarize(orders, expenses);
  const openIssues = (issues ?? []).filter((i) => i.status !== "resolved").length;
  const all = (orders ?? []).filter((o) => !o.is_internal).length;
  const dash = (v: string | number) => (orders ? v : "…");

  const SALES_PATHS = ["/orders", "/order", "/orders/new", "/express", "/international", "/stitching"];
  const tabs: { href: string; label: string; n?: number; hot?: boolean; on: boolean }[] = [
    { href: "/orders", label: "All Sales", n: all, on: SALES_PATHS.includes(path) },
    { href: "/status", label: "Order Status", on: path === "/status" },
    { href: "/disputes", label: "Disputes", n: openIssues, hot: openIssues > 0, on: path === "/disputes" },
  ];

  return (
    <>
      <section className="stats" aria-label="Summary">
        {admin && (
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
        <Link href="/disputes" className="stat" style={{ textDecoration: "none" }}>
          <div className="label">Open disputes</div>
          <div className="value">{issues ? openIssues : "…"}</div>
        </Link>
      </section>
      <div className="subnav-row">
        <nav className="tabs" aria-label="Sales">
          {tabs.map((t) => (
            <Link key={t.href} href={t.href} className="tab" aria-current={t.on ? "page" : undefined}>
              {t.label}
              {t.n ? <span className={`n${t.hot ? " hot" : ""}`}>{t.n}</span> : null}
            </Link>
          ))}
        </nav>
        <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link href="/stitching" className="btn ghost small" aria-current={path === "/stitching" ? "page" : undefined}>
            Stitching queue
          </Link>
          <Link href="/orders/new" className="btn primary small">
            + Add entry
          </Link>
        </span>
      </div>
    </>
  );
}
