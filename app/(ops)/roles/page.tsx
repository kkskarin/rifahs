"use client";

import { useState } from "react";
import { mutate } from "swr";
import SettingsTabs from "@/components/SettingsTabs";
import { ALL_PERMS, PERM_GROUPS, useRoles, type PermKey, type Role } from "@/lib/perms";
import { useRealMe, useTeam } from "@/lib/store";
import { sb } from "@/lib/supabase-browser";

/** Settings → Roles: the owner ticks what each role can open, see and change. */
export default function RolesPage() {
  const { data: me } = useRealMe();
  const owner = me?.role === "owner";
  const { data: roles } = useRoles();
  const { data: people } = useTeam(Boolean(owner));
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  if (me && !owner) return <p className="empty">Only owners can set up roles.</p>;

  const count = (r: Role) => (people ?? []).filter((p) => p.active && p.role !== "owner" && (p.role_key ?? p.role) === r.key).length;

  return (
    <>
      <SettingsTabs />
      <p className="hint" style={{ marginTop: 0 }}>
        Tick what each role can open, see and change, then give people a role on the Team tab. Owners always have everything. To check a
        role, use <b>View as</b> in the ☰ menu.
      </p>

      {(roles ?? []).map((r) => (
        <RoleCard key={r.key} role={r} members={count(r)} />
      ))}
      {!roles && <p className="empty">Loading…</p>}

      <form
        className="panel"
        onSubmit={async (e) => {
          e.preventDefault();
          const n = name.trim();
          if (!n) return;
          const key = n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
          if (!key || ["owner", "admin", "staff"].includes(key)) return setErr("Choose a different name");
          if ((roles ?? []).some((r) => r.key === key)) return setErr("A role with that name already exists");
          // A new role starts with what Staff can do; tick or untick from there.
          const base = (roles ?? []).find((r) => r.key === "staff")?.permissions ?? {};
          const { error } = await sb().from("roles").insert({ key, name: n, permissions: base });
          setErr(error ? error.message : null);
          if (!error) setName("");
          mutate("roles");
        }}
      >
        <h2>Add a role</h2>
        <div className="grid">
          <label className="field">
            <span>Role name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Stitching unit, Accounts, Packing" />
          </label>
        </div>
        {err && <p className="error">{err}</p>}
        <div className="form-actions" style={{ justifyContent: "flex-start" }}>
          <button className="btn primary" disabled={!name.trim()}>
            Add role
          </button>
        </div>
      </form>
    </>
  );
}

function RoleCard({ role, members }: { role: Role; members: number }) {
  const [perms, setPerms] = useState<Partial<Record<PermKey, boolean>>>(role.permissions);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = ALL_PERMS.some((k) => Boolean(perms[k]) !== Boolean(role.permissions[k]));

  return (
    <div className="panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>{role.name}</h2>
        <span className="hint" style={{ margin: 0 }}>
          {members} {members === 1 ? "person" : "people"}
          {role.builtin ? " · built-in" : ""}
        </span>
      </div>
      <div className="role-grid">
        {PERM_GROUPS.map((g) => (
          <fieldset key={g.title} className="role-group">
            <legend>{g.title}</legend>
            <p className="hint">{g.hint}</p>
            {g.perms.map((p) => (
              <label key={p.key} className="checkbox">
                <input
                  type="checkbox"
                  checked={Boolean(perms[p.key])}
                  onChange={(e) => {
                    setPerms((x) => ({ ...x, [p.key]: e.target.checked }));
                    setMsg(null);
                  }}
                />{" "}
                {p.label}
              </label>
            ))}
          </fieldset>
        ))}
      </div>
      {msg && <p className={msg.ok ? "success" : "error"}>{msg.text}</p>}
      <div className="form-actions" style={{ justifyContent: "space-between" }}>
        {role.builtin ? (
          <span />
        ) : (
          <button
            type="button"
            className="link"
            disabled={busy}
            onClick={async () => {
              if (!confirm(`Delete the role "${role.name}"? ${members ? `${members} ${members === 1 ? "person" : "people"} with it will become Staff.` : ""}`)) return;
              setBusy(true);
              const { error } = await sb().from("roles").delete().eq("key", role.key);
              setBusy(false);
              if (error) setMsg({ ok: false, text: error.message });
              mutate("roles");
              mutate("team");
            }}
          >
            Delete role
          </button>
        )}
        <button
          className="btn primary"
          disabled={busy || !dirty}
          onClick={async () => {
            setBusy(true);
            const clean = Object.fromEntries(ALL_PERMS.map((k) => [k, Boolean(perms[k])]));
            const { error } = await sb().from("roles").update({ permissions: clean }).eq("key", role.key);
            setBusy(false);
            setMsg(error ? { ok: false, text: error.message } : { ok: true, text: "Saved. It applies the next time they open or reload the app." });
            mutate("roles");
          }}
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
