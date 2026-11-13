"use client";

import type { OrderStatus, Product } from "@/lib/types";

/** One ordered piece of this design: its size and where its order stands. */
export type Piece = { status: OrderStatus; size: string | null; qty: number; placed_at: string };

// Unstitched first: it is the main stock.
const COLS = ["Unstitched", "XS", "S", "M", "L", "XL", "XXL", "3XL", "Other"] as const;
type Col = (typeof COLS)[number];
type Row = { label: string; cells: Partial<Record<Col, number>>; tone?: "bad" | "wait" };

export function sizeCol(raw: string | null | undefined): Col {
  const s = (raw ?? "").split("/").pop()!.trim().toUpperCase();
  if (s === "XXXL") return "3XL";
  if (s === "2XL") return "XXL";
  if (s === "UNSTITCHED") return "Unstitched";
  return (COLS as readonly string[]).includes(s) ? (s as Col) : "Other";
}

const add = (row: Row, col: Col, n: number) => {
  if (n) row.cells[col] = (row.cells[col] ?? 0) + n;
};

/** The three tables for a design — Stock, Orders, Dispatched — each split by size. */
export default function DesignTables({ p, pieces }: { p: Product; pieces: Piece[] }) {
  const at = (statuses: OrderStatus[]) => pieces.filter((x) => statuses.includes(x.status));

  // ── Orders: every open ordered piece, by how far it has got ──
  const notAvailable: Row = { label: "Fabric not available", cells: {}, tone: "bad" };
  const waitingFabric: Row = { label: "Waiting for fabric", cells: {}, tone: "wait" };
  const toSend: Row = { label: "To send for stitching", cells: {} };
  // Hand out the unstitched stock we hold to the oldest orders first, then the fabric that is on its way.
  let inHand = p.in_stock;
  let coming = p.in_production;
  for (const x of at(["new", "printing"]).sort((a, b) => a.placed_at.localeCompare(b.placed_at))) {
    const a = Math.min(inHand, x.qty);
    const b = Math.min(coming, x.qty - a);
    inHand -= a;
    coming -= b;
    add(toSend, sizeCol(x.size), a);
    add(waitingFabric, sizeCol(x.size), b);
    add(notAvailable, sizeCol(x.size), x.qty - a - b);
  }
  const byStatus = (label: string, statuses: OrderStatus[]): Row => {
    const row: Row = { label, cells: {} };
    for (const x of at(statuses)) add(row, sizeCol(x.size), x.qty);
    return row;
  };
  const stitching = byStatus("At stitching", ["stitching"]);
  const orders = [notAvailable, waitingFabric, toSend, stitching, byStatus("QC & packing", ["checking"]), byStatus("Ready to dispatch", ["ready"])];

  // ── Stock: every physical piece, by where it is ──
  const stitchingSized = Object.values(stitching.cells).reduce((a, n) => a + (n ?? 0), 0);
  const atUnit: Row = { label: "At stitching", cells: { ...stitching.cells } };
  add(atUnit, "Unstitched", Math.max(p.at_stitching - stitchingSized, 0));
  const withUs: Row = { label: "With us", cells: {} };
  add(withUs, "Unstitched", p.in_stock);
  for (const r of p.stitched) add(withUs, sizeCol(r.size), r.qty);
  const stock = [{ label: "Waiting for fabric", cells: p.in_production ? { Unstitched: p.in_production } : {}, tone: "wait" } as Row, withUs, atUnit];

  // ── Dispatched ──
  const dispatched = [byStatus("On the way", ["dispatched"]), byStatus("Delivered", ["delivered"])];

  const used = COLS.filter((c) => [...stock, ...orders, ...dispatched].some((r) => r.cells[c]) || (c !== "Other" && c !== "XS" && c !== "3XL"));
  return (
    <div className="design-tables">
      <Table title="Stock" rows={stock} cols={used} keepEmpty />
      <Table title="Orders" rows={orders} cols={used} />
      <Table title="Dispatched" rows={dispatched} cols={used} />
    </div>
  );
}

function Table({ title, rows, cols, keepEmpty }: { title: string; rows: Row[]; cols: Col[]; keepEmpty?: boolean }) {
  const total = (r: Row) => Object.values(r.cells).reduce((a, n) => a + (n ?? 0), 0);
  const shown = keepEmpty ? rows : rows.filter((r) => total(r) > 0);
  const colTotal = (c: Col) => rows.reduce((a, r) => a + (r.cells[c] ?? 0), 0);
  return (
    <div className="scroll-x">
      <table className="t sizes">
        <thead>
          <tr>
            <th>{title}</th>
            {cols.map((c) => (
              <th key={c} className="n">
                {c === "Unstitched" ? "Unst" : c}
              </th>
            ))}
            <th className="n">All</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.label} className={r.tone ?? ""}>
              <td>{r.label}</td>
              {cols.map((c) => (
                <td key={c} className="n">
                  {r.cells[c] || <span className="nil">·</span>}
                </td>
              ))}
              <td className="n">
                <b>{total(r)}</b>
              </td>
            </tr>
          ))}
          {!shown.length && (
            <tr>
              <td colSpan={cols.length + 2} className="nil">
                None
              </td>
            </tr>
          )}
          {shown.length > 1 && (
            <tr className="sum">
              <td>Total</td>
              {cols.map((c) => (
                <td key={c} className="n">
                  {colTotal(c) || <span className="nil">·</span>}
                </td>
              ))}
              <td className="n">
                <b>{rows.reduce((a, r) => a + total(r), 0)}</b>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
