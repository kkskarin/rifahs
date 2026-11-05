"use client";

import Link from "next/link";
import { useState, useTransition, useActionState } from "react";
import { advanceOrder, bulkSetStatus, dispatchOrder, type ActionResult } from "@/app/(ops)/actions";
import { daysUntil, itemsLine, money, shortDate } from "@/lib/format";
import { COURIERS, STATUSES, STATUS_LABEL, nextStatus, type Order, type OrderStatus } from "@/lib/types";

export default function OrderList({ orders, shopifyReady }: { orders: Order[]; shopifyReady: boolean }) {
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkTo, setBulkTo] = useState<OrderStatus | "next">("next");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  if (!orders.length) return <p className="empty">Nothing here — all caught up.</p>;

  return (
    <>
      <div className="toolbar" style={{ justifyContent: "flex-end", marginTop: -4 }}>
        <button
          className="btn small ghost"
          onClick={() => {
            setSelecting(!selecting);
            setSelected(new Set());
          }}
        >
          {selecting ? "Done" : "Select"}
        </button>
      </div>

      <div className="list">
        {orders.map((o) => (
          <OrderCard
            key={o.id}
            o={o}
            selecting={selecting}
            selected={selected.has(o.id)}
            onToggle={() => toggle(o.id)}
            shopifyReady={shopifyReady}
          />
        ))}
      </div>

      {selecting && (
        <div className="bulkbar">
          <span>{selected.size} selected</span>
          <button className="btn small" onClick={() => setSelected(new Set(orders.map((o) => o.id)))}>
            All
          </button>
          <select value={bulkTo} onChange={(e) => setBulkTo(e.target.value as OrderStatus | "next")} aria-label="Move to">
            <option value="next">Next step →</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <button
            className="btn small"
            disabled={pending || !selected.size}
            onClick={() =>
              start(async () => {
                const r = await bulkSetStatus([...selected], bulkTo);
                setMsg(r.message ?? null);
                setSelected(new Set());
              })
            }
          >
            {pending ? "Saving…" : "Apply"}
          </button>
          {msg && <span style={{ opacity: 0.8 }}>{msg}</span>}
        </div>
      )}
    </>
  );
}

function OrderCard({
  o,
  selecting,
  selected,
  onToggle,
  shopifyReady,
}: {
  o: Order;
  selecting: boolean;
  selected: boolean;
  onToggle: () => void;
  shopifyReady: boolean;
}) {
  const [pending, start] = useTransition();
  const [dispatching, setDispatching] = useState(false);
  const next = nextStatus(o.status);
  const due = daysUntil(o.promise_date);
  const open = ["new", "printing", "stitching", "checking", "ready"].includes(o.status);

  return (
    <article className={`card${selected ? " selected" : ""}`} onClick={selecting ? onToggle : undefined}>
      {selecting && <input type="checkbox" className="check" checked={selected} onChange={onToggle} aria-label="Select" />}
      <div className="row1">
        <div>
          <span className="name">{o.customer_name}</span>
          {o.order_number && <span className="num">{o.order_number}</span>}
        </div>
        <span className="amt">{money(o.total, o.currency)}</span>
      </div>
      <div className="row2">
        <span className={`pill ${o.status}`}>{STATUS_LABEL[o.status]}</span>
        {o.is_express && <span className="flag express">Express</span>}
        {o.is_international && <span className="flag intl">International{o.ship_country ? ` · ${o.ship_country}` : ""}</span>}
        {o.is_express && open && due !== null && (
          <span className={`flag ${due < 0 ? "late" : "express"}`}>
            {due < 0 ? `${-due}d late` : due === 0 ? "Due today" : `Due ${shortDate(o.promise_date)}`}
          </span>
        )}
        <span className="items">{itemsLine(o.items)}</span>
        {o.source && <span className="meta">{o.source}</span>}
        <span className="meta">{o.channel}</span>
        <span className="meta">{shortDate(o.placed_at)}</span>
      </div>
      {o.notes && <div className="note">{o.notes}</div>}
      {(o.status === "dispatched" || o.status === "delivered") && o.tracking_number && (
        <div className="row2">
          <span className="meta">
            {o.courier} ·{" "}
            {o.tracking_url ? (
              <a href={o.tracking_url} target="_blank" rel="noreferrer">
                {o.tracking_number}
              </a>
            ) : (
              o.tracking_number
            )}
          </span>
        </div>
      )}
      {!selecting && (
        <div className="actions">
          {next && next !== "dispatched" && (
            <button className="advance" disabled={pending} onClick={() => start(() => advanceOrder(o.id).then(() => undefined))}>
              {pending ? "Saving…" : `Mark ${STATUS_LABEL[next]} →`}
            </button>
          )}
          {next === "dispatched" && !dispatching && (
            <button className="advance" onClick={() => setDispatching(true)}>
              Mark Dispatched →
            </button>
          )}
          {o.status === "new" && (
            <button className="link" onClick={() => setDispatching((d) => !d)} title="Ready-made piece, ship straight away">
              Ship now
            </button>
          )}
          <Link href={`/orders/${o.id}`} className="link">
            Edit
          </Link>
        </div>
      )}
      {dispatching && <DispatchForm o={o} shopifyReady={shopifyReady} onClose={() => setDispatching(false)} />}
    </article>
  );
}

export function DispatchForm({ o, shopifyReady, onClose }: { o: Order; shopifyReady: boolean; onClose?: () => void }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(dispatchOrder, null);
  const canShopify = shopifyReady && Boolean(o.shopify_id) && !o.shopify_fulfilled;
  return (
    <form action={action} style={{ marginTop: 14, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
      <input type="hidden" name="id" value={o.id} />
      <div className="grid">
        <label className="field">
          <span>Courier</span>
          <input name="courier" list="couriers" defaultValue={o.courier ?? ""} placeholder="Delhivery" />
        </label>
        <label className="field">
          <span>AWB / tracking no.</span>
          <input name="tracking_number" defaultValue={o.tracking_number ?? ""} />
        </label>
        <label className="field">
          <span>Tracking link (optional)</span>
          <input name="tracking_url" type="url" defaultValue={o.tracking_url ?? ""} />
        </label>
      </div>
      <datalist id="couriers">
        {COURIERS.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      {canShopify && (
        <div style={{ display: "grid", gap: 6, marginTop: 12 }}>
          <label className="checkbox">
            <input type="checkbox" name="shopify" defaultChecked /> Mark fulfilled in Shopify too
          </label>
          <label className="checkbox">
            <input type="checkbox" name="notify" defaultChecked /> Send the customer Shopify&apos;s shipping email
          </label>
        </div>
      )}
      {state && <p className={state.ok ? "success" : "error"}>{state.message}</p>}
      <div className="form-actions">
        {onClose && (
          <button type="button" className="btn small ghost" onClick={onClose}>
            Cancel
          </button>
        )}
        <button className="btn small primary" disabled={pending}>
          {pending ? "Saving…" : "Dispatch"}
        </button>
      </div>
    </form>
  );
}
