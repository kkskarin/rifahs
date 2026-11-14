"use client";

import Link from "next/link";
import { useState } from "react";
import { shortDate } from "@/lib/format";
import { useProducts } from "@/lib/inventory";
import { useCan } from "@/lib/perms";
import type { QueueGroup } from "@/lib/queue";
import { allocateOnHand, cancelStitchingOrder, createStitchingOrder, receiveStitchLine, sendStitchingOrder, useStitchingOrders, type NewStitchLine, type StitchingOrder } from "@/lib/stitching";
import { useOrders } from "@/lib/store";

const STATUS_TEXT: Record<StitchingOrder["status"], string> = { committed: "Committed to Stitch", sent: "In Stitching", received: "Received", cancelled: "Cancelled" };

/** Create a stitching order from the queue, then send it to the tailor and receive the sets back. */
export default function StitchingOrders({ groups }: { groups: QueueGroup[] }) {
  const { can } = useCan();
  const editable = can("edit_inventory");
  const { data: list } = useStitchingOrders();
  const { data: products } = useProducts();
  const { data: orders } = useOrders();
  const [tailor, setTailor] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; message?: string } | null>(null);
  const run = async (fn: () => Promise<{ ok: boolean; message?: string }>) => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    setMsg(r);
  };

  // Queue lines are one per piece; a stitching order line is one per order item.
  const toStitch = new Map<string, NewStitchLine>();
  let onHand = 0;
  for (const g of groups) {
    for (const l of g.lines) {
      if (l.stage !== "new" || !g.product) continue;
      if (l.action === "ready" || l.action === "send-unstitched") onHand += 1;
      if (l.action !== "stitch") continue;
      const k = `${l.order.id}:${l.itemIndex}`;
      const cur = toStitch.get(k);
      if (cur) cur.qty += 1;
      else toStitch.set(k, { product_id: g.product.id, size: l.size, qty: 1, order_id: l.order.id, item_index: l.itemIndex });
    }
  }
  const lines = [...toStitch.values()];
  const sets = lines.reduce((a, l) => a + l.qty, 0);
  const name = (id: string) => products?.find((p) => p.id === id)?.name ?? "Design";
  const orderOf = (id: string | null) => (id ? orders?.find((o) => o.id === id) : undefined);
  const open = (list ?? []).filter((s) => s.status === "committed" || s.status === "sent");
  const done = (list ?? []).filter((s) => s.status === "received" || s.status === "cancelled").slice(0, 5);

  return (
    <div className="panel">
      <h3>Stitching orders</h3>
      <p className="hint" style={{ marginTop: -6 }}>
        A stitching order commits fabric sets to the tailor. Creating it moves the fabric from On Hand to Committed to Stitch; sending it moves the
        sets to In Stitching under their size; receiving them puts them against the customer&apos;s order, ready to dispatch.
      </p>
      {editable && (
        <div className="so-create">
          <label className="field">
            <span>Tailor / stitching unit</span>
            <input value={tailor} onChange={(e) => setTailor(e.target.value)} placeholder="Name (optional)" />
          </label>
          <button className="btn primary" disabled={busy || !sets} onClick={() => run(() => createStitchingOrder(lines, tailor.trim(), ""))}>
            Create stitching order · {sets} set{sets === 1 ? "" : "s"}
          </button>
          <button className="btn ghost" disabled={busy || !onHand} onClick={() => run(allocateOnHand)} title="Sizes and unstitched fabric that are On Hand go to the oldest waiting orders">
            Commit On Hand stock · {onHand}
          </button>
        </div>
      )}
      {!sets && <p className="hint">Nothing in the list below is waiting to be stitched from fabric On Hand.</p>}
      {msg?.message && <p className={msg.ok ? "success" : "error"}>{msg.message}</p>}

      {[...open, ...done].map((s) => (
        <div key={s.id} className="so-card">
          <div className="so-head">
            <b>SO-{s.number}</b>
            <span className={`pill ${s.status === "committed" ? "printing" : s.status === "sent" ? "stitching" : s.status === "received" ? "delivered" : "cancelled"}`}>{STATUS_TEXT[s.status]}</span>
            <span className="meta">
              {s.tailor || "No tailor named"} · {s.lines.reduce((a, l) => a + l.qty, 0)} set(s) · created {shortDate(s.created_at)}
              {s.sent_at ? ` · sent ${shortDate(s.sent_at)}` : ""}
            </span>
            {editable && s.status === "committed" && (
              <span className="so-actions">
                <button className="btn small primary" disabled={busy} onClick={() => run(() => sendStitchingOrder(s.id))}>
                  Sent to tailor
                </button>
                <button className="link" disabled={busy} onClick={() => confirm(`Cancel SO-${s.number}? The fabric goes back On Hand.`) && run(() => cancelStitchingOrder(s.id))}>
                  Cancel
                </button>
              </span>
            )}
          </div>
          {(s.status === "committed" || s.status === "sent") && (
            <div className="master-list">
              {s.lines.map((l) => {
                const o = orderOf(l.order_id);
                const left = l.qty - l.received;
                return (
                  <div key={l.id} className="master-row">
                    <span className="master-name">
                      {name(l.product_id)} · <b>{l.size}</b>
                      {l.qty > 1 ? ` ×${l.qty}` : ""}
                    </span>
                    <span className="meta">
                      {o ? (
                        <Link href={`/order?id=${o.id}`}>
                          {o.customer_name} {o.order_number}
                        </Link>
                      ) : (
                        "For stock"
                      )}
                      {l.received > 0 ? ` · ${l.received} received` : ""}
                    </span>
                    {editable && s.status === "sent" && left > 0 && (
                      <span className="master-actions">
                        <button className="btn small" disabled={busy} onClick={() => run(() => receiveStitchLine(l.id, left))}>
                          Received{left > 1 ? ` ${left}` : ""}
                        </button>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
      {list && !list.length && <p className="hint">No stitching orders yet.</p>}
    </div>
  );
}
