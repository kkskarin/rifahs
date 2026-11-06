"use client";

import SalesNav from "@/components/SalesNav";
import Link from "next/link";
import { useState } from "react";
import { dateTime } from "@/lib/format";
import { saveIssue, setIssueStatus, useIssues, useMe, useOrders } from "@/lib/store";
import { COURIERS, ISSUE_KINDS } from "@/lib/types";

export default function IssuesPage() {
  const { data: issues } = useIssues();
  const { data: me } = useMe();
  const { data: orders } = useOrders();
  const [showResolved, setShowResolved] = useState(false);
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; message?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const list = (issues ?? []).filter((i) => (showResolved ? i.status === "resolved" : i.status !== "resolved"));

  return (
    <>
      <SalesNav />
      {!adding ? (
        <div className="toolbar">
          <button className="btn" onClick={() => setAdding(true)}>
            + Log an issue
          </button>
          {msg?.ok && <span className="success">{msg.message}</span>}
        </div>
      ) : (
        <form
          className="panel"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!me) return;
            const f = new FormData(e.currentTarget);
            const v = (k: string) => String(f.get(k) ?? "").trim();
            setBusy(true);
            const r = await saveIssue(me, orders ?? [], {
              title: v("title"),
              kind: v("kind"),
              courier: v("courier") || null,
              tracking_number: v("tracking_number") || null,
              details: v("details"),
              order_ref: v("order_ref"),
            });
            setBusy(false);
            setMsg(r);
            if (r.ok) setAdding(false);
          }}
        >
          <h3>Log an issue</h3>
          <div className="grid">
            <label className="field full">
              <span>What happened</span>
              <input name="title" required placeholder="Parcel stuck at Hyderabad hub for 5 days" />
            </label>
            <label className="field">
              <span>Order #</span>
              <input name="order_ref" placeholder="1262" />
            </label>
            <label className="field">
              <span>Type</span>
              <select name="kind">
                {ISSUE_KINDS.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Courier</span>
              <input name="courier" list="couriers3" />
              <datalist id="couriers3">
                {COURIERS.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>
            <label className="field">
              <span>AWB</span>
              <input name="tracking_number" />
            </label>
            <label className="field full">
              <span>Details</span>
              <textarea name="details" placeholder="Raised complaint with courier, customer informed on WhatsApp" />
            </label>
          </div>
          {msg && !msg.ok && <p className="error">{msg.message}</p>}
          <div className="form-actions">
            <button type="button" className="btn ghost" onClick={() => setAdding(false)}>
              Cancel
            </button>
            <button className="btn primary" disabled={busy}>
              {busy ? "Saving…" : "Log issue"}
            </button>
          </div>
        </form>
      )}

      <nav className="chips">
        <button className="chip" aria-current={!showResolved ? "true" : undefined} onClick={() => setShowResolved(false)}>
          <b>Open</b>
        </button>
        <button className="chip" aria-current={showResolved ? "true" : undefined} onClick={() => setShowResolved(true)}>
          <b>Resolved</b>
        </button>
      </nav>

      {!issues ? (
        <p className="empty">Loading…</p>
      ) : !list.length ? (
        <p className="empty">{showResolved ? "No resolved issues yet." : "No courier trouble right now."}</p>
      ) : (
        <div className="list">
          {list.map((i) => (
            <article key={i.id} className="card">
              <div className="row1">
                <div>
                  <span className="name">{i.title}</span>
                  {i.order && (
                    <Link href={`/order?id=${i.order.id}`} className="num">
                      {i.order.customer_name} {i.order.order_number}
                    </Link>
                  )}
                </div>
                <span className={`pill ${i.status === "resolved" ? "delivered" : i.status === "waiting" ? "ready" : "new"}`}>{i.status}</span>
              </div>
              <div className="row2">
                <span className="flag express">{i.kind}</span>
                {i.courier && <span className="meta">{i.courier}</span>}
                {i.tracking_number && <span className="meta">AWB {i.tracking_number}</span>}
                <span className="meta">Logged {dateTime(i.created_at)}</span>
              </div>
              {i.details && <div className="note">{i.details}</div>}
              <div className="actions">
                {i.status !== "resolved" && (
                  <button className="advance" onClick={() => setIssueStatus(i.id, "resolved")}>
                    Mark resolved ✓
                  </button>
                )}
                {i.status === "open" && (
                  <button className="link" onClick={() => setIssueStatus(i.id, "waiting")}>
                    Waiting on courier
                  </button>
                )}
                {i.status !== "open" && (
                  <button className="link" onClick={() => setIssueStatus(i.id, "open")}>
                    Reopen
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
