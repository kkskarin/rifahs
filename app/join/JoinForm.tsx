"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { checkLink, completeLink } from "../auth-actions";
import { sb } from "@/lib/supabase-browser";

type Info = { ok: true; kind: string; email: string; name: string; role: string } | { ok: false } | null;

export default function JoinForm() {
  const token = useSearchParams().get("t") ?? "";
  const [info, setInfo] = useState<Info>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    checkLink(token).then(setInfo).catch(() => setInfo({ ok: false }));
  }, [token]);

  if (!info) return <p>Checking your link…</p>;
  if (!info.ok)
    return (
      <>
        <h1>
          Link <em>expired</em>
        </h1>
        <p>This link has expired or was already used. Ask an owner for a new one, or use “Forgot password?” on the sign-in page.</p>
        <Link className="btn" href="/login">
          Go to sign in
        </Link>
      </>
    );

  const first = info.name.split(" ")[0] || "there";
  return (
    <>
      <h1>
        {info.kind === "invite" ? "Welcome, " : "Hello, "}
        <em>{first}.</em>
      </h1>
      <p>
        {info.kind === "invite" ? `You've been added to Kaleidoscope Core${info.role ? ` as ${info.role}` : ""}. ` : ""}
        Choose a password for <b>{info.email}</b>.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const pw = String(f.get("password") ?? "");
          if (pw !== String(f.get("confirm") ?? "")) return setErr("The two passwords don't match.");
          setBusy(true);
          const r = await completeLink(token, pw);
          if (!r.ok || !r.email) {
            setBusy(false);
            return setErr(r.message ?? "Something went wrong");
          }
          const { error } = await sb().auth.signInWithPassword({ email: r.email, password: pw });
          if (error) {
            setBusy(false);
            return setErr("Password saved — please sign in.");
          }
          window.location.href = "/";
        }}
      >
        <input type="email" name="username" autoComplete="username" value={info.email} readOnly hidden />
        <label className="field">
          <span>New password (8+ characters)</span>
          <input name="password" type="password" autoComplete="new-password" minLength={8} required autoFocus />
        </label>
        <label className="field">
          <span>Type it again</span>
          <input name="confirm" type="password" autoComplete="new-password" minLength={8} required />
        </label>
        {err && <p className="error">{err}</p>}
        <button className="btn primary" disabled={busy}>
          {busy ? "Saving…" : info.kind === "invite" ? "Create my account" : "Save new password"}
        </button>
      </form>
    </>
  );
}
