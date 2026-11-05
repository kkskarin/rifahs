"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { dateTime } from "@/lib/format";
import { adjust, demandByProduct, saveProduct, useMoves, useProducts, type Demand } from "@/lib/inventory";
import { useMe, useOrders, useTeam } from "@/lib/store";
import { STOCK_LABEL, type Product, type StockField } from "@/lib/types";

type Filter = "attention" | "all" | "Current" | "New" | "accessories" | "stitched";
const SIZES = ["XS", "S", "M", "L", "XL", "XXL", "3XL", "Free size"];

export default function InventoryPage() {
  const { data: products, error } = useProducts();
  const { data: orders } = useOrders();
  const [filter, setFilter] = useState<Filter>("attention");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState<string | null>(null); // prefilled name, "" = blank

  const { demand, untracked } = useMemo(() => demandByProduct(products, orders), [products, orders]);

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
        return true;
      })
      .sort((a, b) => status(b).short - status(a).short || a.name.localeCompare(b.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, demand, filter, q]);

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
  ];

  if (error) return <p className="error">Couldn&apos;t load inventory: {String(error.message ?? error)}</p>;
  if (!products) return <p className="empty">Loading inventory…</p>;

  return (
    <>
      <div className="inv-totals">
        <div>
          <span>Fabric in stock</span>
          <b>{totals.stock}</b>
        </div>
        <div>
          <span>At stitching unit</span>
          <b>{totals.stitching}</b>
        </div>
        <div>
          <span>In production</span>
          <b>{totals.production}</b>
        </div>
        <div>
          <span>Ready stitched</span>
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
        <div className="list">
          {list.map((p) => (
            <ProductCard key={p.id} p={p} {...status(p)} />
          ))}
        </div>
      )}

      {untracked.length > 0 && (
        <div className="panel" style={{ marginTop: 22 }}>
          <h3>Ordered, but not in inventory</h3>
          <p className="hint" style={{ marginTop: -6 }}>
            Open orders for designs that aren&apos;t tracked here yet. Add them, or add the name as another spelling of an existing design.
          </p>
          <table className="t">
            <tbody>
              {untracked.map((u) => (
                <tr key={u.title}>
                  <td>{u.title}</td>
                  <td className="n">{u.qty} waiting</td>
                  <td className="hint">
                    {u.orders.map((o) => (
                      <Link key={o.id} href={`/order?id=${o.id}`} className="link" style={{ marginRight: 8 }}>
                        {o.order_number ?? o.customer_name}
                      </Link>
                    ))}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <button className="link" onClick={() => setAdding(u.title)}>
                      Add
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function ProductCard({ p, d, short, low }: { p: Product; d?: Demand; short: number; low: boolean }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
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

      <div className="inv-grid">
        <Counter label="Fabric in stock" value={p.in_stock} onChange={(n) => run([{ field: "in_stock", delta: n }], "Adjusted")} />
        <Counter label="At stitching" value={p.at_stitching} onChange={(n) => run([{ field: "at_stitching", delta: n }], "Adjusted")} />
        <Counter label="In production" value={p.in_production} onChange={(n) => run([{ field: "in_production", delta: n }], "Adjusted")} />
        <div className="counter">
          <span>Orders waiting</span>
          <b className={short > 0 ? "danger" : ""}>{d?.waitingQty ?? 0}</b>
          {d && d.inWorkQty > 0 && <small>+{d.inWorkQty} in work</small>}
        </div>
      </div>

      <div className="actions" style={{ marginTop: 10 }}>
        <button
          className="advance"
          disabled={p.in_stock < 1}
          onClick={() => run([{ field: "in_stock", delta: -1 }, { field: "at_stitching", delta: 1 }], "Sent to stitching unit")}
          title="Move 1 from fabric in stock to the stitching unit"
        >
          → Stitching
        </button>
        <button
          className="advance"
          disabled={p.in_production < 1}
          onClick={() => run([{ field: "in_production", delta: -1 }, { field: "in_stock", delta: 1 }], "Fabric arrived")}
          title="Move 1 from in production to fabric in stock"
        >
          Fabric arrived
        </button>
        <button className="link" onClick={() => setOpen((o) => !o)}>
          {open ? "Hide" : "Details"}
        </button>
        <button className="link" onClick={() => setEditing((e) => !e)}>
          Edit
        </button>
        {err && <span className="error">{err}</span>}
      </div>

      <div className="row2" style={{ marginTop: 10 }}>
        <span className="meta">Ready stitched:</span>
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
        <p>
          {orders.map((o) => (
            <Link key={o.id} href={`/order?id=${o.id}`} className="link" style={{ marginRight: 10 }}>
              {o.order_number} {o.customer_name.split(" ")[0]} ({o.status})
            </Link>
          ))}
        </p>
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

function ProductForm({ product, initialName = "", onDone }: { product?: Product; initialName?: string; onDone: () => void }) {
  const { data: me } = useMe();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <form
      className="panel"
      style={{ marginTop: 12 }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!me) return;
        const f = new FormData(e.currentTarget);
        const v = (k: string) => String(f.get(k) ?? "");
        const r = await saveProduct(me, product ?? null, {
          name: v("name"),
          aliases: v("aliases"),
          category: v("category"),
          collection: v("collection"),
          low_at: v("low_at"),
          notes: v("notes"),
        });
        if (r.ok) onDone();
        else setMsg(r.message);
      }}
    >
      <h3>{product ? "Edit design" : "Add a design"}</h3>
      <div className="grid">
        <label className="field">
          <span>Name</span>
          <input name="name" required defaultValue={product?.name ?? initialName} />
        </label>
        <label className="field">
          <span>Other spellings (comma separated)</span>
          <input name="aliases" defaultValue={product?.aliases.join(", ")} placeholder="Skyloom, Sky loom unstitched" />
        </label>
        <label className="field">
          <span>Type</span>
          <select name="category" defaultValue={product?.category ?? "Suit set"}>
            {["Suit set", "Dupatta", "Pants", "Other"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Collection</span>
          <select name="collection" defaultValue={product?.collection ?? "Current"}>
            {["Current", "New", "Old"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Warn when stock is at or below</span>
          <input name="low_at" type="number" min={0} defaultValue={product?.low_at ?? 3} />
        </label>
        <label className="field full">
          <span>Notes</span>
          <input name="notes" defaultValue={product?.notes} placeholder="Colour, fabric, vendor…" />
        </label>
      </div>
      {msg && <p className="error">{msg}</p>}
      <div className="form-actions">
        <button type="button" className="btn ghost" onClick={onDone}>
          Cancel
        </button>
        <button className="btn primary">{product ? "Save" : "Add design"}</button>
      </div>
    </form>
  );
}
