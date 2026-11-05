"use client";

import { useTransition } from "react";
import { deleteExpense } from "@/app/(ops)/actions";

export default function DeleteExpense({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      className="link"
      disabled={pending}
      onClick={() => confirm("Delete this expense?") && start(() => deleteExpense(id))}
      aria-label="Delete expense"
    >
      ✕
    </button>
  );
}
