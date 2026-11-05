import { listOrders } from "@/lib/data";
import { shopifyConfigured } from "@/lib/shopify";
import { OPEN_STATUSES } from "@/lib/types";
import OrderList from "@/components/OrderList";

export const metadata = { title: "Express" };

export default async function ExpressPage() {
  const orders = await listOrders({ express: true, statuses: OPEN_STATUSES, orderBy: "promise_date" });
  return (
    <>
      <p className="hint" style={{ marginTop: 0 }}>
        Express orders still to ship, soonest promise first. Set the promise date on each order so nothing slips.
      </p>
      <OrderList orders={orders} shopifyReady={shopifyConfigured()} />
    </>
  );
}
