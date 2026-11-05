"use client";

import { useActionState, useEffect, useRef } from "react";
import { inviteMember, type ActionResult } from "@/app/(ops)/actions";

export default function InviteForm({ canMakeOwner }: { canMakeOwner: boolean }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(inviteMember, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="panel">
      <h3>Add someone to the team</h3>
      <div className="grid">
        <label className="field">
          <span>Name</span>
          <input name="full_name" placeholder="Amma" />
        </label>
        <label className="field">
          <span>Email</span>
          <input name="email" type="email" required />
        </label>
        <label className="field">
          <span>Role</span>
          <select name="role" defaultValue="staff">
            <option value="staff">Staff</option>
            <option value="admin">Admin</option>
            {canMakeOwner && <option value="owner">Owner</option>}
          </select>
        </label>
      </div>
      {state && <p className={state.ok ? "success" : "error"}>{state.message}</p>}
      <div className="form-actions">
        <button className="btn primary" disabled={pending}>
          {pending ? "Adding…" : "Give access"}
        </button>
      </div>
    </form>
  );
}
