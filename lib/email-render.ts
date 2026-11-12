// Branded email, built for white-background mail apps (Gmail, Outlook, Apple Mail, phones):
// table layout, inline styles, web-safe serif for headings, one wine button.

export type EmailTemplate = {
  key: string;
  name: string;
  subject: string;
  preheader: string;
  heading: string;
  body: string;
  button_label: string;
  footnote: string;
};

export type EmailVars = Record<string, string>;

export const TEMPLATE_VARIABLES: { key: string; about: string }[] = [
  { key: "first_name", about: "Their first name" },
  { key: "name", about: "Their full name" },
  { key: "email", about: "Their email address" },
  { key: "role", about: "Owner / Admin / Staff" },
  { key: "inviter", about: "Who sent it" },
  { key: "expires", about: "How long the link lasts" },
];

const C = { ink: "#2A1416", muted: "#6B5557", wine: "#822537", cream: "#F4EAC4", line: "#E8DFC7" };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function fill(text: string, vars: EmailVars) {
  return text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}

/** "arin.kumar@x.com" → "Arin" — used when someone's name isn't saved. */
export function firstNameFrom(name: string | null | undefined, email: string) {
  const n = (name ?? "").trim().split(/\s+/)[0];
  if (n) return n;
  const local = email.split("@")[0].split(/[._\-+0-9]/)[0];
  return local ? local[0].toUpperCase() + local.slice(1).toLowerCase() : "there";
}

export function renderEmail(t: EmailTemplate, vars: EmailVars, link: string, assetBase: string) {
  const v = (s: string) => esc(fill(s, vars));
  const paragraphs = fill(t.body, vars)
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:${C.ink};">${esc(p).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
  const serif = `'Fraunces','Iowan Old Style',Georgia,'Times New Roman',serif`;

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only">
<style>:root{color-scheme:light only;supported-color-schemes:light only;}</style>
<title>${v(t.subject)}</title>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;1,400&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:#ffffff;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#ffffff;">${v(t.preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;">
<tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;border:1px solid ${C.line};border-radius:8px;overflow:hidden;">
    <tr><td align="center" bgcolor="${C.cream}" style="background-color:${C.cream};background-image:linear-gradient(${C.cream},${C.cream});padding:28px 24px;">
      <img src="${assetBase}/logo.png" width="220" alt="KALEIDOSCOPE by Rifah" style="display:block;width:220px;max-width:70%;height:auto;border:0;font-family:Georgia,'Times New Roman',serif;font-size:22px;letter-spacing:0.12em;color:${C.wine};text-align:center;">
    </td></tr>
    <tr><td bgcolor="${C.wine}" style="height:3px;background-color:${C.wine};background-image:linear-gradient(${C.wine},${C.wine});line-height:3px;font-size:0;">&nbsp;</td></tr>
    <tr><td style="padding:36px 36px 8px;background:#ffffff;">
      <h1 style="margin:0 0 20px;font-family:${serif};font-weight:400;font-size:28px;line-height:1.25;color:${C.ink};">${v(t.heading)}</h1>
      ${paragraphs}
    </td></tr>
    <tr><td align="left" style="padding:8px 36px 28px;background:#ffffff;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td bgcolor="${C.wine}" style="background-color:${C.wine};background-image:linear-gradient(${C.wine},${C.wine});border-radius:4px;">
          <a href="${esc(link)}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:Helvetica,Arial,sans-serif;font-size:13px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:#ffffff;text-decoration:none;">${v(t.button_label)}</a>
        </td>
      </tr></table>
      <p style="margin:18px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:${C.muted};">Button not working? Paste this link into your browser:<br><a href="${esc(link)}" style="color:${C.wine};word-break:break-all;">${esc(link)}</a></p>
    </td></tr>
    ${
      t.footnote
        ? `<tr><td style="padding:18px 36px;border-top:1px solid ${C.line};">
      <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:${C.muted};">${v(t.footnote)}</p>
    </td></tr>`
        : ""
    }
  </table>
  <p style="margin:18px 0 0;font-family:${serif};font-style:italic;font-size:14px;color:${C.muted};">Kaleidoscope by Rifah · Every angle, a new self.</p>
  <p style="margin:4px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:11px;color:#9a8b8c;">Sent from Kaleidoscope Core · rifahs.com — please don't reply to this address.</p>
</td></tr>
</table>
</body></html>`;

  const text = [
    fill(t.heading, vars),
    "",
    fill(t.body, vars),
    "",
    `${fill(t.button_label, vars)}: ${link}`,
    "",
    fill(t.footnote, vars),
    "",
    "Kaleidoscope by Rifah · rifahs.com",
  ].join("\n");

  return { subject: fill(t.subject, vars), html, text };
}

export const SAMPLE_VARS: EmailVars = {
  first_name: "Amma",
  name: "Amma",
  email: "amma@example.com",
  role: "Admin",
  inviter: "Arin",
  expires: "7 days",
};
