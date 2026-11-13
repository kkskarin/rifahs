"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import SalesNav from "@/components/SalesNav";
import { useDueRules } from "@/lib/due";
import { shortDate, todayIST } from "@/lib/format";
import { useProducts } from "@/lib/inventory";
import { ACTION_LABEL, buildQueue, type QueueAction } from "@/lib/queue";
import { useOrders } from "@/lib/store";
import { STATUS_LABEL, type OrderStatus } from "@/lib/types";

const istDate = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const long = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
const STAGES: { key: OrderStatus; label: string }[] = [
  { key: "new", label: "Open" },
  { key: "printing", label: "Fabric (waiting for fabric)" },
  { key: "stitching", label: "Already at stitching" },
];

export default function StitchingQueuePage() {
  const { data: orders } = useOrders();
  const { data: products } = useProducts();
  const rules = useDueRules();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [stages, setStages] = useState<OrderStatus[]>(["new", "printing"]);
  const [only, setOnly] = useState<QueueAction | "">("");

  const picked = useMemo(
    () =>
      (orders ?? []).filter(
        (o) => !o.is_internal && stages.includes(o.status) && (!from || istDate(o.placed_at) >= from) && (!to || istDate(o.placed_at) <= to),
      ),
    [orders, from, to, stages],
  );
  const groups = useMemo(() => buildQueue(picked, products ?? [], rules), [picked, products, rules]);
  const total = (a: QueueAction) => groups.reduce((n, g) => n + g.counts[a], 0);
  const pieces = groups.reduce((n, g) => n + g.lines.length, 0);
  const dates = picked.map((o) => istDate(o.placed_at)).sort();
  const numbers = picked.map((o) => Number((o.order_number ?? "").replace(/\D/g, ""))).filter(Boolean).sort((a, b) => a - b);
  const shown = groups.map((g) => ({ ...g, lines: only ? g.lines.filter((l) => l.action === only) : g.lines })).filter((g) => g.lines.length);

  const csv = () => {
    const esc = (v: unknown) => {
      const s = String(v ?? "");
      const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
      return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
    };
    const rows = ["Item,Customer,Order,Size,Date of order,Due by,Action,Notes"];
    for (const g of shown) for (const l of g.lines) rows.push([g.name, l.order.customer_name, l.order.order_number, l.size, istDate(l.order.placed_at), l.due.date, ACTION_LABEL[l.action], l.order.notes].map(esc).join(","));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + rows.join("\n")], { type: "text/csv;charset=utf-8" }));
    a.download = `stitching-queue-${todayIST()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <div className="no-print">
        <SalesNav />
        <div className="panel">
          <h3>Stitching queue</h3>
          <p className="hint" style={{ marginTop: -6 }}>
            Open orders by item, checked against today&apos;s inventory. The earliest due orders get the stock first: a ready stitched piece of the
            right size is used before fabric, fabric in stock is stitched next, and anything left over is flagged.
          </p>
          <div className="grid filters">
            <label className="field">
              <span>Orders from</span>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="field">
              <span>Orders to</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
            <label className="field">
              <span>Show</span>
              <select value={only} onChange={(e) => setOnly(e.target.value as QueueAction | "")}>
                <option value="">Everything</option>
                {(Object.keys(ACTION_LABEL) as QueueAction[]).map((a) => (
                  <option key={a} value={a}>
                    {ACTION_LABEL[a]} ({total(a)})
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div style={{ display: "flex", gap: "8px 22px", flexWrap: "wrap", marginTop: 14 }}>
            {STAGES.map((s) => (
              <label key={s.key} className="checkbox">
                <input
                  type="checkbox"
                  checked={stages.includes(s.key)}
                  onChange={(e) => setStages((cur) => (e.target.checked ? [...cur, s.key] : cur.filter((x) => x !== s.key)))}
                />{" "}
                {s.label}
              </label>
            ))}
          </div>
          <div className="form-actions">
            <button className="btn ghost" onClick={csv} disabled={!pieces}>
              Download CSV
            </button>
            <button className="btn primary" onClick={() => window.print()} disabled={!pieces}>
              Print / save as PDF
            </button>
          </div>
        </div>
      </div>

      <div className="sheet">
        <div className="sheet-head">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Kaleidoscope by Rifah" />
          <h2>Stitching Queue</h2>
          <p>
            {pieces} piece{pieces === 1 ? "" : "s"} across {picked.length} order{picked.length === 1 ? "" : "s"}
            {numbers.length ? ` · #${numbers[0]} – #${numbers[numbers.length - 1]}` : ""}
            {dates.length ? ` · ${long(dates[0])} – ${long(dates[dates.length - 1])}` : ""} · stock as on {long(todayIST())}
          </p>
        </div>

        {!orders || !products ? (
          <p className="empty">Loading…</p>
        ) : !pieces ? (
          <p className="empty">No open orders in this range.</p>
        ) : (
          <>
            <div className="queue-summary">
              <div>
                <span>To stitch</span>
                <b>{total("stitch")}</b>
              </div>
              <div>
                <span>Ready in stock</span>
                <b>{total("ready")}</b>
              </div>
              <div>
                <span>Send unstitched</span>
                <b>{total("send-unstitched")}</b>
              </div>
              <div>
                <span>Fabric needed</span>
                <b className={total("need-fabric") ? "danger" : ""}>{total("need-fabric")}</b>
              </div>
              {total("untracked") > 0 && (
                <div>
                  <span>Not in inventory</span>
                  <b>{total("untracked")}</b>
                </div>
              )}
            </div>

            <table className="queue">
              <thead>
                <tr>
                  <th>Customer name</th>
                  <th>Size</th>
                  <th>Date of order</th>
                  <th>Due by</th>
                  <th>What to do</th>
                </tr>
              </thead>
              {shown.map((g) => (
                <tbody key={g.key}>
                  <tr className="queue-item">
                    <td colSpan={5}>
                      <b>{g.name}</b> — {g.lines.length} piece{g.lines.length === 1 ? "" : "s"}
                      <span className="queue-plan">
                        {g.product
                          ? [
                              `Unstitched stock ${g.fabricStart}`,
                              g.product.stitched.filter((r) => r.qty > 0).length ? `ready ${g.product.stitched.filter((r) => r.qty > 0).map((r) => `${r.size}×${r.qty}`).join(", ")}` : "",
                              g.stitchBySize.length ? `stitch ${g.stitchBySize.map(([s, n]) => `${n} × ${s}`).join(", ")}` : "",
                              g.counts["need-fabric"] ? `${g.counts["need-fabric"]} more fabric needed${g.product.in_production ? ` (${g.product.in_production} in production)` : ""}` : "",
                            ]
                              .filter(Boolean)
                              .join(" · ")
                          : "Not in inventory — add it under Inventory to track stock"}
                      </span>
                    </td>
                  </tr>
                  {g.lines.map((l, i) => (
                    <tr key={l.order.id + i} className={`queue-line act-${l.action}`}>
                      <td>
                        <Link href={`/order?id=${l.order.id}`}>{l.order.customer_name}</Link> <span className="meta">{l.order.order_number}</span>
                        {l.order.is_express && <span className="flag express"> Express</span>}
                        {l.order.status !== "new" && <span className="meta"> · {STATUS_LABEL[l.order.status]}</span>}
                        {l.order.notes && <div className="queue-note">— {l.order.notes}</div>}
                      </td>
                      <td>
                        <b>{l.size}</b>
                      </td>
                      <td>{shortDate(l.order.placed_at)}</td>
                      <td>
                        <span className={`due due-${l.due.level}`} style={{ marginTop: 0 }}>
                          {l.due.label}
                        </span>
                      </td>
                      <td className="queue-action">{ACTION_LABEL[l.action]}</td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </>
        )}
        <p className="sheet-foot">www.rifahs.com · Rooted in Tamil Nadu, made slowly, worn boldly</p>
      </div>
    </>
  );
}
