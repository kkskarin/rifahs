"use client";

import { deleteOrder } from "@/app/(ops)/actions";

export default function DeleteOrder({ id }: { id: string }) {
  return (
    <form
      action={() => deleteOrder(id)}
      onSubmit={(e) => {
        if (!confirm("Delete this entry from the order book? This doesn't touch Shopify.")) e.preventDefault();
      }}
      style={{ textAlign: "right" }}
    >
      <button className="btn small danger">Delete entry</button>
    </form>
  );
}
