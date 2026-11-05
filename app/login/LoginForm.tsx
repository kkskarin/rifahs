"use client";

import { useActionState } from "react";
import { sendCode, verifyCode, type LoginState } from "./actions";

export default function LoginForm({ next, error }: { next: string; error?: string }) {
  const [sent, send, sending] = useActionState<LoginState, FormData>(sendCode, { step: "email", error });
  const [checked, verify, verifying] = useActionState<LoginState, FormData>(verifyCode, { step: "code" });

  if (sent.step === "code") {
    return (
      <form action={verify}>
        <input type="hidden" name="email" value={sent.email} />
        <input type="hidden" name="next" value={next} />
        <p className="hint" style={{ textAlign: "center" }}>
          {sent.info} Sent to <b>{sent.email}</b>.
        </p>
        <label className="field">
          <span>Code</span>
          <input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            placeholder="123456"
            style={{ letterSpacing: "0.3em", textAlign: "center", fontSize: 20 }}
          />
        </label>
        {checked.error && <p className="error">{checked.error}</p>}
        <button className="btn primary" disabled={verifying}>
          {verifying ? "Checking…" : "Sign in"}
        </button>
        <p className="hint" style={{ textAlign: "center" }}>
          You can also tap the link in the email.
        </p>
      </form>
    );
  }

  return (
    <form action={send}>
      <label className="field">
        <span>Work email</span>
        <input name="email" type="email" autoComplete="email" autoFocus defaultValue={sent.email} required />
      </label>
      {sent.error && <p className="error">{sent.error}</p>}
      <button className="btn primary" disabled={sending}>
        {sending ? "Sending…" : "Email me a sign-in code"}
      </button>
    </form>
  );
}
