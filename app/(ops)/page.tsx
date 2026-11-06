"use client";

import Link from "next/link";
import { useMemo } from "react";
import { demandByProduct, useProducts } from "@/lib/inventory";
import { money } from "@/lib/format";
import { isAdmin } from "@/lib/roles";
import { countsAsSale, summarize, useExpenses, useIssues, useMe, useOrders } from "@/lib/store";

function greeting() {
  const h = Number(new Date().toLocaleString("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default function Home() {
  const { data: me } = useMe();
  const admin = me ? isAdmin(me) : false;
  const { data: orders } = useOrders();
  const { data: expenses } = useExpenses(admin);
  const { data: issues } = useIssues();
  const { data: products } = useProducts();
  const s = summarize(orders, expenses);
  const { demand } = useMemo(() => demandByProduct(products, orders), [products, orders]);
  const short = (products ?? []).filter((p) => (demand.get(p.id)?.waitingQty ?? 0) > p.in_stock).length;
  const thisMonth = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }).slice(0, 7);
  const monthSales = (orders ?? [])
    .filter((o) => countsAsSale(o) && new Date(o.placed_at).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }).startsWith(thisMonth))
    .reduce((a, o) => a + Number(o.total ?? 0), 0);
  const openIssues = (issues ?? []).filter((i) => i.status !== "resolved").length;
  const d = (v: string | number, ready: unknown) => (ready ? v : "…");

  const tiles = [
    { href: "/orders", title: "Sales", big: d(s.notDispatched, orders), note: "orders not dispatched", sub: `${d(s.expressDue, orders)} express · ${d(openIssues, issues)} open issues` },
    { href: "/purchase", title: "Purchase", big: "—", note: "purchase orders", sub: "Coming next" },
    { href: "/inventory", title: "Inventory", big: d(short, products && orders), note: "designs short on fabric", sub: `${d((products ?? []).reduce((a, p) => a + p.in_stock, 0), products)} fabric sets in stock` },
    { href: "/masters", title: "Masters", big: d((products ?? []).filter((p) => p.active).length, products), note: "designs", sub: "Designs and their other spellings" },
    ...(admin ? [{ href: "/reports", title: "Reports", big: d(money(monthSales), orders), note: "sales this month", sub: `${d(money(s.sales), orders)} all time` }] : []),
  ];

  return (
    <>
      <section className="home-hero">
        <p className="eyebrow">{greeting()}{me?.full_name ? `, ${me.full_name.split(" ")[0]}` : ""}</p>
        <h1>
          Kaleidoscope <em>Core</em>
        </h1>
        <p>Every order, piece of stock and rupee for Kaleidoscope by Rifah — in one place.</p>
      </section>
      <section className="tiles">
        {tiles.map((t) => (
          <Link key={t.href} href={t.href} className="tile">
            <span className="tile-title">{t.title}</span>
            <span className="tile-big">{t.big}</span>
            <span className="tile-note">{t.note}</span>
            <span className="tile-sub">{t.sub}</span>
          </Link>
        ))}
      </section>
    </>
  );
}
