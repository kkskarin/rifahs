"use client";

import Link from "next/link";
import { Suspense, useEffect } from "react";
import { money } from "@/lib/format";
import { signOutEverywhere, summarize, useExpenses, useIssues, useMe, useOrders } from "@/lib/store";
import { isAdmin } from "@/lib/roles";
import Tabs from "./Tabs";

export default function OpsShell({ children }: { children: React.ReactNode }) {
  const { data: me, isLoading: meLoading } = useMe();
  const admin = me ? isAdmin(me) : false;
  const { data: orders } = useOrders();
  const { data: expenses } = useExpenses(admin);
  const { data: issues } = useIssues();

  useEffect(() => {
    if (!meLoading && me === null) window.location.href = "/login?error=no-access";
    if (me && !me.active) window.location.href = "/login?error=no-access";
  }, [me, meLoading]);

  const s = summarize(orders, expenses);
  const openIssues = (issues ?? []).filter((i) => i.status !== "resolved").length;
  const all = (orders ?? []).filter((o) => !o.is_internal).length;
  const dash = (v: string | number) => (orders ? v : "…");

  const tabs = [
    { href: "/orders", label: "Orders", n: all },
    { href: "/express", label: "Express", n: s.expressDue, hot: s.expressDue > 0 },
    { href: "/international", label: "International", n: s.international },
    { href: "/inventory", label: "Inventory" },
    { href: "/issues", label: "Issues", n: openIssues, hot: openIssues > 0 },
    ...(admin
      ? [
          { href: "/money", label: "Money" },
          { href: "/team", label: "Team" },
          { href: "/settings", label: "Shopify" },
        ]
      : []),
  ];

  const isPreview = typeof window !== "undefined" && window.location.hostname.startsWith("preview--");

  return (
    <div className="wrap">
      {isPreview && (
        <div className="preview-banner">
          Preview version — not live yet. Orders and stock you change here are real (same data as the live app).
        </div>
      )}
      <header className="topbar">
        <Link href="/orders" className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Kaleidoscope by Rifah" />
          <small>Order book</small>
        </Link>
        <div className="who">
          <span>{me ? me.full_name || me.email : ""}</span>
          <button className="link" onClick={signOutEverywhere}>
            Sign out
          </button>
        </div>
      </header>

      <section className="hero">
        <h1>
          Every order, <em>one place.</em>
        </h1>
        <p>Orders, express promises, international parcels, courier issues and money — kept for you and Amma.</p>
      </section>

      <section className="stats" aria-label="Summary">
        {admin ? (
          <>
            <div className="stat">
              <div className="label">Sales</div>
              <div className="value">{dash(money(s.sales))}</div>
            </div>
            <div className="stat">
              <div className="label">Spent</div>
              <div className="value">{expenses ? money(s.spent) : "…"}</div>
            </div>
            <div className="stat">
              <div className="label">Approx. profit</div>
              <div className="value">{expenses && orders ? money(s.profit) : "…"}</div>
            </div>
          </>
        ) : (
          <>
            <div className="stat">
              <div className="label">Express due</div>
              <div className="value">{dash(s.expressDue)}</div>
            </div>
            <div className="stat">
              <div className="label">International</div>
              <div className="value">{dash(s.international)}</div>
            </div>
            <div className="stat">
              <div className="label">Open issues</div>
              <div className="value">{issues ? openIssues : "…"}</div>
            </div>
          </>
        )}
        <div className="stat">
          <div className="label">Not dispatched</div>
          <div className="value accent">{dash(s.notDispatched)}</div>
        </div>
      </section>

      <Tabs tabs={tabs} />
      <Suspense fallback={<p className="empty">Loading…</p>}>{me ? children : <p className="empty">Loading…</p>}</Suspense>

      <Link href="/orders/new" className="btn primary fab">
        + Add entry
      </Link>
    </div>
  );
}
