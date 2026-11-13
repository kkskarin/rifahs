"use client";

import Link from "next/link";
import { memo, useState } from "react";
import { mutate } from "swr";
import { fulfilInShopify } from "@/app/(ops)/actions";
import { safe } from "@/lib/safe";
import { dueInfo, useDueRules } from "@/lib/due";
import { itemsLine, money, shortDate } from "@/lib/format";
import { dispatch, setStatus, useMe } from "@/lib/store";
import { useCan } from "@/lib/perms";
import { COURIERS, OPEN_STATUSES, STATUSES, STATUS_LABEL, nextStatus, type Order, type OrderStatus } from "@/lib/types";

export default function OrderList({ orders, showNotes = true }: { orders: Order[]; showNotes?: boolean }) {
  const { data: meRaw } = useMe();
  const { can } = useCan();
  // Without "edit orders" the person can look but the action buttons are not offered.
  const me = can("edit_orders") ? meRaw : undefined;
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkTo, setBulkTo] = useState<OrderStatus | "next">("next");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [limit, setLimit] = useState(60);

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  if (!orders.length) return <p className="empty">Nothing here — all caught up.</p>;
  const shown = orders.slice(0, limit);

  return (
    <>
      <div className="toolbar" style={{ justifyContent: "space-between", marginTop: -4 }}>
        <span className="hint">
          {orders.length} order{orders.length === 1 ? "" : "s"}
        </span>
        {me && (
          <button
            className="btn small ghost"
            onClick={() => {
              setSelecting(!selecting);
              setSelected(new Set());
            }}
          >
            {selecting ? "Done" : "Select"}
          </button>
        )}
      </div>

      <div className="list">
        {shown.map((o) => (
          <OrderCard key={o.id} o={o} selecting={selecting} selected={selected.has(o.id)} onToggle={toggle} showNotes={showNotes} />
        ))}
      </div>
      {orders.length > limit && (
        <div className="form-actions" style={{ justifyContent: "center" }}>
          <button className="btn ghost" onClick={() => setLimit((l) => l + 100)}>
            Show more ({orders.length - limit} left)
          </button>
        </div>
      )}

      {selecting && me && (
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
            disabled={busy || !selected.size}
            onClick={async () => {
              setBusy(true);
              const r = await setStatus(me, orders.filter((o) => selected.has(o.id)), bulkTo);
              setMsg(r.message ?? null);
              setSelected(new Set());
              setBusy(false);
            }}
          >
            {busy ? "Saving…" : "Apply"}
          </button>
          {msg && <span style={{ opacity: 0.8 }}>{msg}</span>}
        </div>
      )}
    </>
  );
}

const OrderCard = memo(function OrderCard({
  o,
  selecting,
  selected,
  onToggle,
  showNotes,
}: {
  o: Order;
  selecting: boolean;
  selected: boolean;
  onToggle: (id: string) => void;
  showNotes: boolean;
}) {
  const { data: meRaw } = useMe();
  const { can } = useCan();
  // Without "edit orders" the person can look but the action buttons are not offered.
  const me = can("edit_orders") ? meRaw : undefined;
  const [dispatching, setDispatching] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const next = nextStatus(o.status);
  const rules = useDueRules();
  const due = dueInfo(o, rules);
  const open = OPEN_STATUSES.includes(o.status);

  return (
    <article className={`card${selected ? " selected" : ""}`} onClick={selecting ? () => onToggle(o.id) : undefined}>
      {selecting && <input type="checkbox" className="check" checked={selected} onChange={() => onToggle(o.id)} aria-label="Select" />}
      <div className="row1">
        <div>
          <span className="name">{o.customer_name}</span>
          {o.order_number && <span className="num">{o.order_number}</span>}
        </div>
        {can("see_amounts") && <span className="amt">{money(o.total, o.currency)}</span>}
      </div>
      {open && (
        <div className={`due due-${due.level}`} title={due.promised ? "Promised date" : "Order date + standard time"}>
          {due.label}
          {due.promised ? " · promised" : ""}
        </div>
      )}
      <div className="row2">
        <span className={`pill ${o.status}`}>{STATUS_LABEL[o.status]}</span>
        {o.is_internal && <span className="flag late">Internal</span>}
        {o.is_exchange && <span className="flag intl">Exchange</span>}
        {o.is_express && <span className="flag express">Express</span>}
        {o.is_international && <span className="flag intl">International{o.ship_country ? ` · ${o.ship_country}` : ""}</span>}
        <span className="items">{itemsLine(o.items)}</span>
        {o.source && <span className="meta">{o.source}</span>}
        <span className="meta">{shortDate(o.placed_at)}</span>
      </div>
      {showNotes && o.notes && <div className="note">{o.notes}</div>}
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
      {!selecting && me && (
        <div className="actions">
          {next && next !== "dispatched" && (
            <button
              className="advance"
              onClick={async () => {
                const r = await setStatus(me, [o], "next");
                setErr(r.ok ? null : (r.message ?? "Couldn't update"));
              }}
            >
              Mark {STATUS_LABEL[next]} →
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
          <Link href={`/order?id=${o.id}`} className="link">
            Edit
          </Link>
          {err && <span className="error">{err}</span>}
        </div>
      )}
      {!me && (
        <div className="actions">
          <Link href={`/order?id=${o.id}`} className="link">
            Open
          </Link>
        </div>
      )}
      {dispatching && <DispatchForm o={o} onClose={() => setDispatching(false)} />}
    </article>
  );
});

export function DispatchForm({ o, onClose }: { o: Order; onClose?: () => void }) {
  const { data: me } = useMe();
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<{ ok: boolean; message?: string } | null>(null);
  const [fulfil, setFulfil] = useState(true);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!me) return;
        const f = new FormData(e.currentTarget);
        const v = (k: string) => String(f.get(k) ?? "").trim() || null;
        setBusy(true);
        const r = await dispatch(me, o, { courier: v("courier"), tracking_number: v("tracking_number"), tracking_url: v("tracking_url") });
        if (r.ok && o.shopify_id && f.get("fulfil") === "on") {
          const s = (await safe(() => fulfilInShopify(o.id, f.get("notify") === "on"))) as { ok: boolean; message?: string };
          mutate("orders");
          mutate(["events", o.id]);
          setBusy(false);
          setState(s);
          if (s.ok) onClose?.();
          return;
        }
        setBusy(false);
        setState(r);
        if (r.ok) onClose?.();
      }}
      style={{ marginTop: 14, borderTop: "1px solid var(--line)", paddingTop: 14 }}
    >
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
      {o.shopify_id && !o.shopify_fulfilled && (
        <div style={{ display: "flex", gap: 22, flexWrap: "wrap", marginTop: 12 }}>
          <label className="checkbox">
            <input type="checkbox" name="fulfil" checked={fulfil} onChange={(e) => setFulfil(e.target.checked)} /> Mark fulfilled in Shopify
          </label>
          <label className="checkbox" style={fulfil ? undefined : { opacity: 0.5 }}>
            <input type="checkbox" name="notify" disabled={!fulfil} /> Email the customer the tracking details
          </label>
        </div>
      )}
      {state && !state.ok && <p className="error">{state.message}</p>}
      <div className="form-actions">
        {onClose && (
          <button type="button" className="btn small ghost" onClick={onClose}>
            Cancel
          </button>
        )}
        <button className="btn small primary" disabled={busy}>
          {busy ? "Saving…" : "Dispatch"}
        </button>
      </div>
    </form>
  );
}
