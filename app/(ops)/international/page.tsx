import Link from "next/link";
import { listOrders } from "@/lib/data";
import { shopifyConfigured } from "@/lib/shopify";
import { OPEN_STATUSES } from "@/lib/types";
import OrderList from "@/components/OrderList";

export const metadata = { title: "International" };

export default async function InternationalPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { f } = await searchParams;
  const showAll = f === "all";
  const orders = await listOrders({ international: true, statuses: showAll ? undefined : OPEN_STATUSES });
  return (
    <>
      <nav className="chips">
        <Link className="chip" aria-current={!showAll ? "true" : undefined} href="/international">
          <b>In progress</b>
        </Link>
        <Link className="chip" aria-current={showAll ? "true" : undefined} href="/international?f=all">
          <b>All international</b>
        </Link>
      </nav>
      <OrderList orders={orders} shopifyReady={shopifyConfigured()} />
    </>
  );
}
