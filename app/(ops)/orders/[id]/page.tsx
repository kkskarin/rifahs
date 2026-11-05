import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { requireMember, isAdmin } from "@/lib/session";
import { shopifyAdminUrl, shopifyConfigured } from "@/lib/shopify";
import { dateTime, itemsLine, money } from "@/lib/format";
import { STATUS_LABEL, type Order, type OrderEvent } from "@/lib/types";
import OrderForm from "@/components/OrderForm";
import { DispatchForm } from "@/components/OrderList";
import NoteForm from "@/components/NoteForm";
import DeleteOrder from "@/components/DeleteOrder";

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireMember();
  const db = await supabaseServer();
  const [{ data: order }, { data: events }, { data: people }, { data: issues }] = await Promise.all([
    db.from("orders").select("*").eq("id", id).maybeSingle(),
    db.from("order_events").select("*").eq("order_id", id).order("created_at", { ascending: false }),
    db.from("profiles").select("id, full_name, email"),
    db.from("issues").select("id, title, status").eq("order_id", id),
  ]);
  if (!order) notFound();
  const o = order as Order;
  const who = new Map((people ?? []).map((p) => [p.id, p.full_name || p.email.split("@")[0]]));
  const open = ["new", "printing", "stitching", "checking", "ready"].includes(o.status);

  return (
    <>
      <p style={{ marginTop: 0 }}>
        <Link href="/orders" className="link">
          ← Back to orders
        </Link>
      </p>

      <div className="panel">
        <div className="card" style={{ boxShadow: "none", border: 0, padding: 0, background: "transparent" }}>
          <div className="row1">
            <div>
              <span className="name" style={{ fontSize: 22, fontFamily: "var(--serif)", fontWeight: 400 }}>
                {o.customer_name}
              </span>
              {o.order_number && <span className="num">{o.order_number}</span>}
            </div>
            <span className="amt">{money(o.total, o.currency)}</span>
          </div>
          <div className="row2">
            <span className={`pill ${o.status}`}>{STATUS_LABEL[o.status]}</span>
            {o.is_internal && <span className="flag late">Internal / test — not counted</span>}
            <span className="items">{itemsLine(o.items)}</span>
            {o.source && <span className="meta">{o.source}</span>}
            <span className="meta">Placed {dateTime(o.placed_at)}</span>
            {o.financial_status && <span className="meta">Payment: {o.financial_status.replace(/_/g, " ")}</span>}
          </div>
          {o.ship_address && (
            <p className="hint" style={{ marginBottom: 0 }}>
              Ship to:{" "}
              {[o.ship_address.address1, o.ship_address.address2, o.ship_address.city, o.ship_address.province, o.ship_address.zip, o.ship_address.country]
                .filter(Boolean)
                .join(", ")}
            </p>
          )}
          {o.shopify_id && (
            <p style={{ marginBottom: 0 }}>
              <a className="link" href={shopifyAdminUrl(`/orders/${o.shopify_id}`)} target="_blank" rel="noreferrer">
                Open in Shopify ↗
              </a>
            </p>
          )}
        </div>
        {open && (
          <>
            <h3 style={{ marginTop: 20, marginBottom: 0 }}>Dispatch</h3>
            <DispatchForm o={o} shopifyReady={shopifyConfigured()} />
          </>
        )}
      </div>

      <OrderForm order={o} />

      <div className="panel">
        <h3>Activity</h3>
        <NoteForm orderId={o.id} />
        {issues?.length ? (
          <p className="hint">
            Issues:{" "}
            {issues.map((i) => (
              <Link key={i.id} className="link" href="/issues" style={{ marginRight: 10 }}>
                {i.title} ({i.status})
              </Link>
            ))}
          </p>
        ) : null}
        <ul className="timeline">
          {((events ?? []) as OrderEvent[]).map((e) => (
            <li key={e.id}>
              <time>
                {dateTime(e.created_at)} · {e.actor ? who.get(e.actor) : e.kind === "shopify_sync" ? "Shopify" : "System"}
              </time>
              {e.to_status && e.from_status !== e.to_status && e.kind !== "note" && (
                <>
                  {e.from_status ? `${STATUS_LABEL[e.from_status]} → ` : ""}
                  <b>{STATUS_LABEL[e.to_status]}</b>
                  {e.message ? " · " : ""}
                </>
              )}
              {e.message}
            </li>
          ))}
        </ul>
      </div>

      {isAdmin(me) && <DeleteOrder id={o.id} />}
    </>
  );
}
