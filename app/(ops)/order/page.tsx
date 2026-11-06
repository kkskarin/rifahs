"use client";

import SalesNav from "@/components/SalesNav";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import OrderForm from "@/components/OrderForm";
import { DispatchForm } from "@/components/OrderList";
import { dateTime, itemsLine, money } from "@/lib/format";
import { isAdmin } from "@/lib/roles";
import { addNote, deleteOrder, useIssues, useMe, useOrderEvents, useOrders, useTeam } from "@/lib/store";
import { OPEN_STATUSES, STATUS_LABEL } from "@/lib/types";

const SHOP_ADMIN = "https://admin.shopify.com/store/xd1uww-uu";

export default function OrderPage() {
  const id = useSearchParams().get("id");
  const router = useRouter();
  const { data: me } = useMe();
  const { data: orders } = useOrders();
  const { data: events } = useOrderEvents(id);
  const { data: issues } = useIssues();
  const { data: people } = useTeam(true);
  const [note, setNote] = useState("");

  const o = orders?.find((x) => x.id === id);
  if (!orders) return <p className="empty">Loading…</p>;
  if (!o)
    return (
      <p className="empty">
        Order not found. <Link href="/orders">Back to orders</Link>
      </p>
    );

  const who = new Map((people ?? []).map((p) => [p.id, p.full_name || p.email.split("@")[0]]));
  const open = OPEN_STATUSES.includes(o.status);
  const addr = o.ship_address as Record<string, string | null> | null;
  const orderIssues = (issues ?? []).filter((i) => i.order?.id === o.id);

  return (
    <>
      <SalesNav />
      <p style={{ marginTop: 0 }}>
        <Link href="/orders" className="link">
          ← Back to orders
        </Link>
      </p>

      <div className="panel">
        <div className="row1" style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
          <div>
            <span style={{ fontSize: 22, fontFamily: "var(--serif)" }}>{o.customer_name}</span>
            {o.order_number && <span className="num"> {o.order_number}</span>}
          </div>
          <span className="amt" style={{ fontFamily: "var(--serif)", fontSize: 20 }}>
            {money(o.total, o.currency)}
          </span>
        </div>
        <div className="card" style={{ boxShadow: "none", border: 0, padding: 0, background: "transparent" }}>
          <div className="row2">
            <span className={`pill ${o.status}`}>{STATUS_LABEL[o.status]}</span>
            {o.is_internal && <span className="flag late">Internal / test — not counted</span>}
            <span className="items">{itemsLine(o.items)}</span>
            {o.source && <span className="meta">{o.source}</span>}
            <span className="meta">Placed {dateTime(o.placed_at)}</span>
            {o.financial_status && <span className="meta">Payment: {o.financial_status.replace(/_/g, " ")}</span>}
          </div>
        </div>
        {(addr || o.ship_city) && (
          <p className="hint" style={{ marginBottom: 0 }}>
            Ship to:{" "}
            {addr
              ? [addr.address1, addr.address2, addr.city, addr.province, addr.zip, addr.country].filter(Boolean).join(", ")
              : o.ship_city}
            {o.customer_phone ? ` · ${o.customer_phone}` : ""}
          </p>
        )}
        {o.shopify_id && (
          <p style={{ marginBottom: 0 }}>
            <a className="link" href={`${SHOP_ADMIN}/orders/${o.shopify_id}`} target="_blank" rel="noreferrer">
              Open in Shopify ↗
            </a>
          </p>
        )}
        {open && (
          <>
            <h3 style={{ marginTop: 20, marginBottom: 0 }}>Dispatch</h3>
            <DispatchForm o={o} />
          </>
        )}
      </div>

      <OrderForm key={o.updated_at} order={o} />

      <div className="panel">
        <h3>Activity</h3>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!me) return;
            const r = await addNote(me, o.id, note);
            if (r.ok) setNote("");
          }}
          style={{ display: "flex", gap: 10, marginBottom: 16 }}
        >
          <label className="field" style={{ flex: 1 }}>
            <span className="sr-only">Note</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note — e.g. customer asked to change size to M" />
          </label>
          <button className="btn small">Add</button>
        </form>
        {orderIssues.length ? (
          <p className="hint">
            Issues:{" "}
            {orderIssues.map((i) => (
              <Link key={i.id} className="link" href="/issues" style={{ marginRight: 10 }}>
                {i.title} ({i.status})
              </Link>
            ))}
          </p>
        ) : null}
        <ul className="timeline">
          {(events ?? []).map((e) => (
            <li key={e.id}>
              <time>
                {dateTime(e.created_at)} ·{" "}
                {e.actor ? who.get(e.actor) ?? "Team" : e.kind === "shopify_sync" ? "Shopify" : e.kind === "import" ? "Import" : "System"}
              </time>
              {e.to_status && e.from_status !== e.to_status && e.kind !== "note" && (
                <>
                  {e.from_status ? `${STATUS_LABEL[e.from_status]} → ` : ""}
                  <b>{STATUS_LABEL[e.to_status]}</b>
                  {e.message ? " · " : ""}
                </>
              )}
              {e.message}
            </li>
          ))}
        </ul>
      </div>

      {me && isAdmin(me) && (
        <div style={{ textAlign: "right" }}>
          <button
            className="btn small danger"
            onClick={async () => {
              if (!confirm("Delete this entry from the order book? This doesn't touch Shopify.")) return;
              await deleteOrder(o.id);
              router.replace("/orders");
            }}
          >
            Delete entry
          </button>
        </div>
      )}
    </>
  );
}
