"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { REASON_LABEL, dismissGroup, mergeCustomers, unmergeCustomer, useCustomers, type Customer, type MergeGroup } from "@/lib/customers";
import { money, shortDate } from "@/lib/format";
import { useCan } from "@/lib/perms";
import { useMe } from "@/lib/store";

type Col = "name" | "phone" | "email" | "city" | "orders" | "total" | "last";
const COLS: { key: Col; label: string; num?: boolean }[] = [
  { key: "name", label: "Customer" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "city", label: "City" },
  { key: "orders", label: "Orders", num: true },
  { key: "total", label: "Spent", num: true },
  { key: "last", label: "Last order" },
];

export default function CustomersPage() {
  const { can } = useCan();
  const view = useSearchParams().get("v") === "merge" ? "merge" : "all";
  const data = useCustomers();
  if (!can("see_contact")) return <p className="empty">Your role doesn&apos;t include customer details. Ask the owner if you need it.</p>;
  if (!data.ready) return <p className="empty">Loading…</p>;
  return view === "merge" ? <MergeView groups={data.groups} /> : <AllView customers={data.customers} />;
}

function AllView({ customers }: { customers: Customer[] }) {
  const { can } = useCan();
  const showMoney = can("see_amounts");
  const canEdit = can("edit_orders");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ col: Col; dir: 1 | -1 }>({ col: "last", dir: -1 });
  const [limit, setLimit] = useState(100);
  const [msg, setMsg] = useState<string | null>(null);

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    const rows = n ? customers.filter((c) => [c.name, ...c.names, c.phone, ...c.phones, c.email, c.city].join(" ").toLowerCase().includes(n)) : customers;
    const val = (c: Customer): string | number => (sort.col === "orders" ? c.orders : sort.col === "total" ? c.total : (c[sort.col] ?? "").toString().toLowerCase());
    return [...rows].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      // Blanks always go last, whichever way the column is sorted.
      if (x === "" && y !== "") return 1;
      if (y === "" && x !== "") return -1;
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir || b.last.localeCompare(a.last);
    });
  }, [customers, q, sort]);
  const cols = COLS.filter((c) => c.key !== "total" || showMoney);
  const repeat = customers.filter((c) => c.orders > 1).length;
  // First click on a column: A–Z for text, highest first for numbers and dates.
  const click = (col: Col) => setSort((s) => (s.col === col ? { col, dir: s.dir === 1 ? -1 : 1 } : { col, dir: col === "orders" || col === "total" || col === "last" ? -1 : 1 }));

  return (
    <>
      <section className="stats" aria-label="Summary">
        <div className="stat">
          <div className="label">Customers</div>
          <div className="value">{customers.length}</div>
        </div>
        <div className="stat">
          <div className="label">Ordered more than once</div>
          <div className="value accent">{repeat}</div>
        </div>
      </section>
      <p className="hint">Worked out from the orders in Core. Cancelled and refunded orders are not counted as orders. Click a column heading to sort by it.</p>
      <div className="toolbar">
        <label className="search">
          <span className="sr-only">Search customers</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone, email, city" />
        </label>
      </div>
      {msg && <p className="success">{msg}</p>}

      {!shown.length ? (
        <p className="empty">No customers match.</p>
      ) : (
        <div className="panel" style={{ padding: 0 }}>
          <div className="scroll-x">
            <table className="t stack">
              <thead>
                <tr>
                  {cols.map((c) => (
                    <th key={c.key} className={c.num ? "n" : undefined} aria-sort={sort.col === c.key ? (sort.dir === 1 ? "ascending" : "descending") : undefined}>
                      <button className="th-sort" onClick={() => click(c.key)}>
                        {c.label}
                        <span aria-hidden>{sort.col === c.key ? (sort.dir === 1 ? " ▲" : " ▼") : ""}</span>
                      </button>
                    </th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.slice(0, limit).map((c) => (
                  <tr key={c.key}>
                    <td className="stack-title">
                      {c.name}
                      {c.names.length > 1 && <div className="meta">also: {c.names.filter((x) => x !== c.name).join(", ")}</div>}
                      {c.keys.length > 1 && (
                        <div className="meta">
                          {c.keys.length} records merged
                          {canEdit && (
                            <>
                              {" · "}
                              <button className="link" onClick={async () => confirm(`Separate ${c.name} back into ${c.keys.length} customers?`) && setMsg((await unmergeCustomer(c)).message ?? null)}>
                                Unmerge
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </td>
                    <td data-label="Phone">{c.phone ? <a href={`tel:${c.phone}`}>{c.phone}</a> : <span className="meta">—</span>}</td>
                    <td data-label="Email">{c.email || <span className="meta">—</span>}</td>
                    <td data-label="City">{c.city || <span className="meta">—</span>}</td>
                    <td className="n" data-label="Orders">
                      {c.orders}
                    </td>
                    {showMoney && (
                      <td className="n" data-label="Spent">
                        {money(c.total)}
                      </td>
                    )}
                    <td data-label="Last order">{shortDate(c.last)}</td>
                    <td className="stack-actions">
                      <Link className="link" href={`/orders?${new URLSearchParams({ f: "all", q: c.phones[0] || c.email || c.name })}`}>
                        Orders
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {shown.length > limit && (
        <div className="form-actions" style={{ justifyContent: "center" }}>
          <button className="btn ghost" onClick={() => setLimit((l) => l + 200)}>
            Show more ({shown.length - limit} left)
          </button>
        </div>
      )}
    </>
  );
}

function MergeView({ groups }: { groups: MergeGroup[] }) {
  const { can } = useCan();
  const canEdit = can("edit_orders");
  const involved = groups.reduce((a, g) => a + g.members.length, 0);
  return (
    <>
      <p className="hint" style={{ marginTop: 0 }}>
        Customers that look like the same person: first by <b>mobile number</b>, then by <b>similar address</b> (same PIN code and street), then by{" "}
        <b>name</b>. Choose which record to keep and merge, or say they are different people. Merging here changes how Core lists them; it can be
        undone from All Customers, and it does not change Shopify&apos;s customer records.
      </p>
      {!groups.length ? (
        <p className="empty">No customers to merge.</p>
      ) : (
        <p className="hint">
          {involved} customers in {groups.length} group{groups.length === 1 ? "" : "s"}.
        </p>
      )}
      {(["mobile", "address", "name"] as const).map((reason) => {
        const list = groups.filter((g) => g.reason === reason);
        if (!list.length) return null;
        return (
          <section key={reason}>
            <h3 style={{ margin: "22px 0 10px" }}>
              {REASON_LABEL[reason]} <span className="meta">· {list.length}</span>
            </h3>
            {list.map((g) => (
              <GroupCard key={g.signature} g={g} canEdit={canEdit} />
            ))}
          </section>
        );
      })}
    </>
  );
}

function GroupCard({ g, canEdit }: { g: MergeGroup; canEdit: boolean }) {
  const { data: me } = useMe();
  const [keep, setKeep] = useState(g.members[0].key);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async (fn: () => Promise<{ ok: boolean; message?: string }>) => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    setErr(r.ok ? null : (r.message ?? "Couldn't save"));
  };
  return (
    <div className="panel merge-card">
      <div className="master-list">
        {g.members.map((c) => (
          <label key={c.key} className="master-row" style={{ cursor: canEdit ? "pointer" : undefined }}>
            {canEdit && <input type="radio" name={g.signature} checked={keep === c.key} onChange={() => setKeep(c.key)} aria-label={`Keep ${c.name}`} />}
            <span className="master-name">
              {c.name}
              {keep === c.key && canEdit ? <span className="flag intl" style={{ marginLeft: 8 }}>Keep</span> : null}
            </span>
            <span className="meta">
              {[c.phone, c.email, c.address || c.city].filter(Boolean).join(" · ")} · {c.orders} order{c.orders === 1 ? "" : "s"} · last {shortDate(c.last)}
            </span>
          </label>
        ))}
      </div>
      {err && <p className="error">{err}</p>}
      {canEdit && me && (
        <div className="form-actions">
          <button className="link" disabled={busy} onClick={() => run(() => dismissGroup(g.signature, me.id))}>
            Different people
          </button>
          <button
            className="btn primary small"
            disabled={busy}
            onClick={() => run(() => mergeCustomers(g.members.find((c) => c.key === keep)!, g.members.filter((c) => c.key !== keep), me.id))}
          >
            Merge {g.members.length} into one
          </button>
        </div>
      )}
    </div>
  );
}
