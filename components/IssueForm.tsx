"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { saveIssue, type ActionResult } from "@/app/(ops)/actions";
import { COURIERS, ISSUE_KINDS } from "@/lib/types";

export default function IssueForm() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(saveIssue, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) {
      ref.current?.reset();
      setOpen(false);
    }
  }, [state]);

  if (!open)
    return (
      <div className="toolbar">
        <button className="btn" onClick={() => setOpen(true)}>
          + Log an issue
        </button>
        {state?.ok && <span className="success">{state.message}</span>}
      </div>
    );

  return (
    <form ref={ref} action={action} className="panel">
      <h3>Log an issue</h3>
      <div className="grid">
        <label className="field full">
          <span>What happened</span>
          <input name="title" required placeholder="Parcel stuck at Hyderabad hub for 5 days" />
        </label>
        <label className="field">
          <span>Order #</span>
          <input name="order_ref" placeholder="1262" />
        </label>
        <label className="field">
          <span>Type</span>
          <select name="kind">
            {ISSUE_KINDS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Courier</span>
          <input name="courier" list="couriers3" />
          <datalist id="couriers3">
            {COURIERS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <label className="field">
          <span>AWB</span>
          <input name="tracking_number" />
        </label>
        <label className="field full">
          <span>Details</span>
          <textarea name="details" placeholder="Raised complaint #… with courier, customer informed on WhatsApp" />
        </label>
      </div>
      {state && !state.ok && <p className="error">{state.message}</p>}
      <div className="form-actions">
        <button type="button" className="btn ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button className="btn primary" disabled={pending}>
          {pending ? "Saving…" : "Log issue"}
        </button>
      </div>
    </form>
  );
}
