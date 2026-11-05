"use client";

import { useActionState, useEffect, useRef } from "react";
import { addExpense, type ActionResult } from "@/app/(ops)/actions";
import { EXPENSE_CATEGORIES } from "@/lib/types";

export default function ExpenseForm() {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(addExpense, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="panel">
      <h3>Add an expense</h3>
      <div className="grid">
        <label className="field">
          <span>Amount ₹</span>
          <input name="amount" inputMode="decimal" required />
        </label>
        <label className="field">
          <span>Category</span>
          <select name="category">
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Date</span>
          <input name="spent_on" type="date" />
        </label>
        <label className="field">
          <span>Paid to</span>
          <input name="paid_to" placeholder="Tailor / vendor" />
        </label>
        <label className="field full">
          <span>Note</span>
          <input name="note" />
        </label>
      </div>
      {state && <p className={state.ok ? "success" : "error"}>{state.message}</p>}
      <div className="form-actions">
        <button className="btn primary" disabled={pending}>
          {pending ? "Saving…" : "Add expense"}
        </button>
      </div>
    </form>
  );
}
