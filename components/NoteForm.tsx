"use client";

import { useActionState, useEffect, useRef } from "react";
import { addOrderNote, type ActionResult } from "@/app/(ops)/actions";

export default function NoteForm({ orderId }: { orderId: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(addOrderNote, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} style={{ display: "flex", gap: 10, marginBottom: 16 }}>
      <input type="hidden" name="id" value={orderId} />
      <label className="field" style={{ flex: 1 }}>
        <span className="sr-only">Note</span>
        <input name="message" placeholder="Add a note — e.g. customer asked to change size to M" />
      </label>
      <button className="btn small" disabled={pending}>
        Add
      </button>
      {state && !state.ok && <span className="error">{state.message}</span>}
    </form>
  );
}
