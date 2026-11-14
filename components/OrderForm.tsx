"use client";

import Link from "next/link";
import PhoneInput from "@/components/PhoneInput";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { mutate } from "swr";
import { pushDetailsToShopify, pushOrderToShopify } from "@/app/(ops)/actions";
import { safe } from "@/lib/safe";
import { itemsLine } from "@/lib/format";
import { saveOrder, useMe } from "@/lib/store";
import { COURIERS, SOURCES, STATUSES, STATUS_LABEL, type Order, type OrderStatus } from "@/lib/types";

export default function OrderForm({ order }: { order?: Order }) {
  const router = useRouter();
  const { data: me } = useMe();
  const [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState(order?.customer_phone ?? "");
  const [state, setState] = useState<{ ok: boolean; message?: string; id?: string } | null>(null);
  const fromShopify = Boolean(order?.shopify_id);
  const sizes = new Set(order?.items.map((i) => i.size).filter(Boolean));
  const commonSize = sizes.size === 1 ? [...sizes][0]! : "";

  return (
    <form
      className="panel"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!me) return;
        const f = new FormData(e.currentTarget);
        const v = (k: string) => String(f.get(k) ?? "").trim();
        const n = (k: string) => v(k) || null;
        const b = (k: string) => f.get(k) === "on";
        setBusy(true);
        const r = await saveOrder(me, order ?? null, {
          customer_name: v("customer_name"),
          customer_phone: n("customer_phone"),
          customer_email: n("customer_email"),
          status: v("status") as OrderStatus,
          is_express: b("is_express"),
          is_international: b("is_international"),
          is_internal: b("is_internal"),
          is_exchange: b("is_exchange"),
          promise_date: n("promise_date"),
          ship_country: n("ship_country"),
          courier: n("courier"),
          tracking_number: n("tracking_number"),
          notes: v("notes"),
          items_raw: v("items"),
          size: n("size"),
          total: v("total"),
          source: n("source"),
          channel: v("channel"),
          order_number: n("order_number"),
          address1: n("address1"),
          address2: n("address2"),
          city: n("city"),
          province: n("province"),
          zip: n("zip"),
          payment: v("payment") === "pending" ? "pending" : "paid",
        });
        if (r.ok && !order && r.id) {
          if (b("to_shopify") && !b("is_internal")) {
            // The one thing Core writes to Shopify: this new entry, as a real order.
            const s = (await safe(() => pushOrderToShopify(r.id!))) as { ok: boolean; message?: string };
            await mutate("orders");
            setBusy(false);
            if (!s.ok) return setState({ ok: false, message: s.message, id: r.id });
          }
          setBusy(false);
          return router.replace(`/order?id=${r.id}`);
        }
        if (r.ok && order?.shopify_id) {
          // Customer details changed on a Shopify order: send the same change to Shopify.
          const a = (order.ship_address ?? {}) as Record<string, string | null>;
          const was = [order.customer_name, order.customer_email, order.customer_phone, a.address1, a.address2, a.city, a.province, a.zip, order.ship_country];
          const is = [v("customer_name"), n("customer_email"), n("customer_phone"), n("address1"), n("address2"), n("city"), n("province"), n("zip"), n("ship_country")];
          if (was.some((x, i) => (x ?? "") !== (is[i] ?? ""))) {
            const s = (await safe(() => pushDetailsToShopify(order.id))) as { ok: boolean; message?: string };
            setBusy(false);
            return setState(s.message ? s : r);
          }
        }
        setBusy(false);
        setState(r);
      }}
    >
      <h2>{order ? "Order details" : "Add an entry"}</h2>
      <div className="grid">
        <label className="field">
          <span>Customer</span>
          <input name="customer_name" required defaultValue={order?.customer_name} />
        </label>
        <label className="field">
          <span>Phone</span>
          <PhoneInput name="customer_phone" value={phone} onChange={setPhone} compact />
        </label>
        <label className="field">
          <span>Email</span>
          <input name="customer_email" type="email" defaultValue={order?.customer_email ?? ""} />
        </label>
        <label className="field">
          <span>Status</span>
          <select name="status" defaultValue={order?.status ?? "new"}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>

        {fromShopify ? (
          <div className="field full">
            <span>Items (from Shopify)</span>
            <div>{itemsLine(order!.items)}</div>
          </div>
        ) : (
          <>
            <label className="field full">
              <span>Items</span>
              <textarea
                name="items"
                placeholder={"Monochrome Muse\nZiya Plum Set (M) x2"}
                defaultValue={order?.items
                  .map((i) => `${i.title}${i.size && i.size !== commonSize ? ` (${i.size})` : ""}${i.quantity > 1 ? ` x${i.quantity}` : ""}`)
                  .join("\n")}
              />
            </label>
            <label className="field">
              <span>Size (if all the same)</span>
              <input name="size" placeholder="S / M / L / Unstitched" defaultValue={commonSize} />
            </label>
            <label className="field">
              <span>Amount ₹</span>
              <input name="total" inputMode="decimal" defaultValue={order?.total ?? ""} placeholder="Leave blank if not priced yet" />
            </label>
            <label className="field">
              <span>Order #</span>
              <input name="order_number" defaultValue={order?.order_number ?? ""} placeholder="Leave blank — Shopify gives the number" />
            </label>
            <label className="field">
              <span>Source</span>
              <input name="source" list="sources" defaultValue={order?.source ?? ""} />
              <datalist id="sources">
                {SOURCES.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </label>
            <label className="field">
              <span>Payment</span>
              <select name="payment" defaultValue={order?.financial_status === "pending" ? "pending" : "paid"}>
                <option value="paid">Paid</option>
                <option value="pending">Pending / cash on delivery</option>
              </select>
            </label>
            <label className="field">
              <span>Channel</span>
              <select name="channel" defaultValue={order?.channel ?? "Instagram"}>
                {["Website", "Instagram", "WhatsApp", "Exhibition", "Walk-in", "Manual"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          </>
        )}

          <label className="field full">
            <span>Address</span>
            <input name="address1" defaultValue={(order?.ship_address as Record<string, string> | null)?.address1 ?? ""} placeholder="House, street, area" />
          </label>
          <label className="field">
            <span>City</span>
            <input name="city" defaultValue={order?.ship_city ?? ""} />
          </label>
          <label className="field">
            <span>State</span>
            <input name="province" list="in-states" defaultValue={(order?.ship_address as Record<string, string> | null)?.province ?? ""} />
            <datalist id="in-states">
              {["Tamil Nadu", "Karnataka", "Kerala", "Andhra Pradesh", "Telangana", "Maharashtra", "Delhi", "Gujarat", "West Bengal", "Uttar Pradesh", "Rajasthan", "Punjab", "Haryana", "Madhya Pradesh", "Odisha", "Bihar", "Assam", "Goa", "Puducherry"].map((x) => (
                <option key={x} value={x} />
              ))}
            </datalist>
          </label>
          <label className="field">
            <span>PIN code</span>
            <input name="zip" inputMode="numeric" defaultValue={(order?.ship_address as Record<string, string> | null)?.zip ?? ""} />
          </label>
        <label className="field">
          <span>Promise date</span>
          <input name="promise_date" type="date" defaultValue={order?.promise_date ?? ""} />
        </label>
        <label className="field">
          <span>Ship to country</span>
          <input name="ship_country" defaultValue={order?.ship_country ?? ""} placeholder="India" />
        </label>
        <label className="field">
          <span>Courier</span>
          <input name="courier" list="couriers2" defaultValue={order?.courier ?? ""} />
          <datalist id="couriers2">
            {COURIERS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <label className="field">
          <span>AWB / tracking</span>
          <input name="tracking_number" defaultValue={order?.tracking_number ?? ""} />
        </label>

        <div className="field full" style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
          <label className="checkbox">
            <input type="checkbox" name="is_express" defaultChecked={order?.is_express} /> Express
          </label>
          <label className="checkbox">
            <input type="checkbox" name="is_international" defaultChecked={order?.is_international} /> International
          </label>
          <label className="checkbox" title="A replacement sent for an earlier order">
            <input type="checkbox" name="is_exchange" defaultChecked={order?.is_exchange} /> Exchange
          </label>
          <label className="checkbox" title="Staff / test orders: never counted in sales, profit or order counts">
            <input type="checkbox" name="is_internal" defaultChecked={order?.is_internal} /> Internal / test order
          </label>
        </div>

        <label className="field full">
          <span>Notes</span>
          <textarea name="notes" defaultValue={order?.notes} placeholder="Indigo Bloom ready. Whispers Of Blue and Blush Posey due Wednesday." />
        </label>
      </div>

      {!order && (
        <label className="checkbox" style={{ marginTop: 16 }}>
          <input type="checkbox" name="to_shopify" defaultChecked /> Also create this order in Shopify (no email is sent to the customer)
        </label>
      )}
      {fromShopify && <p className="hint">Changes to the customer&apos;s name, email, phone or address are also made on the Shopify order. No email is sent to the customer.</p>}
      {state && <p className={state.ok ? "success" : "error"}>{state.message}</p>}
      {state?.id && (
        <p>
          <Link className="link" href={`/order?id=${state.id}`}>
            Open the saved entry
          </Link>
        </p>
      )}
      <div className="form-actions">
        <button className="btn primary" disabled={busy || !me}>
          {busy ? "Saving…" : order ? "Save changes" : "Add to the book"}
        </button>
      </div>
    </form>
  );
}
