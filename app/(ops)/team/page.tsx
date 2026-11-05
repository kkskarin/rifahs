"use client";

import { useRef, useState } from "react";
import { mutate } from "swr";
import { inviteMember, updateMember } from "../actions";
import { shortDate } from "@/lib/format";
import { isAdmin } from "@/lib/roles";
import { safe } from "@/lib/safe";
import { useMe, useTeam } from "@/lib/store";
import type { Profile, TeamRole } from "@/lib/types";

export default function TeamPage() {
  const { data: me } = useMe();
  const admin = me ? isAdmin(me) : false;
  const { data: people } = useTeam(admin);
  const [msg, setMsg] = useState<{ ok: boolean; message?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  if (me && !admin) return <p className="empty">Only owners and admins manage the team.</p>;
  const owner = me?.role === "owner";

  return (
    <>
      <form
        ref={formRef}
        className="panel"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const r = (await safe(() => inviteMember(null, new FormData(formRef.current!)))) as { ok: boolean; message?: string };
          setBusy(false);
          setMsg(r);
          if (r.ok) {
            formRef.current?.reset();
            mutate("team");
          }
        }}
      >
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
              {owner && <option value="owner">Owner</option>}
            </select>
          </label>
        </div>
        {msg && <p className={msg.ok ? "success" : "error"}>{msg.message}</p>}
        <div className="form-actions">
          <button className="btn primary" disabled={busy}>
            {busy ? "Adding…" : "Give access"}
          </button>
        </div>
      </form>

      <div className="panel">
        <h3>Who has access</h3>
        <p className="hint" style={{ marginTop: -6 }}>
          <b>Owner / Admin</b> see everything including money, and manage the team and Shopify. <b>Staff</b> see orders,
          express, international and issues — no money.
        </p>
        <div className="scroll-x">
          <table className="t">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Since</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(people ?? []).map((p) => (
                <tr key={p.id} style={{ opacity: p.active ? 1 : 0.5 }}>
                  <td>{p.full_name || "—"}</td>
                  <td>{p.email}</td>
                  <td style={{ textTransform: "capitalize" }}>{p.active ? p.role : "Removed"}</td>
                  <td>{shortDate(p.created_at)}</td>
                  <td>{me && p.id !== me.id && <Controls p={p} owner={owner} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function Controls({ p, owner }: { p: Profile; owner: boolean }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async (patch: { role?: TeamRole; active?: boolean }) => {
    setBusy(true);
    const r = (await safe(() => updateMember(p.id, patch))) as { ok: boolean; message?: string };
    setBusy(false);
    setErr(r.ok ? null : (r.message ?? "Failed"));
    mutate("team");
  };
  if (p.role === "owner" && !owner) return null;
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "flex-end" }}>
      {p.active && (
        <select aria-label="Role" defaultValue={p.role} disabled={busy} onChange={(e) => run({ role: e.target.value as TeamRole })} style={{ padding: "4px 6px" }}>
          <option value="staff">Staff</option>
          <option value="admin">Admin</option>
          {owner && <option value="owner">Owner</option>}
        </select>
      )}
      <button
        className="link"
        disabled={busy}
        onClick={() => (p.active ? confirm(`Remove ${p.email}'s access?`) && run({ active: false }) : run({ active: true }))}
      >
        {p.active ? "Remove" : "Restore"}
      </button>
      {err && <span className="error">{err}</span>}
    </div>
  );
}
