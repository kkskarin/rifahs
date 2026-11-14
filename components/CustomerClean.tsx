"use client";

import Link from "next/link";
import PhoneInput from "@/components/PhoneInput";
import { useRef, useState } from "react";
import { mutate } from "swr";
import { cleanCustomersStep, type CleanStep } from "@/app/(ops)/actions";
import { FIELD_LABEL, PROFILE_FIELDS, draftFrom, saveProfile, useProfiles, type Customer, type Profile, type ProfileField } from "@/lib/customers";
import { money, shortDate } from "@/lib/format";
import { useCan } from "@/lib/perms";
import { safe } from "@/lib/safe";
import { useMe, useOrders } from "@/lib/store";
import { STATUS_LABEL } from "@/lib/types";

const BATCH = 4;
const toRaw = (c: Customer) => ({ key: c.key, names: c.names, phones: c.phones.length ? c.phones : c.phone ? [c.phone] : [], email: c.email, ...c.raw });

/** The editable details of one customer. Used on the profile and for answering Claude's questions. */
export function ProfileForm({ c, profile, onSaved }: { c: Customer; profile?: Profile; onSaved?: () => void }) {
  const { data: me } = useMe();
  const canEdit = useCan().can("edit_orders");
  const start = profile ? (Object.fromEntries(PROFILE_FIELDS.map((f) => [f, profile[f] ?? ""])) as Record<ProfileField, string>) : draftFrom(c);
  const [v, setV] = useState(start);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const wide: ProfileField[] = ["address1", "address2"];
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!me) return;
        setBusy(true);
        const r = await saveProfile(c.key, v, me.id);
        setBusy(false);
        setMsg({ ok: r.ok, text: r.message ?? "" });
        if (r.ok) onSaved?.();
      }}
    >
      <div className="grid">
        {PROFILE_FIELDS.map((f) => (
          <label key={f} className={`field${wide.includes(f) ? " full" : f === "phone" ? " span2" : ""}`}>
            <span>{FIELD_LABEL[f]}</span>
            {f === "phone" ? (
              <PhoneInput value={v.phone} disabled={!canEdit} country={v.country} onChange={(p) => setV((x) => ({ ...x, phone: p }))} />
            ) : (
            <input value={v[f]} disabled={!canEdit} onChange={(e) => setV((x) => ({ ...x, [f]: e.target.value }))} inputMode={f === "pin" ? "numeric" : f === "email" ? "email" : undefined} />
            )}
          </label>
        ))}
      </div>
      {msg && <p className={msg.ok ? "success" : "error"}>{msg.text}</p>}
      {canEdit && (
        <div className="form-actions">
          <button className="btn primary" disabled={busy || !me}>
            {busy ? "Saving…" : profile?.status === "review" ? "Save and mark as checked" : "Save"}
          </button>
        </div>
      )}
    </form>
  );
}

