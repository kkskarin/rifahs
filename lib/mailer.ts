import "server-only";

/** Send through Resend (https://resend.com). Returns a short status we store and show. */
export async function sendMail(to: string, msg: { subject: string; html: string; text: string }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, status: "Email sending isn't set up yet — copy the link instead." };
  const from = process.env.EMAIL_FROM || "Kaleidoscope by Rifah <no-reply@rifahs.com>";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject: msg.subject, html: msg.html, text: msg.text }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { sent: false, status: `Email failed (${res.status}): ${body.slice(0, 160)}` };
    }
    return { sent: true, status: `Emailed to ${to}` };
  } catch (e) {
    return { sent: false, status: `Email failed: ${(e as Error).message}` };
  }
}
