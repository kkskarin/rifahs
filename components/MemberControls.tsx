"use client";

import { useState, useTransition } from "react";
import { updateMember } from "@/app/(ops)/actions";
import type { Profile, TeamRole } from "@/lib/types";

export default function MemberControls({ p, canMakeOwner }: { p: Profile; canMakeOwner: boolean }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const run = (patch: { role?: TeamRole; active?: boolean }) =>
    start(async () => {
      const r = await updateMember(p.id, patch);
      setErr(r.ok ? null : (r.message ?? "Failed"));
    });
  if (p.role === "owner" && !canMakeOwner) return null;

  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "flex-end" }}>
      {p.active && (
        <select
          aria-label="Role"
          defaultValue={p.role}
          disabled={pending}
          onChange={(e) => run({ role: e.target.value as TeamRole })}
          style={{ padding: "4px 6px" }}
        >
          <option value="staff">Staff</option>
          <option value="admin">Admin</option>
          {canMakeOwner && <option value="owner">Owner</option>}
        </select>
      )}
      <button
        className="link"
        disabled={pending}
        onClick={() => (p.active ? confirm(`Remove ${p.email}'s access?`) && run({ active: false }) : run({ active: true }))}
      >
        {p.active ? "Remove" : "Restore"}
      </button>
      {err && <span className="error">{err}</span>}
    </div>
  );
}
