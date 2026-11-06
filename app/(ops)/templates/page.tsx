"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR, { mutate } from "swr";
import { sendTestEmail } from "../../auth-actions";
import { fill, renderEmail, SAMPLE_VARS, TEMPLATE_VARIABLES, type EmailTemplate } from "@/lib/email-render";
import { dateTime } from "@/lib/format";
import { isAdmin } from "@/lib/roles";
import { safe } from "@/lib/safe";
import { useMe } from "@/lib/store";
import { sb } from "@/lib/supabase-browser";

type Row = EmailTemplate & { updated_at: string };

export default function TemplatesPage() {
  const { data: me } = useMe();
  const admin = me ? isAdmin(me) : false;
  const { data: templates } = useSWR<Row[]>(admin ? "templates" : null, async () => {
    const { data, error } = await sb().from("email_templates").select("*").order("key");
    if (error) throw error;
    return (data ?? []) as Row[];
  });
  const [key, setKey] = useState("invite");
  const [draft, setDraft] = useState<EmailTemplate | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const current = templates?.find((t) => t.key === key);
  useEffect(() => {
    if (current) setDraft({ ...current });
    setMsg(null);
  }, [current]);

  const preview = useMemo(() => {
    if (!draft) return null;
    const origin = typeof window !== "undefined" ? window.location.origin : "https://core.rifahs.com";
    return renderEmail(draft, SAMPLE_VARS, `${origin}/join?t=example`, origin);
  }, [draft]);

  if (me && !admin) return <p className="empty">Only owners and admins can edit email templates.</p>;
  if (!templates || !draft) return <p className="empty">Loading templates…</p>;

  const set = (k: keyof EmailTemplate) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setDraft((d) => (d ? { ...d, [k]: e.target.value } : d));
  const dirty = JSON.stringify(draft) !== JSON.stringify(Object.fromEntries(Object.keys(draft).map((k) => [k, current?.[k as keyof EmailTemplate]])));

  return (
    <>
      <div className="page-head">
        <h1>Email templates</h1>
        <p>The emails Kaleidoscope Core sends from no-reply@rifahs.com. Edit the words here; the design stays on-brand.</p>
      </div>

      <nav className="chips">
        {templates.map((t) => (
          <button key={t.key} className="chip" aria-current={t.key === key ? "true" : undefined} onClick={() => setKey(t.key)}>
            <b>{t.name}</b>
          </button>
        ))}
      </nav>

      <div className="tpl-grid">
        <form
          className="panel"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const { error } = await sb()
              .from("email_templates")
              .update({
                subject: draft.subject,
                preheader: draft.preheader,
                heading: draft.heading,
                body: draft.body,
                button_label: draft.button_label,
                footnote: draft.footnote,
                updated_by: me?.id,
              })
              .eq("key", key);
            setBusy(false);
            setMsg(error ? { ok: false, text: error.message } : { ok: true, text: "Saved" });
            mutate("templates");
          }}
        >
          <label className="field">
            <span>Subject line</span>
            <input value={draft.subject} onChange={set("subject")} required />
          </label>
          <label className="field">
            <span>Preview text (shown next to the subject in the inbox)</span>
            <input value={draft.preheader} onChange={set("preheader")} />
          </label>
          <label className="field">
            <span>Heading</span>
            <input value={draft.heading} onChange={set("heading")} required />
          </label>
          <label className="field">
            <span>Message (leave a blank line between paragraphs)</span>
            <textarea value={draft.body} onChange={set("body")} rows={8} required />
          </label>
          <label className="field">
            <span>Button</span>
            <input value={draft.button_label} onChange={set("button_label")} required />
          </label>
          <label className="field">
            <span>Small print</span>
            <textarea value={draft.footnote} onChange={set("footnote")} rows={2} />
          </label>
          <p className="hint">
            You can use:{" "}
            {TEMPLATE_VARIABLES.map((v) => (
              <span key={v.key} title={v.about} className="var-chip">
                {`{${v.key}}`}
              </span>
            ))}
          </p>
          {msg && <p className={msg.ok ? "success" : "error"}>{msg.text}</p>}
          <div className="form-actions" style={{ justifyContent: "space-between" }}>
            <span className="hint">{current ? `Last saved ${dateTime(current.updated_at)}` : ""}</span>
            <span style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                className="btn ghost"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  const r = (await safe(() => sendTestEmail(draft))) as { ok: boolean; message?: string };
                  setBusy(false);
                  setMsg({ ok: r.ok, text: r.message ?? "" });
                }}
              >
                Send me a test
              </button>
              <button className="btn primary" disabled={busy || !dirty}>
                {busy ? "Saving…" : "Save"}
              </button>
            </span>
          </div>
        </form>

        <div className="tpl-preview">
          <div className="tpl-inbox">
            <b>{preview?.subject}</b>
            <span>Kaleidoscope by Rifah &lt;no-reply@rifahs.com&gt; — {fill(draft.preheader, SAMPLE_VARS)}</span>
          </div>
          <iframe title="Email preview" srcDoc={preview?.html} sandbox="" />
        </div>
      </div>
    </>
  );
}
