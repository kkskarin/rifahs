import "server-only";
import crypto from "node:crypto";
import { supabaseAdmin } from "./supabase-server";
import { renderEmail, type EmailTemplate } from "./email-render";
import { sendMail } from "./mailer";
import type { TeamRole } from "./types";

export const ROLE_LABEL: Record<TeamRole, string> = { owner: "Owner", admin: "Admin", staff: "Staff" };
const DAY = 86_400_000;

export const hashToken = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

/** Create a one-time link for a user, email it with the branded template, return the link. */
export async function issueLink(opts: {
  kind: "invite" | "reset";
  userId: string;
  email: string;
  fullName: string;
  role: TeamRole | null;
  createdBy: string | null;
  inviterName: string;
  site: string;
  validDays: number;
}) {
  const admin = supabaseAdmin();
  const token = crypto.randomBytes(32).toString("base64url");
  const link = `${opts.site}/join?t=${token}`;
  const expires = opts.validDays >= 1 ? `${opts.validDays} day${opts.validDays === 1 ? "" : "s"}` : `${Math.round(opts.validDays * 24)} hours`;

  // Older unused links for this person stop working.
  await admin.from("invites").update({ used_at: new Date().toISOString(), email_status: "Replaced by a newer link" })
    .eq("user_id", opts.userId).is("used_at", null);

  const { data: row, error } = await admin
    .from("invites")
    .insert({
      kind: opts.kind,
      user_id: opts.userId,
      email: opts.email,
      full_name: opts.fullName,
      role: opts.role,
      token_hash: hashToken(token),
      expires_at: new Date(Date.now() + opts.validDays * DAY).toISOString(),
      created_by: opts.createdBy,
    })
    .select("id")
    .single();
  if (error) throw error;

  const { data: tpl } = await admin.from("email_templates").select("*").eq("key", opts.kind).single();
  let status = "Template missing — copy the link instead.";
  if (tpl) {
    const msg = renderEmail(
      tpl as EmailTemplate,
      {
        first_name: opts.fullName.split(" ")[0] || "there",
        name: opts.fullName,
        email: opts.email,
        role: opts.role ? ROLE_LABEL[opts.role] : "",
        inviter: opts.inviterName,
        expires,
      },
      link,
      opts.site,
    );
    status = (await sendMail(opts.email, msg)).status;
  }
  await admin.from("invites").update({ email_status: status }).eq("id", row.id);
  return { link, status };
}
