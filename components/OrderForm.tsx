"use client";

import { useActionState } from "react";
import { saveOrder, type ActionResult } from "@/app/(ops)/actions";
import { itemsLine } from "@/lib/format";
import { SOURCES, STATUSES, STATUS_LABEL, COURIERS, type Order } from "@/lib/types";

export default function OrderForm({ order }: { order?: Order }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(saveOrder, null);
  const fromShopify = Boolean(order?.shopify_id);
  const sizes = new Set(order?.items.map((i) => i.size).filter(Boolean));
  const commonSize = sizes.size === 1 ? [...sizes][0]! : "";

  return (
    <form action={action} className="panel">
      <h2>{order ? "Order details" : "Add an entry"}</h2>
      {order && <input type="hidden" name="id" value={order.id} />}
      <input type="hidden" name="is_shopify" value={String(fromShopify)} />

      <div className="grid">
        <label className="field">
          <span>Customer</span>
          <input name="customer_name" required defaultValue={order?.customer_name} />
        </label>
        <label className="field">
          <span>Phone</span>
          <input name="customer_phone" type="tel" defaultValue={order?.customer_phone ?? ""} />
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
                defaultValue={order?.items.map((i) => `${i.title}${i.size && i.size !== commonSize ? ` (${i.size})` : ""}${i.quantity > 1 ? ` x${i.quantity}` : ""}`).join("\n")}
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
              <input name="order_number" defaultValue={order?.order_number ?? ""} placeholder="#1272 (optional)" />
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
              <span>Channel</span>
              <select name="channel" defaultValue={order?.channel ?? "Instagram"}>
                {["Website", "Instagram", "WhatsApp", "Exhibition", "Walk-in", "Manual"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          </>
        )}

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
          <label className="checkbox" title="Staff / test orders: hidden from the order list and left out of sales">
            <input type="checkbox" name="is_internal" defaultChecked={order?.is_internal} /> Internal / test order
          </label>
        </div>

        <label className="field full">
          <span>Notes</span>
          <textarea
            name="notes"
            defaultValue={order?.notes}
            placeholder="Indigo Bloom ready. Whispers Of Blue and Blush Posey due Wednesday."
          />
        </label>
      </div>

      {state && <p className={state.ok ? "success" : "error"}>{state.message}</p>}
      <div className="form-actions">
        <button className="btn primary" disabled={pending}>
          {pending ? "Saving…" : order ? "Save changes" : "Add to the book"}
        </button>
      </div>
    </form>
  );
}
