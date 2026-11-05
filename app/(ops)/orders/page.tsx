import Link from "next/link";
import { Suspense } from "react";
import { listOrders, getStatusCounts } from "@/lib/data";
import { shopifyConfigured } from "@/lib/shopify";
import { OPEN_STATUSES, STATUSES, STATUS_LABEL, type OrderStatus } from "@/lib/types";
import OrderList from "@/components/OrderList";
import SearchBox from "@/components/SearchBox";

export const metadata = { title: "Orders" };

type Filter = "open" | "all" | OrderStatus;

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ f?: string; q?: string }> }) {
  const sp = await searchParams;
  const f = (sp.f ?? "open") as Filter;
  const statuses = f === "open" ? OPEN_STATUSES : f === "all" ? undefined : [f];
  const [counts, orders] = await Promise.all([getStatusCounts(), listOrders({ statuses, q: sp.q })]);
  const n = (s: OrderStatus) => counts[s] ?? 0;
  const total = STATUSES.reduce((a, s) => a + n(s), 0);
  const openCount = OPEN_STATUSES.reduce((a, s) => a + n(s), 0);

  const chips: { f: Filter; label: string; n: number }[] = [
    { f: "open", label: "Not dispatched", n: openCount },
    { f: "all", label: "All", n: total },
    ...STATUSES.filter((s) => n(s) > 0).map((s) => ({ f: s as Filter, label: STATUS_LABEL[s], n: n(s) })),
  ];

  const csvHref = `/api/orders/csv?${new URLSearchParams({ f, ...(sp.q ? { q: sp.q } : {}) })}`;

  return (
    <>
      <div className="toolbar">
        <Suspense>
          <SearchBox />
        </Suspense>
        <a className="btn ghost" href={csvHref}>
          Download CSV
        </a>
      </div>
      <nav className="chips" aria-label="Filter by status">
        {chips.map((c) => (
          <Link
            key={c.f}
            className="chip"
            aria-current={c.f === f ? "true" : undefined}
            href={`/orders?${new URLSearchParams({ f: c.f, ...(sp.q ? { q: sp.q } : {}) })}`}
            scroll={false}
          >
            <b>{c.label}</b> {c.n}
          </Link>
        ))}
      </nav>
      <OrderList orders={orders} shopifyReady={shopifyConfigured()} />
    </>
  );
}
