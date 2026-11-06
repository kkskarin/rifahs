"use client";

import { useState } from "react";
import { saveProduct } from "@/lib/inventory";
import { useMe } from "@/lib/store";
import type { Product } from "@/lib/types";

export default function ProductForm({ product, initialName = "", onDone }: { product?: Product; initialName?: string; onDone: () => void }) {
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
