"use client";

import { useMemo, useState } from "react";
import { money } from "@/lib/format";
import { categoryTree, deleteCategory, deleteVendor, saveCategory, saveVendor, useExpenseCategories, useVendors } from "@/lib/money";
import { useExpenses } from "@/lib/store";
import type { ExpenseCategory, Vendor } from "@/lib/types";

function InlineAdd({ placeholder, label, onAdd }: { placeholder: string; label: string; onAdd: (name: string) => Promise<{ ok: boolean; message?: string }> }) {
  const [v, setV] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <form
      className="inline-add"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await onAdd(v);
        setErr(r.ok ? null : (r.message ?? "Couldn't save"));
        if (r.ok) setV("");
      }}
    >
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      <button className="btn small">{label}</button>
      {err && <span className="error">{err}</span>}
    </form>
  );
}

export function CategoryMaster({ canEdit }: { canEdit: boolean }) {
  const { data: cats } = useExpenseCategories();
  const { data: expenses } = useExpenses(canEdit);
  const tree = useMemo(() => categoryTree(cats), [cats]);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const used = (id: string) => (expenses ?? []).filter((e) => e.category_id === id);
  const Row = ({ c, child }: { c: ExpenseCategory; child?: boolean }) => {
    const u = used(c.id);
    return (
      <div className={`master-row${child ? " child" : ""}`}>
        {editing === c.id ? (
          <InlineAdd
            placeholder={c.name}
            label="Save"
            onAdd={async (name) => {
              const r = await saveCategory({ id: c.id, name: name || c.name });
              if (r.ok) setEditing(null);
              return r;
            }}
          />
        ) : (
          <>
            <span className="master-name">{c.name}</span>
            <span className="meta">{u.length ? `${u.length} expense${u.length === 1 ? "" : "s"} · ${money(u.reduce((a, e) => a + Number(e.amount), 0))}` : "not used yet"}</span>
            {canEdit && (
              <span className="master-actions">
                <button className="link" onClick={() => setEditing(c.id)}>
                  Rename
                </button>
                {!child && (
                  <button className="link" onClick={() => setAdding(adding === c.id ? null : c.id)}>
                    + Sub-category
                  </button>
                )}
                <button
                  className="link"
                  onClick={async () => {
                    if (!confirm(`Delete “${c.name}”?`)) return;
                    const r = await deleteCategory(c.id);
                    setErr(r.ok ? null : (r.message ?? null));
                  }}
                >
                  Delete
                </button>
              </span>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="panel">
      <h3>Expense categories</h3>
      <p className="hint" style={{ marginTop: -6 }}>
        These appear in the category list when adding an expense. A category can have sub-categories (e.g. Marketing › Ads).
      </p>
      {err && <p className="error">{err}</p>}
      {!cats ? (
        <p className="hint">Loading…</p>
      ) : (
        <div className="master-list">
          {tree.map((c) => (
            <div key={c.id}>
              <Row c={c} />
              {c.children.map((ch) => (
                <Row key={ch.id} c={ch} child />
              ))}
              {adding === c.id && (
                <div className="master-row child">
                  <InlineAdd
                    placeholder={`New sub-category under ${c.name}`}
                    label="Add"
                    onAdd={async (name) => {
                      const r = await saveCategory({ name, parent_id: c.id });
                      if (r.ok) setAdding(null);
                      return r;
                    }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {canEdit && (
        <div style={{ marginTop: 14 }}>
          <InlineAdd placeholder="New category" label="Add category" onAdd={(name) => saveCategory({ name })} />
        </div>
      )}
    </div>
  );
}

export function VendorMaster({ canEdit }: { canEdit: boolean }) {
  const { data: vendors } = useVendors();
  const { data: expenses } = useExpenses(canEdit);
  const [editing, setEditing] = useState<Vendor | "new" | null>(null);
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const list = (vendors ?? []).filter((v) => !q.trim() || [v.name, v.phone, v.notes].join(" ").toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <>
      <div className="toolbar">
        <label className="search">
          <span className="sr-only">Search vendors</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search vendors" />
        </label>
        {canEdit && (
          <button className="btn primary" onClick={() => setEditing("new")}>
            + Add vendor
          </button>
        )}
      </div>
      {editing && (
        <form
          className="panel"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const r = await saveVendor({
              id: editing === "new" ? undefined : editing.id,
              name: String(f.get("name") ?? ""),
              phone: String(f.get("phone") ?? ""),
              notes: String(f.get("notes") ?? ""),
            });
            setErr(r.ok ? null : (r.message ?? null));
            if (r.ok) setEditing(null);
          }}
        >
          <h3>{editing === "new" ? "Add a vendor" : "Edit vendor"}</h3>
          <div className="grid">
            <label className="field">
              <span>Name</span>
              <input name="name" required defaultValue={editing === "new" ? "" : editing.name} />
            </label>
            <label className="field">
              <span>Phone</span>
              <input name="phone" type="tel" defaultValue={editing === "new" ? "" : editing.phone} />
            </label>
            <label className="field full">
              <span>Notes</span>
              <input name="notes" defaultValue={editing === "new" ? "" : editing.notes} placeholder="What they supply, GST no., payment terms…" />
            </label>
          </div>
          <div className="form-actions">
            <button type="button" className="btn ghost" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button className="btn primary">Save</button>
          </div>
        </form>
      )}
      {err && <p className="error">{err}</p>}
      <div className="panel" style={{ padding: 0 }}>
        <div className="scroll-x">
          <table className="t stack">
            <thead>
              <tr>
                <th>Vendor</th>
                <th>Phone</th>
                <th>Notes</th>
                <th className="n">Paid so far</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {!vendors ? (
                <tr>
                  <td className="hint">Loading…</td>
                </tr>
              ) : !list.length ? (
                <tr>
                  <td className="hint">No vendors yet. Add one here, or just type a new name when adding an expense.</td>
                </tr>
              ) : (
                list.map((v) => {
                  const u = (expenses ?? []).filter((e) => e.vendor_id === v.id);
                  return (
                    <tr key={v.id}>
                      <td className="stack-title">{v.name}</td>
                      <td data-label="Phone">{v.phone}</td>
                      <td className="hint" data-label="Notes">
                        {v.notes}
                      </td>
                      <td className="n" data-label="Paid so far">
                        {u.length ? `${money(u.reduce((a, e) => a + Number(e.amount), 0))} (${u.length})` : "—"}
                      </td>
                      <td className="stack-actions">
                        {canEdit && (
                          <>
                            <button className="link" onClick={() => setEditing(v)}>
                              Edit
                            </button>{" "}
                            <button
                              className="link"
                              onClick={async () => {
                                if (!confirm(`Delete vendor “${v.name}”?`)) return;
                                const r = await deleteVendor(v.id);
                                setErr(r.ok ? null : (r.message ?? null));
                              }}
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
