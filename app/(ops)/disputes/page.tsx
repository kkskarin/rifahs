"use client";

import Link from "next/link";
import SalesNav from "@/components/SalesNav";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { dateTime, itemsLine } from "@/lib/format";
import { addIssueUpdate, saveIssue, setIssueStatus, useIssues, useMe, useOrders, useTeam } from "@/lib/store";
import { COURIERS, DISPUTE_KINDS, type Issue, type IssueStatus, type Order, type Profile } from "@/lib/types";

type Cat = "shipping" | "customer";
const STATUS_TEXT: Record<IssueStatus, string> = { open: "Open", waiting: "Waiting", resolved: "Closed" };
const STATUS_PILL: Record<IssueStatus, string> = { open: "new", waiting: "ready", resolved: "delivered" };

export default function DisputesPage() {
  const cat = (useSearchParams().get("t") === "customer" ? "customer" : "shipping") as Cat;
  const { data: issues } = useIssues();
  const { data: orders } = useOrders();
  const { data: me } = useMe();
  const { data: people } = useTeam(true);
  const [show, setShow] = useState<"open" | "closed">("open");
  const [raising, setRaising] = useState(false);
  const [q, setQ] = useState("");

  const orderById = useMemo(() => new Map((orders ?? []).map((o) => [o.id, o])), [orders]);
  const who = useMemo(() => new Map((people ?? []).map((p) => [p.id, p.full_name || p.email.split("@")[0]])), [people]);
  const count = (c: Cat) => (issues ?? []).filter((i) => i.category === c && i.status !== "resolved").length;

  const list = (issues ?? [])
    .filter((i) => i.category === cat && (show === "open" ? i.status !== "resolved" : i.status === "resolved"))
    .filter((i) => {
      const n = q.trim().toLowerCase().replace(/^#/, "");
      if (!n) return true;
      const o = i.order_id ? orderById.get(i.order_id) : null;
      return [i.title, i.details, i.tracking_number, o?.order_number, o?.customer_name, o?.customer_phone].filter(Boolean).join(" ").toLowerCase().includes(n);
    });

  return (
    <>
      <SalesNav />
      <p className="hint" style={{ marginTop: 0 }}>Courier problems and customer complaints, from the moment they&apos;re raised until they&apos;re closed.</p>
      <div className="subnav-row actions-only">
        <span className="hint" style={{ margin: "0 auto 8px 0" }}>
          {count(cat)} open {cat === "shipping" ? "shipping" : "customer"} dispute{count(cat) === 1 ? "" : "s"}
        </span>
        <button className="btn primary small" onClick={() => setRaising((r) => !r)}>
          + Raise dispute
        </button>
      </div>

      {raising && me && <RaiseForm key={cat} cat={cat} me={me} orders={orders ?? []} onDone={() => setRaising(false)} />}

      <div className="toolbar">
        <label className="search">
          <span className="sr-only">Search disputes</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search order #, customer, phone, AWB" />
        </label>
        <div className="seg" role="group" aria-label="Show">
          <button aria-pressed={show === "open"} onClick={() => setShow("open")}>
            Open
          </button>
          <button aria-pressed={show === "closed"} onClick={() => setShow("closed")}>
            Closed
          </button>
        </div>
      </div>

      {!issues ? (
        <p className="empty">Loading…</p>
      ) : !list.length ? (
        <p className="empty">{show === "open" ? `No open ${cat} disputes.` : "Nothing closed yet."}</p>
      ) : (
        <div className="list dispute-list">
          {list.map((i) => (
            <DisputeCard key={i.id} i={i} o={i.order_id ? orderById.get(i.order_id) : undefined} me={me ?? null} who={who} />
          ))}
        </div>
      )}
    </>
  );
}

function DisputeCard({ i, o, me, who }: { i: Issue; o?: Order; me: Profile | null; who: Map<string, string> }) {
  const [text, setText] = useState("");
  const [history, setHistory] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const updates = [...(i.updates ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const latest = updates[0];
  const addr = o?.ship_address as Record<string, string | null> | null | undefined;
  const address = addr ? [addr.address1, addr.address2, addr.city, addr.province, addr.zip].filter(Boolean).join(", ") : o?.ship_city;
  const courier = i.courier || o?.courier;
  const awb = i.tracking_number || o?.tracking_number;

  return (
    <article className="card dispute">
      <div className="row1">
        <span className="name">{i.title}</span>
        <span className={`pill ${STATUS_PILL[i.status]}`}>{STATUS_TEXT[i.status]}</span>
      </div>
      <dl className="facts">
        <div>
          <dt>Order ID</dt>
          <dd>{o ? <Link href={`/order?id=${o.id}`}>{o.order_number ?? "Open order"}</Link> : "—"}</dd>
        </div>
        <div>
          <dt>Customer</dt>
          <dd>{o?.customer_name ?? "—"}</dd>
        </div>
        <div>
          <dt>Phone</dt>
          <dd>{o?.customer_phone ? <a href={`tel:${o.customer_phone.replace(/\s/g, "")}`}>{o.customer_phone}</a> : "—"}</dd>
        </div>
        <div>
          <dt>{(o?.items.length ?? 0) > 1 ? "Products" : "Product"}</dt>
          <dd>{o ? itemsLine(o.items) || "—" : "—"}</dd>
        </div>
        {i.category === "shipping" && (
          <div>
            <dt>Courier · AWB</dt>
            <dd>{[courier, awb].filter(Boolean).join(" · ") || "—"}</dd>
          </div>
        )}
        {(address || o?.customer_email) && (
          <div className="wide">
            <dt>Other details</dt>
            <dd>{[address, o?.customer_email].filter(Boolean).join(" · ")}</dd>
          </div>
        )}
        <div className="wide">
          <dt>Latest issue</dt>
          <dd>
            {latest ? latest.message : i.details || i.title}
            <span className="meta">
              {" "}
              · {dateTime(latest?.created_at ?? i.created_at)}
              {latest?.actor ? ` · ${who.get(latest.actor) ?? "Team"}` : ""}
            </span>
          </dd>
        </div>
      </dl>
      <span className="meta">
        {i.kind} · raised {dateTime(i.created_at)}
        {i.resolved_at ? ` · closed ${dateTime(i.resolved_at)}` : ""}
      </span>

      {me && i.status !== "resolved" && (
        <form
          className="inline-add"
          style={{ marginTop: 10 }}
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await addIssueUpdate(me, i.id, text);
            setErr(r.ok ? null : (r.message ?? null));
            if (r.ok) setText("");
          }}
        >
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add an update — what happened, what was promised" aria-label="Update" />
          <button className="btn small">Update</button>
        </form>
      )}
      {err && <p className="error">{err}</p>}
      <div className="actions">
        {i.status !== "resolved" && (
          <button className="advance" onClick={() => setIssueStatus(i.id, "resolved")}>
            Close ✓
          </button>
        )}
        {i.status === "open" && (
          <button className="link" onClick={() => setIssueStatus(i.id, "waiting")}>
            Mark waiting {i.category === "shipping" ? "on courier" : "on customer"}
          </button>
        )}
        {i.status !== "open" && (
          <button className="link" onClick={() => setIssueStatus(i.id, "open")}>
            Reopen
          </button>
        )}
        {(updates.length > 1 || (updates.length === 1 && i.details)) && (
          <button className="link" onClick={() => setHistory((h) => !h)}>
            {history ? "Hide history" : `History (${updates.length + (i.details ? 1 : 0)})`}
          </button>
        )}
      </div>
      {history && (
        <ul className="timeline" style={{ marginTop: 8 }}>
          {updates.map((u) => (
            <li key={u.id}>
              <time>
                {dateTime(u.created_at)} · {u.actor ? who.get(u.actor) ?? "Team" : "Team"}
              </time>
              {u.message}
            </li>
          ))}
          {i.details && (
            <li>
              <time>{dateTime(i.created_at)} · raised</time>
              {i.details}
            </li>
          )}
        </ul>
      )}
    </article>
  );
}

function RaiseForm({ cat, me, orders, onDone }: { cat: Cat; me: Profile; orders: Order[]; onDone: () => void }) {
  const [ref, setRef] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const match = orders.find((o) => o.order_number === `#${ref.replace(/^#/, "").trim()}`);
  return (
    <form
      className="panel"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const v = (k: string) => String(f.get(k) ?? "").trim();
        setBusy(true);
        const r = await saveIssue(me, orders, {
          title: v("title"),
          kind: v("kind"),
          courier: v("courier") || match?.courier || null,
          tracking_number: v("tracking_number") || match?.tracking_number || null,
          details: v("details"),
          order_ref: ref,
          category: cat,
        });
        setBusy(false);
        if (r.ok) onDone();
        else setMsg(r.message ?? "Couldn't save");
      }}
    >
      <h3>Raise a {cat} dispute</h3>
      <div className="grid">
        <label className="field">
          <span>Order #</span>
          <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="1262" inputMode="numeric" required />
        </label>
        <label className="field">
          <span>Type</span>
          <select name="kind">
            {DISPUTE_KINDS[cat].map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </label>
        {cat === "shipping" && (
          <>
            <label className="field">
              <span>Courier</span>
              <input name="courier" list="couriers-d" key={match?.id} defaultValue={match?.courier ?? ""} />
              <datalist id="couriers-d">
                {COURIERS.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>
            <label className="field">
              <span>AWB</span>
              <input name="tracking_number" key={match?.id} defaultValue={match?.tracking_number ?? ""} />
            </label>
          </>
        )}
        <label className="field full">
          <span>Issue</span>
          <input name="title" required placeholder={cat === "shipping" ? "Parcel stuck at Hyderabad hub for 5 days" : "Kurta too tight at the waist — wants alteration"} />
        </label>
        <label className="field full">
          <span>Details</span>
          <textarea name="details" placeholder="What the customer or courier said, and what we promised" />
        </label>
      </div>
      {ref && (
        <p className={match ? "hint" : "error"}>
          {match ? `${match.customer_name} · ${match.customer_phone ?? "no phone"} · ${itemsLine(match.items)}` : `No order #${ref.replace(/^#/, "")} found.`}
        </p>
      )}
      {msg && <p className="error">{msg}</p>}
      <div className="form-actions">
        <button type="button" className="btn ghost" onClick={onDone}>
          Cancel
        </button>
        <button className="btn primary" disabled={busy || !match}>
          {busy ? "Saving…" : "Raise dispute"}
        </button>
      </div>
    </form>
  );
}
