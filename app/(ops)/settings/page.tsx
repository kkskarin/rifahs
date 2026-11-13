"use client";

import { useState } from "react";
import SettingsTabs from "@/components/SettingsTabs";
import { mutate } from "swr";
import { removeCoreTestOrder, syncShopifyNow } from "../actions";
import { dateTime } from "@/lib/format";
import { isAdmin } from "@/lib/roles";
import { safe } from "@/lib/safe";
import { useMe, useOrders, useSyncState } from "@/lib/store";
import { money } from "@/lib/format";

const SHOP = "xd1uww-uu.myshopify.com";

export default function SettingsPage() {
  const { data: me } = useMe();
  const admin = me ? isAdmin(me) : false;
  const { data: sync } = useSyncState(admin);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; message?: string } | null>(null);
  const { data: orders } = useOrders();
  const [removing, setRemoving] = useState<string | null>(null);
  const [rm, setRm] = useState<{ ok: boolean; message?: string } | null>(null);
  // Orders Core itself created in Shopify, plus Core-only entries marked Internal / test.
  const made = (orders ?? []).filter((o) => (o.tags ?? []).includes("Kaleidoscope Core") || (!o.shopify_id && o.is_internal && o.source === "Manual"));
  if (me && !admin) return <p className="empty">Only owners and admins manage Shopify.</p>;

  return (
    <>
    <SettingsTabs />
    <div className="panel">
      <h2>Shopify connection</h2>
      <table className="t" style={{ marginBottom: 18 }}>
        <tbody>
          <tr>
            <td>Store</td>
            <td>
              <a className="link" href="https://admin.shopify.com/store/xd1uww-uu" target="_blank" rel="noreferrer">
                {SHOP} ↗
              </a>
            </td>
          </tr>
          <tr>
            <td>Orders from Shopify</td>
            <td>{sync ? sync.synced : "…"}</td>
          </tr>
          <tr>
            <td>Last sync</td>
            <td>{sync ? (sync.updatedAt ? dateTime(sync.updatedAt) : "Never") : "…"}</td>
          </tr>
          <tr>
            <td>Shopify stock</td>
            <td className={sync?.stock && !sync.stock.ok ? "error" : undefined}>
              {!sync
                ? "…"
                : !sync.stock
                  ? "Not read yet — press Sync"
                  : sync.stock.ok
                    ? `${sync.stock.variants} sizes read · ${dateTime(sync.stock.at)}`
                    : sync.stock.message}
            </td>
          </tr>
        </tbody>
      </table>
      <p className="hint">
        Core reads orders and stock from Shopify. It writes to Shopify only when you do one of these here: add a{" "}
        <b>new manual order</b> (with “Also create this order in Shopify” ticked), edit a <b>customer&apos;s details or address</b>,
        change a <b>size</b>, or <b>dispatch</b> an order (marked fulfilled with the tracking number; the customer is emailed
        only if you tick that box). It never cancels or refunds, and never changes Shopify stock or prices. New and updated
        orders are pulled in automatically every 10 minutes; press Sync to pull them now. Your team&apos;s statuses and notes
        are never overwritten.
      </p>
      <div className="form-actions" style={{ justifyContent: "flex-start" }}>
        <button
          className="btn primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const r = (await safe(syncShopifyNow)) as { ok: boolean; message?: string };
            setBusy(false);
            setMsg(r);
            mutate("orders");
            mutate("sync");
          }}
        >
          {busy ? "Syncing…" : "Sync orders now"}
        </button>
      </div>
      {msg && <p className={msg.ok ? "success" : "error"}>{msg.message}</p>}
    </div>
    <div className="panel">
      <h2>Orders made from Core</h2>
      <p className="hint">
        Orders that Core created in Shopify, and Core-only test entries. <b>Cancel &amp; remove</b> cancels the order in Shopify (no
        refund, no email, stock put back), deletes it there, and removes it from Core. This cannot be undone. Orders placed on the
        website or made in Shopify admin never appear here.
      </p>
      <div className="master-list">
        {made.map((o) => (
          <div key={o.id} className="master-row">
            <span className="master-name">
              {o.order_number ?? "Core only"} · {o.customer_name}
              {o.is_internal ? " · test" : ""}
            </span>
            <span className="meta">
              {money(Number(o.total ?? 0))} · {o.status}
            </span>
            <span className="master-actions">
              <button
                className="btn small"
                disabled={removing !== null}
                onClick={async () => {
                  if (!confirm(`Cancel and permanently remove ${o.order_number ?? "this entry"} (${o.customer_name})? This cannot be undone.`)) return;
                  setRemoving(o.id);
                  const r = (await safe(() => removeCoreTestOrder(o.id))) as { ok: boolean; message?: string };
                  await mutate("orders");
                  setRemoving(null);
                  setRm(r);
                }}
              >
                {removing === o.id ? "Removing…" : "Cancel & remove"}
              </button>
            </span>
          </div>
        ))}
        {orders && !made.length && <p className="hint">Nothing here: no orders made from Core at the moment.</p>}
      </div>
      {rm && <p className={rm.ok ? "success" : "error"}>{rm.message}</p>}
    </div>
    </>
  );
}
