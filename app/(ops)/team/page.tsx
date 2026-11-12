"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { createInvite, createSetPasswordLink } from "../../auth-actions";
import { updateMember } from "../actions";
import { dateTime, shortDate } from "@/lib/format";
import { isAdmin } from "@/lib/roles";
import { safe } from "@/lib/safe";
import { useMe, useTeam } from "@/lib/store";
import { sb } from "@/lib/supabase-browser";
import type { Profile, TeamRole } from "@/lib/types";

type Invite = { id: string; user_id: string; kind: string; email: string; expires_at: string; used_at: string | null; email_status: string; created_at: string };
type LinkResult = { ok: boolean; message?: string; link?: string };

function useInvites(enabled: boolean) {
  return useSWR<Invite[]>(enabled ? "invites" : null, async () => {
    const { data } = await sb().from("invites").select("id, user_id, kind, email, expires_at, used_at, email_status, created_at").order("created_at", { ascending: false }).limit(200);
    return (data ?? []) as Invite[];
  });
}

function LinkBox({ r }: { r: LinkResult }) {
  const [copied, setCopied] = useState(false);
  if (!r.ok) return <p className="error">{r.message}</p>;
  return (
    <div className="linkbox">
      <p className={r.message?.startsWith("Emailed") ? "success" : "hint"} style={{ margin: "0 0 8px" }}>
        {r.message}
      </p>
      {r.link && (
        <div style={{ display: "flex", gap: 8 }}>
          <input readOnly value={r.link} onFocus={(e) => e.currentTarget.select()} />
          <button
            type="button"
            className="btn small"
            onClick={async () => {
              await navigator.clipboard.writeText(r.link!);
              setCopied(true);
            }}
          >
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
      )}
    </div>
  );
}

export default function TeamPage() {
  const { data: me } = useMe();
  const admin = me ? isAdmin(me) : false;
  const owner = me?.role === "owner";
  const { data: people } = useTeam(admin);
  const { data: invites } = useInvites(admin);
  const [result, setResult] = useState<LinkResult | null>(null);
  const [busy, setBusy] = useState(false);
  if (me && !admin) return <p className="empty">Only owners and admins can see the team.</p>;

  const pending = new Map<string, Invite>();
  for (const i of invites ?? []) if (!i.used_at && new Date(i.expires_at) > new Date() && !pending.has(i.user_id)) pending.set(i.user_id, i);

  return (
    <>
      <div className="page-head">
        <h1>Team</h1>
        <p>Who can use Kaleidoscope Core, and what they can see.</p>
      </div>

      {owner ? (
        <form
          className="panel"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setBusy(true);
            const r = (await safe(() =>
              createInvite({ name: String(f.get("name") ?? ""), email: String(f.get("email") ?? ""), role: String(f.get("role") ?? "") }),
            )) as LinkResult;
            setBusy(false);
            setResult(r);
            if (r.ok) {
              (e.target as HTMLFormElement).reset();
              mutate("team");
              mutate("invites");
            }
          }}
        >
          <h3>Invite someone</h3>
          <div className="grid">
            <label className="field">
              <span>Name *</span>
              <input name="name" required placeholder="Amma" />
            </label>
            <label className="field">
              <span>Email *</span>
              <input name="email" type="email" required />
            </label>
            <label className="field">
              <span>Role *</span>
              <select name="role" required defaultValue="">
                <option value="" disabled>
                  Choose…
                </option>
                <option value="staff">Staff — orders, inventory, issues (no money)</option>
                <option value="admin">Admin — everything incl. money and settings</option>
                <option value="owner">Owner — everything, plus inviting people</option>
              </select>
            </label>
          </div>
          {result && <LinkBox r={result} />}
          <div className="form-actions">
            <button className="btn primary" disabled={busy}>
              {busy ? "Creating link…" : "Create invite link"}
            </button>
          </div>
          <p className="hint">They get an email with a one-time link (valid 7 days) to choose a password. You can also copy the link and send it yourself.</p>
        </form>
      ) : (
        <p className="hint">Only owners can invite people.</p>
      )}

      <div className="panel" style={{ padding: 0 }}>
        <div className="scroll-x">
          <table className="t stack">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(people ?? []).map((p) => (
                <Row key={p.id} p={p} me={me!} pending={pending.get(p.id)} owner={owner} onLink={setResult} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function Row({ p, me, pending, owner, onLink }: { p: Profile; me: Profile; pending?: Invite; owner: boolean; onLink: (r: LinkResult) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async (patch: { role?: TeamRole; active?: boolean }) => {
    setBusy(true);
    const r = (await safe(() => updateMember(p.id, patch))) as { ok: boolean; message?: string };
    setBusy(false);
    setErr(r.ok ? null : (r.message ?? "Failed"));
    mutate("team");
  };
  const status = !p.active
    ? "Removed"
    : pending
      ? `${pending.kind === "invite" ? "Invited" : "Password link sent"} ${shortDate(pending.created_at)} · expires ${dateTime(pending.expires_at)}`
      : `Since ${shortDate(p.created_at)}`;
  const canEdit = p.id !== me.id && (owner || p.role !== "owner");

  return (
    <tr style={{ opacity: p.active ? 1 : 0.5 }}>
      <td className="stack-title">
        <input
          className="name-edit"
          aria-label="Name"
          defaultValue={p.full_name}
          placeholder="Add name"
          onBlur={async (e) => {
            const v = e.currentTarget.value.trim();
            if (v === p.full_name) return;
            const { error } = await sb().from("profiles").update({ full_name: v }).eq("id", p.id);
            setErr(error ? error.message : null);
            mutate("team");
            if (p.id === me.id) mutate("me");
          }}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
      </td>
      <td data-label="Email">{p.email}</td>
      <td data-label="Role">
        {canEdit && p.active ? (
          <select aria-label="Role" defaultValue={p.role} disabled={busy} onChange={(e) => run({ role: e.target.value as TeamRole })} style={{ padding: "4px 6px" }}>
            <option value="staff">Staff</option>
            <option value="admin">Admin</option>
            {owner && <option value="owner">Owner</option>}
          </select>
        ) : (
          <span style={{ textTransform: "capitalize" }}>{p.role}</span>
        )}
      </td>
      <td className="hint" data-label="Status">{status}</td>
      <td className="stack-actions">
        {owner && p.active && (
          <button
            className="link"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const r = (await safe(() => createSetPasswordLink(p.id))) as LinkResult;
              setBusy(false);
              onLink(r);
              mutate("invites");
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          >
            {p.id === me.id ? "Set my password" : "Send set-password link"}
          </button>
        )}{" "}
        {canEdit && (
          <button className="link" disabled={busy} onClick={() => (p.active ? confirm(`Remove ${p.email}'s access?`) && run({ active: false }) : run({ active: true }))}>
            {p.active ? "Remove" : "Restore"}
          </button>
        )}
        {err && <span className="error"> {err}</span>}
      </td>
    </tr>
  );
}
