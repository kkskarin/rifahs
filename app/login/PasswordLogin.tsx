"use client";

import { useState } from "react";
import { requestPasswordReset } from "../auth-actions";
import { sb } from "@/lib/supabase-browser";
import LoginForm from "./LoginForm";

export default function PasswordLogin({ next, error }: { next: string; error?: string }) {
  const [mode, setMode] = useState<"password" | "forgot" | "code">("password");
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(error ? { ok: false, text: error } : null);
  const [busy, setBusy] = useState(false);
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  if (mode === "code") {
    return (
      <>
        <LoginForm next={safeNext} />
        <p className="hint" style={{ textAlign: "center", marginTop: 14 }}>
          <button className="link" onClick={() => setMode("password")}>
            ← Sign in with password
          </button>
        </p>
      </>
    );
  }

  if (mode === "forgot") {
    return (
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const r = await requestPasswordReset(email);
          setBusy(false);
          setMsg({ ok: r.ok, text: r.message ?? "" });
        }}
      >
        <label className="field">
          <span>Work email</span>
          <input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </label>
        {msg && <p className={msg.ok ? "success" : "error"}>{msg.text}</p>}
        <button className="btn primary" disabled={busy}>
          {busy ? "Sending…" : "Email me a link"}
        </button>
        <p className="hint" style={{ textAlign: "center" }}>
          <button type="button" className="link" onClick={() => (setMode("password"), setMsg(null))}>
            ← Back to sign in
          </button>
        </p>
      </form>
    );
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        const { error } = await sb().auth.signInWithPassword({
          email: String(f.get("email") ?? "").trim().toLowerCase(),
          password: String(f.get("password") ?? ""),
        });
        setBusy(false);
        if (error) {
          setMsg({ ok: false, text: /invalid/i.test(error.message) ? "That email and password don't match." : error.message });
          return;
        }
        window.location.href = safeNext;
      }}
    >
      <label className="field">
        <span>Work email</span>
        <input name="email" type="email" autoComplete="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="field">
        <span>Password</span>
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      {msg && <p className={msg.ok ? "success" : "error"}>{msg.text}</p>}
      <button className="btn primary" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
      <p className="hint" style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <button type="button" className="link" onClick={() => (setMode("forgot"), setMsg(null))}>
          Forgot password?
        </button>
        <button type="button" className="link" onClick={() => setMode("code")}>
          Email me a code instead
        </button>
      </p>
    </form>
  );
}