/** Customers → Clean Up: Claude tidies names, phones and addresses; anything it is unsure of waits here for an answer. */
export function CleanView({ customers }: { customers: Customer[] }) {
  const { data: profiles } = useProfiles();
  const canEdit = useCan().can("edit_orders");
  const [run, setRun] = useState<{ busy: boolean; done: number; total: number; note?: string; error?: string; needsKey?: boolean }>({ busy: false, done: 0, total: 0 });
  // Set by "Stop after this batch"; a ref so the running loop reads the current value.
  const stop = useRef(false);
  const byKey = new Map((profiles ?? []).map((p) => [p.key, p]));
  const todo = customers.filter((c) => !byKey.has(c.key));
  const review = customers.filter((c) => byKey.get(c.key)?.status === "review");
  const clean = customers.length - todo.length - review.length;

  const start = async (limit: number) => {
    const list = todo.slice(0, limit);
    stop.current = false;
    setRun({ busy: true, done: 0, total: list.length });
    let done = 0;
    for (let i = 0; i < list.length; i += BATCH) {
      if (stop.current) break;
      const r = (await safe(() => cleanCustomersStep(list.slice(i, i + BATCH).map(toRaw)))) as CleanStep;
      if (!r.ok) {
        setRun({ busy: false, done, total: list.length, error: r.message ?? "Stopped", needsKey: r.needsKey });
        mutate("customer-profiles");
        return;
      }
      done += r.cleaned?.length ?? 0;
      setRun({ busy: true, done, total: list.length });
      // Questions show up below while the run carries on.
      mutate("customer-profiles");
    }
    setRun({ busy: false, done, total: list.length, note: `${done} customer${done === 1 ? "" : "s"} cleaned up.` });
    mutate("customer-profiles");
  };

  return (
    <>
      <section className="stats" aria-label="Clean-up progress">
        <div className="stat">
          <div className="label">Cleaned</div>
          <div className="value">{profiles ? clean : "…"}</div>
        </div>
        <div className="stat">
          <div className="label">Need your answer</div>
          <div className="value accent">{profiles ? review.length : "…"}</div>
        </div>
        <div className="stat">
          <div className="label">Not cleaned yet</div>
          <div className="value">{profiles ? todo.length : "…"}</div>
        </div>
      </section>
      <div className="panel">
        <h3>Clean up with Claude</h3>
        <p className="hint" style={{ marginTop: -6 }}>
          Claude puts each customer&apos;s details in a proper format: name in normal capitals, phone with its country code, the address split into
          line 1 and line 2, and the right city, district and state for the PIN code. When it isn&apos;t sure, it asks, and the question appears
          below while the rest carries on. The cleaned details are kept in Core as the customer&apos;s profile; orders and Shopify are not changed.
        </p>
        {canEdit && (
          <div className="form-actions" style={{ justifyContent: "flex-start" }}>
            <button className="btn primary" disabled={run.busy || !todo.length} onClick={() => start(20)}>
              Clean up next {Math.min(20, todo.length)}
            </button>
            <button className="btn ghost" disabled={run.busy || todo.length <= 20} onClick={() => confirm(`Send all ${todo.length} remaining customers to Claude? Keep this page open while it runs.`) && start(todo.length)}>
              Clean up all {todo.length}
            </button>
            {run.busy && (
              <button className="link" onClick={() => (stop.current = true)}>
                Stop after this batch
              </button>
            )}
          </div>
        )}
        {run.busy && (
          <p className="hint">
            Cleaning… {run.done} of {run.total}
          </p>
        )}
        {run.note && <p className="success">{run.note}</p>}
        {run.error && <p className="error">{run.error}</p>}
        {run.needsKey && (
          <p className="hint">
            To connect Claude: create an API key at console.anthropic.com (Settings → API keys), add it in Netlify → Site configuration → Environment
            variables as <b>ANTHROPIC_API_KEY</b>, then trigger a deploy. Claude charges for use by the amount of text processed.
          </p>
        )}
      </div>

      <h3 style={{ margin: "22px 0 10px" }}>
        Need your answer <span className="meta">· {review.length}</span>
      </h3>
      {!review.length && <p className="empty">Nothing waiting for you.</p>}
      {review.map((c) => {
        const p = byKey.get(c.key)!;
        return (
          <div key={c.key} className="panel">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
              <b>{p.name || c.name}</b>
              <Link className="link" href={`/customers?c=${encodeURIComponent(c.key)}`}>
                Open profile
              </Link>
            </div>
            <ul className="doubts">
              {p.doubts.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
            <p className="meta" style={{ margin: "0 0 10px" }}>
              As written on the order: {[c.name, c.phone, c.raw.address1, c.raw.address2, c.raw.city, c.raw.province, c.raw.zip].filter(Boolean).join(" · ")}
            </p>
            <ProfileForm key={p.updated_at} c={c} profile={p} />
          </div>
        );
      })}
    </>
  );
}

/** One customer: cleaned details (editable), what the orders say, and their orders. */
export function ProfileView({ c }: { c: Customer }) {
  const { data: profiles } = useProfiles();
  const { data: orders } = useOrders();
  const { can } = useCan();
  const canEdit = can("edit_orders");
  const profile = profiles?.find((p) => p.key === c.key);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const keys = new Set(c.keys);
  const norm = (n: string) => n.toLowerCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
  const mine = (orders ?? []).filter((o) => !o.is_internal && keys.has(`${norm(o.customer_name)}|${(o.customer_phone ?? "").replace(/\D/g, "").slice(-10)}|${(o.customer_email ?? "").trim().toLowerCase()}`));
  return (
    <>
      <p style={{ marginTop: 0 }}>
        <Link href="/customers" className="link">
          ← All Customers
        </Link>
      </p>
      <div className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
          <h2 style={{ margin: 0 }}>{profile?.name || c.name}</h2>
          <span className="meta">
            {c.orders} order{c.orders === 1 ? "" : "s"}
            {can("see_amounts") ? ` · ${money(c.total)} spent` : ""} · last {shortDate(c.last)}
          </span>
        </div>
        <p className="hint">
          {!profiles
            ? "Loading…"
            : !profile
              ? "Not cleaned up yet. These are the details from the newest order; edit and save, or let Claude tidy them."
              : profile.status === "review"
                ? "Claude had a question about this customer. Check the details and save."
                : `Cleaned ${profile.source === "claude" ? "by Claude" : "by hand"} on ${shortDate(profile.updated_at)}.`}
        </p>
        {profile?.status === "review" && (
          <ul className="doubts">
            {profile.doubts.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        )}
        {profiles && <ProfileForm key={profile?.updated_at ?? "new"} c={c} profile={profile} />}
        {canEdit && profiles && (
          <p style={{ marginBottom: 0 }}>
            <button
              className="link"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const r = (await safe(() => cleanCustomersStep([{ key: c.key, names: c.names, phones: c.phones, email: c.email, ...c.raw }]))) as CleanStep;
                setBusy(false);
                setErr(r.ok ? null : (r.message ?? "Couldn't clean this customer"));
                mutate("customer-profiles");
              }}
            >
              {busy ? "Asking Claude…" : profile ? "Clean again with Claude" : "Clean with Claude"}
            </button>
            {err && <span className="error"> {err}</span>}
          </p>
        )}
      </div>

      <div className="panel">
        <h3>As written on their orders</h3>
        <p style={{ margin: 0 }}>
          {[c.names.join(" / "), c.phones.join(" / ") || c.phone, c.email].filter(Boolean).join(" · ")}
          <br />
          {[c.raw.address1, c.raw.address2, c.raw.city, c.raw.province, c.raw.zip, c.raw.country].filter(Boolean).join(", ") || "No address on the newest order"}
        </p>
        {c.keys.length > 1 && <p className="hint">{c.keys.length} records merged into this customer.</p>}
      </div>

      <div className="panel">
        <h3>Orders</h3>
        <div className="master-list">
          {mine.map((o) => (
            <Link key={o.id} href={`/order?id=${o.id}`} className="master-row" style={{ textDecoration: "none", color: "inherit" }}>
              <span className="master-name">
                {o.order_number ?? "Core entry"} <span className="meta">{shortDate(o.placed_at)}</span>
              </span>
              <span className="meta">{o.items_text}</span>
              <span className="master-actions">
                <span className={`pill ${o.status}`}>{STATUS_LABEL[o.status]}</span>
                {can("see_amounts") ? <b style={{ marginLeft: 10 }}>{money(o.total, o.currency)}</b> : null}
              </span>
            </Link>
          ))}
          {orders && !mine.length && <p className="hint">No orders found.</p>}
        </div>
      </div>
    </>
  );
}
