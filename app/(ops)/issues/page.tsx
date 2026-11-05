import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { dateTime } from "@/lib/format";
import type { Issue } from "@/lib/types";
import IssueForm from "@/components/IssueForm";
import IssueStatusButtons from "@/components/IssueStatusButtons";

export const metadata = { title: "Issues" };

export default async function IssuesPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { f } = await searchParams;
  const showResolved = f === "resolved";
  const db = await supabaseServer();
  let q = db
    .from("issues")
    .select("*, order:orders(id, order_number, customer_name)")
    .order("created_at", { ascending: false })
    .limit(300);
  q = showResolved ? q.eq("status", "resolved") : q.neq("status", "resolved");
  const { data } = await q;
  const issues = (data ?? []) as (Issue & { order: { id: string; order_number: string | null; customer_name: string } | null })[];

  return (
    <>
      <IssueForm />
      <nav className="chips">
        <Link className="chip" aria-current={!showResolved ? "true" : undefined} href="/issues">
          <b>Open</b>
        </Link>
        <Link className="chip" aria-current={showResolved ? "true" : undefined} href="/issues?f=resolved">
          <b>Resolved</b>
        </Link>
      </nav>
      {!issues.length ? (
        <p className="empty">{showResolved ? "No resolved issues yet." : "No courier trouble right now."}</p>
      ) : (
        <div className="list">
          {issues.map((i) => (
            <article key={i.id} className="card">
              <div className="row1">
                <div>
                  <span className="name">{i.title}</span>
                  {i.order && (
                    <Link href={`/orders/${i.order.id}`} className="num">
                      {i.order.customer_name} {i.order.order_number}
                    </Link>
                  )}
                </div>
                <span className={`pill ${i.status === "resolved" ? "delivered" : i.status === "waiting" ? "ready" : "new"}`}>
                  {i.status}
                </span>
              </div>
              <div className="row2">
                <span className="flag express">{i.kind}</span>
                {i.courier && <span className="meta">{i.courier}</span>}
                {i.tracking_number && <span className="meta">AWB {i.tracking_number}</span>}
                <span className="meta">Logged {dateTime(i.created_at)}</span>
              </div>
              {i.details && <div className="note">{i.details}</div>}
              <div className="actions">
                <IssueStatusButtons id={i.id} status={i.status} />
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
