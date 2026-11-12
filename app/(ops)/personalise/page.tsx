"use client";

import { useRef, useState } from "react";
import { mutate } from "swr";
import Avatar from "@/components/Avatar";
import SettingsTabs from "@/components/SettingsTabs";
import { applyPrefs } from "@/lib/prefs";
import { useRealMe } from "@/lib/store";
import { sb } from "@/lib/supabase-browser";
import { FONT_SIZES, THEMES, type Prefs, type Profile } from "@/lib/types";

/** Shrink a chosen photo to a small square so it loads instantly everywhere. */
async function toAvatar(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => bad(new Error("That file isn't a picture we can read"));
      i.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const c = document.createElement("canvas");
    c.width = c.height = 192;
    c.getContext("2d")!.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 192, 192);
    return c.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function PersonalisePage() {
  const { data: me } = useRealMe();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pw, setPw] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  if (!me) return <p className="empty">Loading…</p>;

  const save = async (patch: Partial<Profile>, done = "Saved") => {
    const { error } = await sb().from("profiles").update(patch).eq("id", me.id);
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: done });
    await mutate("me");
    mutate("team");
  };
  const setPref = async (patch: Prefs) => {
    const prefs = { ...(me.prefs ?? {}), ...patch };
    applyPrefs(prefs); // change the screen straight away
    await save({ prefs }, "Saved");
  };
  const theme = me.prefs?.theme || "cream";
  const font = me.prefs?.font || "normal";

  return (
    <>
      <SettingsTabs />

      <div className="panel">
        <h3>Your photo</h3>
        <div className="avatar-row">
          <Avatar p={me} size={84} />
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn" onClick={() => fileRef.current?.click()}>
              {me.avatar_url ? "Change photo" : "Upload photo"}
            </button>
            {me.avatar_url && (
              <button className="btn ghost" onClick={() => save({ avatar_url: null }, "Photo removed")}>
                Remove
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                try {
                  await save({ avatar_url: await toAvatar(f) }, "Photo updated");
                } catch (err) {
                  setMsg({ ok: false, text: (err as Error).message });
                }
              }}
            />
          </div>
        </div>
      </div>

      <form
        className="panel"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const v = (k: string) => String(f.get(k) ?? "").trim();
          setBusy(true);
          await save({ full_name: v("full_name"), contact_email: v("contact_email"), phone: v("phone"), dob: v("dob") || null, gender: v("gender") }, "Details saved");
          setBusy(false);
        }}
      >
        <h3>Your details</h3>
        <div className="grid">
          <label className="field">
            <span>Name</span>
            <input name="full_name" defaultValue={me.full_name} autoComplete="name" />
          </label>
          <label className="field">
            <span>Sign-in email</span>
            <input value={me.email} readOnly disabled />
          </label>
          <label className="field">
            <span>Other email (optional)</span>
            <input name="contact_email" type="email" defaultValue={me.contact_email ?? ""} autoComplete="email" />
          </label>
          <label className="field">
            <span>Phone</span>
            <input name="phone" type="tel" defaultValue={me.phone ?? ""} autoComplete="tel" />
          </label>
          <label className="field">
            <span>Date of birth</span>
            <input name="dob" type="date" defaultValue={me.dob ?? ""} />
          </label>
          <label className="field">
            <span>Gender</span>
            <select name="gender" defaultValue={me.gender ?? ""}>
              <option value="">Prefer not to say</option>
              <option>Female</option>
              <option>Male</option>
              <option>Other</option>
            </select>
          </label>
        </div>
        {msg && <p className={msg.ok ? "success" : "error"}>{msg.text}</p>}
        <div className="form-actions">
          <button className="btn primary" disabled={busy}>
            {busy ? "Saving…" : "Save details"}
          </button>
        </div>
      </form>

      <div className="panel">
        <h3>Text size</h3>
        <div className="seg" role="group" aria-label="Text size">
          {FONT_SIZES.map((s) => (
            <button key={s.key} aria-pressed={font === s.key} onClick={() => setPref({ font: s.key })}>
              {s.label}
            </button>
          ))}
        </div>
        <h3 style={{ marginTop: 22 }}>Colour theme</h3>
        <div className="themes">
          {THEMES.map((t) => (
            <button key={t.key} className="theme-swatch" aria-pressed={theme === t.key} onClick={() => setPref({ theme: t.key })}>
              <span className="swatch" style={{ background: t.swatch[0] }}>
                <i style={{ background: t.swatch[1] }} />
                <i style={{ background: t.swatch[2] }} />
              </span>
              {t.label}
            </button>
          ))}
        </div>
        <p className="hint">These follow you: they apply on any phone or computer you sign in on.</p>
      </div>

      <form
        className="panel"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const a = String(f.get("password") ?? "");
          if (a.length < 8) return setPw({ ok: false, text: "Use at least 8 characters." });
          if (a !== String(f.get("confirm") ?? "")) return setPw({ ok: false, text: "The two passwords don't match." });
          const { error } = await sb().auth.updateUser({ password: a });
          setPw(error ? { ok: false, text: error.message } : { ok: true, text: "Password changed." });
          if (!error) (e.target as HTMLFormElement).reset();
        }}
      >
        <h3>Reset password</h3>
        <input type="email" autoComplete="username" value={me.email} readOnly hidden />
        <div className="grid">
          <label className="field">
            <span>New password (8+ characters)</span>
            <input name="password" type="password" autoComplete="new-password" minLength={8} required />
          </label>
          <label className="field">
            <span>Type it again</span>
            <input name="confirm" type="password" autoComplete="new-password" minLength={8} required />
          </label>
        </div>
        {pw && <p className={pw.ok ? "success" : "error"}>{pw.text}</p>}
        <div className="form-actions">
          <button className="btn primary">Change password</button>
        </div>
      </form>
    </>
  );
}
