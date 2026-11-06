import "server-only";
import nodemailer from "nodemailer";

type Msg = { subject: string; html: string; text: string };

const FROM = () => process.env.EMAIL_FROM || "Kaleidoscope by Rifah <no-reply@rifahs.com>";

/**
 * Sends through Google Workspace (SMTP_USER = operations@rifahs.com + an app password), so mail is
 * sent and signed by Google for rifahs.com. Resend is supported as an alternative if RESEND_API_KEY is set.
 * Returns a short status we store and show.
 */
export async function sendMail(to: string, msg: Msg) {
  if (process.env.SMTP_USER && process.env.SMTP_PASS) return viaGoogle(to, msg);
  if (process.env.RESEND_API_KEY) return viaResend(to, msg);
  return { sent: false, status: "Email sending isn't set up yet — copy the link instead." };
}

let transport: nodemailer.Transporter | null = null;

async function viaGoogle(to: string, msg: Msg) {
  try {
    transport ??= nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT || 465),
      secure: true,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS!.replace(/\s+/g, "") },
    });
    await transport.sendMail({
      from: FROM(),
      to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      replyTo: process.env.EMAIL_REPLY_TO || undefined,
    });
    return { sent: true, status: `Emailed to ${to}` };
  } catch (e) {
    transport = null;
    const m = (e as Error).message;
    const hint = /Invalid login|535|Username and Password/i.test(m)
      ? " — check SMTP_USER and the app password in Netlify."
      : "";
    return { sent: false, status: `Email failed: ${m.slice(0, 140)}${hint}` };
  }
}

async function viaResend(to: string, msg: Msg) {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM(), to: [to], subject: msg.subject, html: msg.html, text: msg.text }),
    });
    if (!res.ok) return { sent: false, status: `Email failed (${res.status}): ${(await res.text()).slice(0, 160)}` };
    return { sent: true, status: `Emailed to ${to}` };
  } catch (e) {
    return { sent: false, status: `Email failed: ${(e as Error).message}` };
  }
}
