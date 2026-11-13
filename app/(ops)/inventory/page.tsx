"use client";

import DesignTables, { type Piece } from "@/components/DesignTables";
import Link from "next/link";
import { useMemo, useState } from "react";
import { dateTime } from "@/lib/format";
import ProductForm from "@/components/ProductForm";
import { adjust, demandByProduct, normDesign, shopifyByProduct, useMoves, useProducts, useShopifyStock, type Demand } from "@/lib/inventory";
import { useOrders, useTeam } from "@/lib/store";
import { STOCK_LABEL, type Product, type StockField } from "@/lib/types";

type Filter = "attention" | "all" | "Current" | "New" | "accessories" | "stitched" | "oversold";
type Shop = { sizes: { label: string; qty: number | null }[]; total: number; live: boolean };
const SIZES = ["XS", "S", "M", "L", "XL", "XXL", "3XL", "Free size"];

export default function InventoryPage() {
  const { data: products, error } = useProducts();
  const { data: orders } = useOrders();
  const [filter, setFilter] = useState<Filter>("attention");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState<string | null>(null); // prefilled name, "" = blank

  const { demand, untracked, keyToId } = useMemo(() => demandByProduct(products, orders), [products, orders]);
  // Every ordered piece of each design (test orders, cancellations and refunds left out), for the size tables.
  const pieces = useMemo(() => {
    const m = new Map<string, Piece[]>();
    for (const o of orders ?? []) {
      if (o.is_internal || o.status === "cancelled" || o.status === "refunded") continue;
      for (const it of o.items ?? []) {
        const id = keyToId.get(normDesign(it.title));
        if (!id) continue;
        m.set(id, [...(m.get(id) ?? []), { status: o.status, size: it.size ?? null, qty: Number(it.quantity || 1), placed_at: o.placed_at }]);
      }
    }
    return m;
  }, [orders, keyToId]);
  const { data: stock } = useShopifyStock();
  const shop = useMemo(() => shopifyByProduct(products, stock), [products, stock]);
  // The agreed rule: every size may show (unstitched stock we hold − uncommitted orders), plus ready pieces of that size.
  // "oversold" counts the sizes where the website shows more than that. Core only reports it; it never changes Shopify.
  const sellable = (p: Product) => Math.max(p.in_stock - (demand.get(p.id)?.waitingQty ?? 0), 0);
  const oversold = (p: Product) => {
    const g = shop.byId.get(p.id);
    if (!g || !g.live) return 0;
    const ready = (label: string) => p.stitched.find((r) => r.size.toUpperCase().replace("3XL", "XXXL") === label.toUpperCase().replace("3XL", "XXXL"))?.qty ?? 0;
    return g.sizes.filter((z) => (z.qty ?? 0) > sellable(p) + ready(z.label)).length;
  };

  const status = (p: Product) => {
    const d = demand.get(p.id);
    const short = Math.max((d?.waitingQty ?? 0) - p.in_stock, 0);
    const low = p.in_stock <= p.low_at;
    return { d, short, low };
  };

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (products ?? [])
      .filter((p) => p.active)
      .filter((p) => !needle || [p.name, ...p.aliases, p.notes].join(" ").toLowerCase().includes(needle))
      .filter((p) => {
        const s = status(p);
        if (filter === "attention") return s.short > 0 || (s.low && p.collection !== "Old");
        if (filter === "Current" || filter === "New") return p.collection === filter && p.category === "Suit set";
        if (filter === "accessories") return p.category !== "Suit set";
        if (filter === "stitched") return p.stitched.some((r) => r.qty > 0);
        if (filter === "oversold") return oversold(p) > 0;
        return true;
      })
      .sort((a, b) => status(b).short - status(a).short || a.name.localeCompare(b.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, demand, filter, q, shop]);

  const totals = useMemo(() => {
    const ps = (products ?? []).filter((p) => p.active);
    return {
      stock: ps.reduce((a, p) => a + p.in_stock, 0),
      stitching: ps.reduce((a, p) => a + p.at_stitching, 0),
      production: ps.reduce((a, p) => a + p.in_production, 0),
      ready: ps.reduce((a, p) => a + p.stitched.reduce((s, r) => s + r.qty, 0), 0),
      short: ps.filter((p) => status(p).short > 0).length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, demand]);

  const chips: { f: Filter; label: string; n?: number }[] = [
    { f: "attention", label: "Needs attention" },
    { f: "all", label: "All designs", n: (products ?? []).filter((p) => p.active).length },
    { f: "Current", label: "Current" },
    { f: "New", label: "New collection" },
    { f: "accessories", label: "Dupattas & pants" },
    { f: "stitched", label: "Ready stitched", n: totals.ready },
    ...(stock?.length ? [{ f: "oversold" as Filter, label: "Website shows more than our rule", n: (products ?? []).filter((p) => p.active && oversold(p) > 0).length }] : []),
  ];

  if (error) return <p className="error">Couldn&apos;t load inventory: {String(error.message ?? error)}</p>;
  if (!products) return <p className="empty">Loading inventory…</p>;

  return (
    <>
      <div className="page-head">
        <h1>Inventory</h1>
        <p>Each piece is in one place: waiting for fabric, unstitched stock, at stitching, or ready for dispatch — set against the orders not yet sent for stitching.</p>
      </div>
      <div className="inv-totals">
        <div>
          <span>Waiting for fabric</span>
          <b>{totals.production}</b>
        </div>
        <div>
          <span>Unstitched stock</span>
          <b>{totals.stock}</b>
        </div>
        <div>
          <span>At stitching</span>
          <b>{totals.stitching}</b>
        </div>
        <div>
          <span>Ready for dispatch</span>
          <b>{totals.ready}</b>
        </div>
        <div>
          <span>Designs short</span>
          <b className={totals.short ? "danger" : ""}>{totals.short}</b>
        </div>
      </div>

      <div className="toolbar">
        <label className="search">
          <span className="sr-only">Search designs</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search designs" type="search" />
        </label>
        <button className="btn ghost" onClick={() => setAdding("")}>
          + Add design
        </button>
      </div>
      {adding !== null && <ProductForm initialName={adding} onDone={() => setAdding(null)} />}

      <nav className="chips">
        {chips.map((c) => (
          <button key={c.f} className="chip" aria-current={filter === c.f ? "true" : undefined} onClick={() => setFilter(c.f)}>
            <b>{c.label}</b>
            {c.n !== undefined ? ` ${c.n}` : ""}
          </button>
        ))}
      </nav>

      {!list.length ? (
        <p className="empty">{filter === "attention" ? "Nothing is short or running low." : "No designs here."}</p>
      ) : (
        <div className="list inv-list">
          {list.map((p) => (
            <ProductCard key={p.id} p={p} pieces={pieces.get(p.id) ?? NO_PIECES} {...status(p)} shop={shop.byId.get(p.id)} over={oversold(p)} hasShopify={Boolean(stock?.length)} />
          ))}
        </div>
      )}

      {stock && !stock.length && (
        <p className="hint" style={{ marginTop: 18 }}>
          Shopify stock hasn&apos;t been read yet. Go to ☰ → Settings → Shopify and press Sync orders now; if it reports a missing
          permission, add read_products to the Rifah&apos;s Ops app in Shopify.
        </p>
      )}
      {shop.unmatched.length > 0 && (
        <div className="panel" style={{ marginTop: 22 }}>
          <h3>On Shopify, but not in inventory</h3>
          <p className="hint" style={{ marginTop: -6 }}>
            Live Shopify products that don&apos;t match any design here. Add them, or add the Shopify name as another spelling of an existing design.
          </p>
          <div className="untracked">
            {shop.unmatched.map((u) => (
              <div key={u.title} className="untracked-row">
                <div className="untracked-head">
                  <b>{u.title}</b>
                  <span className="meta">{u.total} available on Shopify</span>
                  <button className="link" onClick={() => setAdding(u.title)}>
                    Add to inventory
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {untracked.length > 0 && (
        <div className="panel" style={{ marginTop: 22 }}>
          <h3>Ordered, but not in inventory</h3>
          <p className="hint" style={{ marginTop: -6 }}>
            Open orders for designs that aren&apos;t tracked here yet. Add them, or add the name as another spelling of an existing design.
          </p>
          <div className="untracked">
            {untracked.map((u) => (
              <div key={u.title} className="untracked-row">
                <div className="untracked-head">
                  <b>{u.title}</b>
                  <span className="meta">{u.qty} waiting</span>
                  <button className="link" onClick={() => setAdding(u.title)}>
                    Add to inventory
                  </button>
                </div>
                <div className="link-row">
                  {u.orders.map((o) => (
                    <Link key={o.id} href={`/order?id=${o.id}`} className="link">
                      {o.order_number ?? o.customer_name}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

const NO_PIECES: Piece[] = [];

function ProductCard({ p, pieces, d, short, low, shop, over, hasShopify }: { p: Product; pieces: Piece[]; d?: Demand; short: number; low: boolean; shop?: Shop; over: number; hasShopify: boolean }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [newSize, setNewSize] = useState("");
  const run = async (changes: Parameters<typeof adjust>[1], reason: string) => {
    const r = await adjust(p, changes, reason);
    setErr(r.ok ? null : r.message);
  };
  const stitched = p.stitched.filter((r) => r.qty > 0).sort((a, b) => SIZES.indexOf(a.size) - SIZES.indexOf(b.size));

  return (
    <article className="card inv">
      <div className="row1">
        <div>
          <span className="name">{p.name}</span>
          {p.collection === "New" && <span className="flag intl" style={{ marginLeft: 8 }}>New</span>}
          {p.category !== "Suit set" && <span className="meta" style={{ marginLeft: 8 }}>{p.category}</span>}
        </div>
        <div style={{ textAlign: "right" }}>
          {short > 0 ? (
            <span className="flag late">Short by {short}</span>
          ) : low ? (
            <span className="flag express">Low</span>
          ) : null}
        </div>
      </div>
      {p.notes && <div className="meta" style={{ marginTop: 2 }}>{p.notes}</div>}

      <DesignTables p={p} pieces={pieces} />

      {adjusting && (
      <div className="inv-grid">
        <div className="counter" title="Ordered pieces not yet sent for stitching">
          <span>1 · Uncommitted orders</span>
          <b>{d?.waitingQty ?? 0}</b>
          {d && d.inWorkQty > 0 && <small>+{d.inWorkQty} already in work</small>}
        </div>
        <Counter label="2 · Waiting for fabric" value={p.in_production} onChange={(n) => run([{ field: "in_production", delta: n }], "Adjusted")} />
        <Counter label="3 · Unstitched stock" value={p.in_stock} onChange={(n) => run([{ field: "in_stock", delta: n }], "Adjusted")} />
        <Counter label="4 · At stitching" value={p.at_stitching} onChange={(n) => run([{ field: "at_stitching", delta: n }], "Adjusted")} />
        <div className="counter" title="Stitched pieces with us, by size (listed below)">
          <span>5 · Ready for dispatch</span>
          <b>{stitched.reduce((a, r) => a + r.qty, 0)}</b>
          <small>by size below</small>
        </div>
        <div className="counter" title="Uncommitted orders beyond the unstitched stock we hold">
          <span>6 · Short by</span>
          <b className={short > 0 ? "danger" : ""}>{short}</b>
          {short > 0 && <small>{p.in_production >= short ? "covered when fabric arrives" : `${short - p.in_production} not on order yet`}</small>}
        </div>
      </div>
      )}

      <div className="actions" style={{ marginTop: 10 }}>
        <button
          className="advance"
          disabled={p.in_production < 1}
          onClick={() => run([{ field: "in_production", delta: -1 }, { field: "in_stock", delta: 1 }], "Fabric arrived")}
          title="Move 1 from waiting for fabric to unstitched stock"
        >
          Fabric received
        </button>
        <button
          className="advance"
          disabled={p.in_stock < 1}
          onClick={() => run([{ field: "in_stock", delta: -1 }, { field: "at_stitching", delta: 1 }], "Sent to stitching unit")}
          title="Move 1 from unstitched stock to the stitching unit"
        >
          → Stitching
        </button>
        <button className="link" onClick={() => setAdjusting((a) => !a)}>
          {adjusting ? "Hide numbers" : "Adjust stock"}
        </button>
        <button className="link" onClick={() => setOpen((o) => !o)}>
          {open ? "Hide" : "Details"}
        </button>
        <button className="link" onClick={() => setEditing((e) => !e)}>
          Edit
        </button>
        {err && <span className="error">{err}</span>}
      </div>

      {hasShopify && (
        <div className="shop-row">
          <span className="meta">On Shopify:</span>
          {shop ? (
            <>
              {shop.sizes.map((z, i) => (
                <span key={i} className={`shop-size${(z.qty ?? 0) <= 0 ? " zero" : ""}`}>
                  {z.label} <b>{z.qty ?? "—"}</b>
                </span>
              ))}
              <span className="meta">total {shop.total}{shop.live ? "" : " · not live"}</span>
              <span className="meta">· by our rule each size should show {Math.max(p.in_stock - (d?.waitingQty ?? 0), 0)}</span>
              {over > 0 && <span className="flag late">{over} {over === 1 ? "size shows" : "sizes show"} more than that</span>}
            </>
          ) : (
            <span className="meta">no matching product</span>
          )}
        </div>
      )}
      <div className="row2" style={{ marginTop: 10 }}>
        <span className="meta">Ready for dispatch:</span>
        {stitched.length ? (
          stitched.map((r) => (
            <span key={r.size} className="size-chip">
              {r.size} ×{r.qty}
              <button aria-label={`One ${r.size} sold or used`} onClick={() => run([{ field: "stitched", delta: -1, size: r.size }], "Ready piece used / sold")}>
                −
              </button>
              <button aria-label={`One more ${r.size}`} onClick={() => run([{ field: "stitched", delta: 1, size: r.size }], "Ready piece added")}>
                +
              </button>
            </span>
          ))
        ) : (
          <span className="meta">none</span>
        )}
        <select value={newSize} onChange={(e) => setNewSize(e.target.value)} aria-label="Size" style={{ padding: "2px 4px" }}>
          <option value="">+ size</option>
          {SIZES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        {newSize && (
          <>
            <button
              className="link"
              onClick={() => {
                run(
                  p.at_stitching > 0
                    ? [{ field: "at_stitching", delta: -1 }, { field: "stitched", delta: 1, size: newSize }]
                    : [{ field: "stitched", delta: 1, size: newSize }],
                  p.at_stitching > 0 ? "Stitched piece back from the unit" : "Ready piece added",
                );
                setNewSize("");
              }}
            >
              {p.at_stitching > 0 ? `Stitched ${newSize} back` : `Add ${newSize}`}
            </button>
          </>
        )}
      </div>

      {open && <Details p={p} d={d} />}
      {editing && <ProductForm product={p} onDone={() => setEditing(false)} />}
    </article>
  );
}

function Counter({ label, value, onChange }: { label: string; value: number; onChange: (delta: number) => void }) {
  return (
    <div className="counter">
      <span>{label}</span>
      <div className="stepper">
        <button aria-label={`One less: ${label}`} disabled={value < 1} onClick={() => onChange(-1)}>
          −
        </button>
        <b>{value}</b>
        <button aria-label={`One more: ${label}`} onClick={() => onChange(1)}>
          +
        </button>
      </div>
    </div>
  );
}

function Details({ p, d }: { p: Product; d?: Demand }) {
  const { data: moves } = useMoves(p.id);
  const { data: people } = useTeam(true);
  const who = new Map((people ?? []).map((x) => [x.id, x.full_name || x.email.split("@")[0]]));
  const orders = [...(d?.waiting ?? []), ...(d?.inWork ?? [])];
  return (
    <div style={{ marginTop: 12, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
      {p.aliases.length > 0 && <p className="hint">Also matches: {p.aliases.join(", ")}</p>}
      <p className="hint" style={{ marginBottom: 6 }}>
        <b>Open orders for this design</b>
      </p>
      {orders.length ? (
        <div className="link-row">
          {orders.map((o) => (
            <Link key={o.id} href={`/order?id=${o.id}`} className="link">
              {o.order_number} {o.customer_name.split(" ")[0]} ({o.status})
            </Link>
          ))}
        </div>
      ) : (
        <p className="hint">None.</p>
      )}
      <p className="hint" style={{ marginBottom: 6 }}>
        <b>History</b>
      </p>
      <ul className="timeline">
        {(moves ?? []).map((m) => (
          <li key={m.id}>
            <time>
              {dateTime(m.created_at)} · {m.actor ? who.get(m.actor) ?? "Team" : "Import"}
            </time>
            {STOCK_LABEL[m.field]}
            {m.size ? ` ${m.size}` : ""} {m.delta > 0 ? `+${m.delta}` : m.delta}
            {m.reason ? ` · ${m.reason}` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}
