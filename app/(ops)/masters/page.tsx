"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { CategoryMaster, VendorMaster } from "@/components/MoneyMasters";
import { mutate } from "swr";
import ProductForm from "@/components/ProductForm";
import { useProducts } from "@/lib/inventory";
import { useCan } from "@/lib/perms";
import { useMe } from "@/lib/store";
import { sb } from "@/lib/supabase-browser";
import type { Product } from "@/lib/types";

export default function MastersPage() {
  const { data: me } = useMe();
  const { data: products } = useProducts();
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Product | "new" | null>(null);

  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (products ?? [])
      .filter((p) => (showArchived ? !p.active : p.active))
      .filter((p) => !n || [p.name, ...p.aliases, p.notes, p.category, p.collection].join(" ").toLowerCase().includes(n));
  }, [products, q, showArchived]);

  const setActive = async (p: Product, active: boolean) => {
    await sb().from("products").update({ active }).eq("id", p.id);
    mutate("products");
  };

  const tab = useSearchParams().get("m") ?? "designs";
  const { can } = useCan();
  const admin = can("edit_masters");
  const money = can("purchase");
  const TABS = [
    { key: "designs", label: "Designs" },
    ...(money ? [{ key: "categories", label: "Expense categories" }] : []),
    { key: "vendors", label: "Vendors" },
  ];
  const head = (
    <>
      <div className="page-head">
        <h1>Masters</h1>
        <p>The lists everything else picks from: designs, expense categories and vendors.</p>
      </div>
      <nav className="tabs" aria-label="Masters">
        {TABS.map((t) => (
          <Link key={t.key} href={`/masters?m=${t.key}`} className="tab" aria-current={tab === t.key ? "page" : undefined} replace scroll={false}>
            {t.label}
          </Link>
        ))}
      </nav>
    </>
  );
  if (tab === "categories" && money) return <>{head}<CategoryMaster canEdit={admin} /></>;
  if (tab === "vendors") return <>{head}<VendorMaster canEdit={admin} /></>;

  return (
    <>
      {head}
      <div className="toolbar">
        <label className="search">
          <span className="sr-only">Search designs</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search designs, spellings, notes" />
        </label>
        <button className="btn primary" onClick={() => setEditing("new")}>
          + Add design
        </button>
      </div>
      {editing && <ProductForm product={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} />}

      <nav className="chips">
        <button className="chip" aria-current={!showArchived ? "true" : undefined} onClick={() => setShowArchived(false)}>
          <b>Designs</b> {(products ?? []).filter((p) => p.active).length}
        </button>
        <button className="chip" aria-current={showArchived ? "true" : undefined} onClick={() => setShowArchived(true)}>
          <b>Archived</b> {(products ?? []).filter((p) => !p.active).length}
        </button>
      </nav>

      <div className="panel" style={{ padding: 0 }}>
        <div className="scroll-x">
          <table className="t stack">
            <thead>
              <tr>
                <th>Design</th>
                <th>Other spellings</th>
                <th>Type</th>
                <th>Collection</th>
                <th className="n">Warn at</th>
                <th>Notes</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {!products ? (
                <tr>
                  <td colSpan={7} className="hint">
                    Loading…
                  </td>
                </tr>
              ) : (
                list.map((p) => (
                  <tr key={p.id}>
                    <td className="stack-title">
                      <b>{p.name}</b>
                    </td>
                    <td className="hint" data-label="Other spellings">{p.aliases.join(", ")}</td>
                    <td data-label="Type">{p.category}</td>
                    <td data-label="Collection">{p.collection}</td>
                    <td className="n" data-label="Warn at">{p.low_at}</td>
                    <td className="hint" data-label="Notes">{p.notes}</td>
                    <td className="stack-actions">
                      <button className="link" onClick={() => setEditing(p)}>
                        Edit
                      </button>{" "}
                      {me && admin && (
                        <button className="link" onClick={() => setActive(p, !p.active)}>
                          {p.active ? "Archive" : "Restore"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
