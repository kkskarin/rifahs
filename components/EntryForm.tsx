"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { mutate } from "swr";
import { lookupPin, pushOrderToShopify } from "@/app/(ops)/actions";
import { COUNTRIES, IN_STATE_NAMES, matchState } from "@/lib/places";
import { entryTotals, taxTypeFor, type EntryLine } from "@/lib/entry";
import { money } from "@/lib/format";
import { normDesign, useProducts, useShopifyStock } from "@/lib/inventory";
import { safe } from "@/lib/safe";
import { saveEntry, useMe } from "@/lib/store";
import { GST_RATES, OPEN_STATUSES, PAYMENT_TERMS, SIZE_OPTIONS, STATUSES, STATUS_LABEL, type Order, type OrderStatus, type TaxMode, type TaxType } from "@/lib/types";

const blank = (): EntryLine => ({ title: "", size: "", quantity: 1, price: 0, tax_rate: 5 });
const num = (v: string) => Number(v.replace(/[₹,\s]/g, "")) || 0;

/** Manual order entry: an items table with GST breakup, then delivery and payment details. */
export default function EntryForm({ order }: { order?: Order }) {
  const router = useRouter();
  const { data: me } = useMe();
  const { data: products } = useProducts();
  const { data: stock } = useShopifyStock();
  const addr = (order?.ship_address ?? null) as Record<string, string | null> | null;

  const [lines, setLines] = useState<EntryLine[]>(
    order?.items.length
      ? order.items.map((i) => ({ title: i.title, size: i.size ?? "", quantity: i.quantity || 1, price: Number(i.price ?? 0), tax_rate: Number(i.tax_rate ?? 5) }))
      : [blank()],
  );
  const [taxMode, setTaxMode] = useState<TaxMode>(order?.tax_mode ?? "inclusive");
  const [state, setState] = useState(addr?.province ?? "");
  const [country, setCountry] = useState(order?.ship_country ?? "India");
  const [otherCountry, setOtherCountry] = useState(Boolean(order?.ship_country && !COUNTRIES.includes(order.ship_country)));
  const [city, setCity] = useState(order?.ship_city ?? "");
  const [district, setDistrict] = useState(addr?.district ?? "");
  const [pin, setPin] = useState(addr?.zip ?? "");
  const [pinNote, setPinNote] = useState("");
  const india = /^(india|in)?$/i.test(country.trim());
  // Typing a PIN fills in city, district and state. They stay editable.
  const onPin = async (raw: string) => {
    const value = raw.replace(/\s/g, "");
    setPin(value);
    if (!india || !/^[1-9]\d{5}$/.test(value)) return setPinNote("");
    setPinNote("Looking up…");
    const r = (await safe(() => lookupPin(value))) as Awaited<ReturnType<typeof lookupPin>>;
    if (!r.ok) return setPinNote("PIN not found — please fill in the city and state.");
    setState(matchState(r.state ?? ""));
    setDistrict(r.district ?? "");
    setCity(r.city ?? "");
    setPinNote(r.areas?.length ? `Post office: ${r.areas.slice(0, 4).join(", ")}${r.areas.length > 4 ? "…" : ""}` : "");
  };
  // Designs to pick from: Core's own list plus whatever Shopify sells.
  const designs = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of products ?? []) if (p.active) seen.set(normDesign(p.name), p.name);
    for (const x of stock ?? []) if (x.product_status === "active" && !seen.has(normDesign(x.product_title))) seen.set(normDesign(x.product_title), x.product_title);
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  }, [products, stock]);
  const [typed, setTyped] = useState<Record<number, boolean>>({});
  // Sizes Shopify sells for a design; the standard list when it isn't a Shopify product.
  const sizesFor = (title: string) => {
    const key = normDesign(title);
    const found = (stock ?? [])
      .filter((x) => normDesign(x.product_title) === key)
      .map((x) => x.variant_title.trim())
      .filter((x) => x && x !== "Default Title");
    return found.length ? [...new Set(found)] : SIZE_OPTIONS;
  };
  const [taxTypePick, setTaxTypePick] = useState<TaxType | "auto">(order?.tax_type ? order.tax_type : "auto");
  const [shipping, setShipping] = useState(String(order?.shipping_charge ?? ""));
  const [payment, setPayment] = useState<"full" | "part" | "none">(
    order ? (order.financial_status === "paid" ? "full" : Number(order.amount_paid ?? 0) > 0 ? "part" : "none") : "full",
  );
  const [paid, setPaid] = useState(String(order?.amount_paid ?? ""));
  const [msg, setMsg] = useState<{ ok: boolean; text: string; id?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const taxType: TaxType = taxMode === "none" ? "" : taxTypePick === "auto" ? taxTypeFor(state, country) : taxTypePick;
  const filled = lines.filter((l) => l.title.trim());
  const t = useMemo(() => entryTotals(filled, taxMode, num(shipping)), [filled, taxMode, shipping]);
  const paidAmount = payment === "full" ? t.total : payment === "none" ? 0 : Math.min(num(paid), t.total);
  const balance = Math.max(t.total - paidAmount, 0);

  // Shopify's price for a design + size, used to fill in the price (it can always be overtyped).
  const priceFor = (title: string, size: string) => {
    const key = normDesign(title);
    const hits = (stock ?? []).filter((s) => normDesign(s.product_title) === key && s.price != null);
    const hit = hits.find((s) => s.variant_title.trim().toUpperCase() === size.toUpperCase()) ?? hits.find((s) => s.variant_title.split("/").some((p) => p.trim().toUpperCase() === size.toUpperCase())) ?? (size ? undefined : hits[0]);
    return hit?.price ?? null;
  };
  const setLine = (i: number, patch: Partial<EntryLine>) =>
    setLines((ls) =>
      ls.map((l, k) => {
        if (k !== i) return l;
        const next = { ...l, ...patch };
        if (("title" in patch || "size" in patch) && (!l.price || l.price === priceFor(l.title, l.size))) {
          const p = priceFor(next.title, next.size);
          if (p != null) next.price = Number(p);
        }
        return next;
      }),
    );

  return (
    <form
      className="panel"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!me) return;
        const f = new FormData(e.currentTarget);
        const v = (k: string) => String(f.get(k) ?? "").trim();
        const b = (k: string) => f.get(k) === "on";
        setBusy(true);
        const r = await saveEntry(me, order ?? null, {
          customer_name: v("customer_name"),
          customer_phone: v("customer_phone") || null,
          customer_email: v("customer_email") || null,
          address1: v("address1") || null,
          city: city.trim() || null,
          district: district.trim() || null,
          province: state.trim() || null,
          zip: pin.trim() || null,
          ship_country: country.trim() || "India",
          lines,
          tax_mode: taxMode,
          tax_type: taxType,
          shipping_charge: num(shipping),
          amount_paid: paidAmount,
          payment_terms: payment === "full" ? "" : [v("payment_terms"), v("payment_note")].filter(Boolean).join(" — "),
          payment_due_date: payment === "full" ? null : v("payment_due_date") || null,
          promise_date: v("promise_date") || null,
          notes: v("notes"),
          status: (v("status") || "new") as OrderStatus,
          channel: v("channel"),
          is_express: b("is_express"),
          is_international: b("is_international"),
          is_exchange: b("is_exchange"),
          is_internal: b("is_internal"),
        });
        if (!r.ok || !r.id) {
          setBusy(false);
          return setMsg({ ok: false, text: r.message ?? "Couldn't save" });
        }
        if (!order?.shopify_id && b("to_shopify")) {
          if (b("is_internal")) {
            setBusy(false);
            return setMsg({ ok: true, id: r.id, text: "Saved in Core. It was NOT sent to Shopify because it is marked Internal / test." });
          }
          const s = (await safe(() => pushOrderToShopify(r.id!))) as { ok: boolean; message?: string };
          await mutate("orders");
          if (!s.ok) {
            setBusy(false);
            return setMsg({ ok: false, id: r.id, text: s.message ?? "Shopify refused the order" });
          }
        }
        setBusy(false);
        if (!order) return router.replace(`/order?id=${r.id}`);
        setMsg({ ok: true, text: b("to_shopify") && !b("is_internal") ? "Saved, and created in Shopify." : "Saved" });
      }}
    >
      <h2>{order ? "Order details" : "New order"}</h2>

      <h3>Customer</h3>
      <div className="grid">
        <label className="field">
          <span>Name</span>
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
        <label className="field full">
          <span>Address</span>
          <input name="address1" defaultValue={addr?.address1 ?? ""} placeholder="House, street, area" />
        </label>
        <label className="field">
          <span>Country</span>
          <select
            value={otherCountry ? "__other" : country || "India"}
            onChange={(e) => {
              const other = e.target.value === "__other";
              setOtherCountry(other);
              setCountry(other ? "" : e.target.value);
            }}
          >
            {COUNTRIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
            <option value="__other">Other…</option>
          </select>
          {otherCountry && <input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Country name" aria-label="Country name" style={{ marginTop: 6 }} />}
        </label>
        <label className="field">
          <span>{india ? "PIN code" : "Postal code"}</span>
          <input inputMode={india ? "numeric" : "text"} value={pin} onChange={(e) => onPin(e.target.value)} placeholder={india ? "Fills in city and state" : ""} />
          {pinNote && <small className="hint" style={{ margin: 0 }}>{pinNote}</small>}
        </label>
        <label className="field">
          <span>City</span>
          <input value={city} onChange={(e) => setCity(e.target.value)} />
        </label>
        {india && (
          <label className="field">
            <span>District</span>
            <input value={district} onChange={(e) => setDistrict(e.target.value)} />
          </label>
        )}
        <label className="field">
          <span>{india ? "State" : "State / region"}</span>
          {india ? (
            <select value={state} onChange={(e) => setState(e.target.value)}>
              <option value="">Choose…</option>
              {[...new Set([...(state && !IN_STATE_NAMES.includes(state) ? [state] : []), ...IN_STATE_NAMES])].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          ) : (
            <input value={state} onChange={(e) => setState(e.target.value)} />
          )}
        </label>
      </div>

      <h3 style={{ marginTop: 24 }}>Items</h3>
      <div className="entry-tax">
        <label className="field">
          <span>GST</span>
          <select value={taxMode} onChange={(e) => setTaxMode(e.target.value as TaxMode)}>
            <option value="inclusive">Prices include GST</option>
            <option value="exclusive">Add GST on top of prices</option>
            <option value="none">No GST</option>
          </select>
        </label>
        {taxMode !== "none" && (
          <label className="field">
            <span>GST type</span>
            <select value={taxTypePick} onChange={(e) => setTaxTypePick(e.target.value as TaxType | "auto")}>
              <option value="auto">Automatic from state ({taxTypeFor(state, country) === "cgst_sgst" ? "CGST + SGST" : taxTypeFor(state, country) === "igst" ? "IGST" : "none — export"})</option>
              <option value="cgst_sgst">CGST + SGST (within Tamil Nadu)</option>
              <option value="igst">IGST (other states)</option>
            </select>
          </label>
        )}
      </div>

      <div className="scroll-x">
        <table className="t stack entry-table">
          <thead>
            <tr>
              <th>Item name</th>
              <th>Size</th>
              <th className="n">Qty</th>
              <th className="n">Price ₹</th>
              {taxMode !== "none" && <th className="n">GST %</th>}
              {taxMode !== "none" && <th className="n">{taxType === "cgst_sgst" ? "CGST + SGST" : "IGST"}</th>}
              <th className="n">Amount</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const row = entryTotals([l], taxMode, 0).rows[0];
              return (
                <tr key={i}>
                  <td data-label="Item name">
                    {typed[i] || (l.title && !designs.includes(l.title)) ? (
                      <span style={{ display: "flex", gap: 6 }}>
                        <input value={l.title} onChange={(e) => setLine(i, { title: e.target.value })} placeholder="Type the item name" aria-label="Item name" autoFocus={typed[i]} />
                        <button type="button" className="link" onClick={() => { setTyped((x) => ({ ...x, [i]: false })); setLine(i, { title: "" }); }}>
                          List
                        </button>
                      </span>
                    ) : (
                      <select
                        value={l.title}
                        onChange={(e) => (e.target.value === "__other" ? setTyped((x) => ({ ...x, [i]: true })) : setLine(i, { title: e.target.value, size: sizesFor(e.target.value).includes(l.size) ? l.size : "" }))}
                        aria-label="Item name"
                      >
                        <option value="">Choose a design…</option>
                        {designs.map((d) => (
                          <option key={d}>{d}</option>
                        ))}
                        <option value="__other">Other — type a name…</option>
                      </select>
                    )}
                  </td>
                  <td data-label="Size">
                    <select value={l.size} onChange={(e) => setLine(i, { size: e.target.value })} aria-label="Size">
                      <option value="">—</option>
                      {[...new Set([...(l.size ? [l.size] : []), ...sizesFor(l.title)])].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                  <td className="n" data-label="Qty">
                    <input type="number" min={1} value={l.quantity} onChange={(e) => setLine(i, { quantity: Math.max(Number(e.target.value) || 1, 1) })} aria-label="Quantity" />
                  </td>
                  <td className="n" data-label="Price ₹">
                    <input inputMode="decimal" value={l.price || ""} onChange={(e) => setLine(i, { price: num(e.target.value) })} placeholder="0" aria-label="Price" />
                  </td>
                  {taxMode !== "none" && (
                    <td className="n" data-label="GST %">
                      <select value={l.tax_rate} onChange={(e) => setLine(i, { tax_rate: Number(e.target.value) })} aria-label="GST rate">
                        {GST_RATES.map((r) => (
                          <option key={r} value={r}>
                            {r}%
                          </option>
                        ))}
                      </select>
                    </td>
                  )}
                  {taxMode !== "none" && (
                    <td className="n" data-label={taxType === "cgst_sgst" ? "CGST + SGST" : "IGST"}>
                      {taxType === "cgst_sgst" ? `${money2(row.tax / 2)} + ${money2(row.tax / 2)}` : money2(row.tax)}
                    </td>
                  )}
                  <td className="n" data-label="Amount">
                    <b>{money2(row.amount)}</b>
                  </td>
                  <td className="stack-actions">
                    {lines.length > 1 && (
                      <button type="button" className="link" onClick={() => setLines((ls) => ls.filter((_, k) => k !== i))} aria-label="Remove item">
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button type="button" className="btn small ghost" style={{ marginTop: 10 }} onClick={() => setLines((ls) => [...ls, blank()])}>
        + Add item
      </button>

      <div className="entry-totals">
        <label className="field">
          <span>Shipping charge ₹</span>
          <input inputMode="decimal" value={shipping} onChange={(e) => setShipping(e.target.value)} placeholder="0" />
        </label>
        <dl>
          <div>
            <dt>{taxMode === "none" ? "Items" : "Taxable value"}</dt>
            <dd>{money2(t.taxable)}</dd>
          </div>
          {taxMode !== "none" &&
            (taxType === "cgst_sgst" ? (
              <>
                <div>
                  <dt>CGST</dt>
                  <dd>{money2(t.tax / 2)}</dd>
                </div>
                <div>
                  <dt>SGST</dt>
                  <dd>{money2(t.tax / 2)}</dd>
                </div>
              </>
            ) : (
              <div>
                <dt>IGST</dt>
                <dd>{money2(t.tax)}</dd>
              </div>
            ))}
          <div>
            <dt>Shipping</dt>
            <dd>{money2(t.shipping)}</dd>
          </div>
          <div className="grand">
            <dt>Order total</dt>
            <dd>{money(t.total)}</dd>
          </div>
        </dl>
      </div>

      <h3 style={{ marginTop: 24 }}>Payment and delivery</h3>
      <div className="grid">
        <label className="field">
          <span>Payment</span>
          <select value={payment} onChange={(e) => setPayment(e.target.value as "full" | "part" | "none")}>
            <option value="full">Fully paid</option>
            <option value="part">Partly paid</option>
            <option value="none">Not paid yet</option>
          </select>
        </label>
        {payment === "part" && (
          <label className="field">
            <span>Amount paid ₹</span>
            <input inputMode="decimal" value={paid} onChange={(e) => setPaid(e.target.value)} />
          </label>
        )}
        {payment !== "full" && (
          <>
            <label className="field">
              <span>Balance {money(balance)} is</span>
              <select name="payment_terms" key={payment} defaultValue={PAYMENT_TERMS.find((p) => order?.payment_terms?.startsWith(p)) ?? (payment === "part" ? "Advance paid, balance on dispatch" : PAYMENT_TERMS[0])}>
                {PAYMENT_TERMS.filter((p) => payment === "part" || !p.startsWith("Advance paid")).map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Payment due on</span>
              <input name="payment_due_date" type="date" defaultValue={order?.payment_due_date ?? ""} />
            </label>
            <label className="field">
              <span>Payment note (optional)</span>
              <input name="payment_note" defaultValue={order?.payment_terms?.split(" — ")[1] ?? ""} placeholder="e.g. balance by UPI before 20 Nov" />
            </label>
          </>
        )}
        <label className="field">
          <span>Delivery due date</span>
          <input name="promise_date" type="date" defaultValue={order?.promise_date ?? ""} />
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
        <label className="field">
          <span>Order came from</span>
          <select name="channel" defaultValue={order?.channel ?? "Instagram"}>
            {["Instagram", "WhatsApp", "Website", "Exhibition", "Walk-in", "Phone", "Manual"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="field full">
          <span>Comments</span>
          <textarea name="notes" defaultValue={order?.notes} placeholder="Measurements, customisation, anything the stitching unit should know" />
        </label>
        <div className="field full" style={{ display: "flex", gap: "8px 22px", flexWrap: "wrap" }}>
          <label className="checkbox">
            <input type="checkbox" name="is_express" defaultChecked={order?.is_express} /> Express
          </label>
          <label className="checkbox">
            <input type="checkbox" name="is_international" defaultChecked={order?.is_international} /> International
          </label>
          <label className="checkbox">
            <input type="checkbox" name="is_exchange" defaultChecked={order?.is_exchange} /> Exchange
          </label>
          <label className="checkbox" title="Staff / test orders: never counted, and never sent to Shopify">
            <input type="checkbox" name="is_internal" defaultChecked={order?.is_internal} /> Internal / test order
          </label>
        </div>
      </div>

      {!order?.shopify_id && (
        <label className="checkbox" style={{ marginTop: 16 }}>
          <input type="checkbox" name="to_shopify" defaultChecked={!order || OPEN_STATUSES.includes(order.status)} /> Also create this order in Shopify (no email to the customer; not for Internal / test orders)
        </label>
      )}
      {msg && <p className={msg.ok ? "success" : "error"}>{msg.text}</p>}
      {msg?.id && (
        <p>
          <Link className="link" href={`/order?id=${msg.id}`}>
            Open the saved entry
          </Link>
        </p>
      )}
      <div className="form-actions">
        <button className="btn primary" disabled={busy || !me}>
          {busy ? "Saving…" : order ? "Save changes" : "Save order"}
        </button>
      </div>
    </form>
  );
}

const money2 = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
