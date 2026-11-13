"use client";

import EntryForm from "@/components/EntryForm";
import SalesNav from "@/components/SalesNav";
import { useCan } from "@/lib/perms";

export default function NewOrderPage() {
  const { can } = useCan();
  return (
    <>
      <SalesNav />
      {can("edit_orders") ? <EntryForm /> : <p className="empty">Your role can&apos;t add orders. Ask the owner if you need it.</p>}
    </>
  );
}
