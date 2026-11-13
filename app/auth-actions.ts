"use server";

import { requireAdmin } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase-server";
import { siteUrl } from "@/lib/site";
import { hashToken, issueLink, ROLE_LABEL } from "@/lib/links";
import { firstNameFrom, renderEmail, SAMPLE_VARS, type EmailTemplate } from "@/lib/email-render";
import { sendMail } from "@/lib/mailer";
import type { TeamRole } from "@/lib/types";

type Result = { ok: boolean; message?: string; link?: string };
const ROLES: TeamRole[] = ["owner", "admin", "staff"];
const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

async function requireOwner() {
  const me = await requireAdmin();
  if (me.role !== "owner") throw new Error("Only owners can do this");
  return me;
}

/** Owner invites someone: name, email and role are all required. */
export async function createInvite(input: { name: string; email: string; role: string }): Promise<Result> {
  let me;
  try {
    me = await requireOwner();
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  // "custom:<key>" is a role made in Settings → Roles: the person is Staff underneath, with that role's access.
  const roleKey = input.role.startsWith("custom:") ? input.role.slice(7) : null;
  const role = (roleKey ? "staff" : input.role) as TeamRole;
  if (!name) return { ok: false, message: "Enter their name" };
  if (!validEmail(email)) return { ok: false, message: "Enter a valid email" };
  if (!ROLES.includes(role)) return { ok: false, message: "Choose a role" };

  const admin = supabaseAdmin();
  if (roleKey) {
    const { data: r } = await admin.from("roles").select("key").eq("key", roleKey).maybeSingle();
    if (!r) return { ok: false, message: "That role no longer exists" };
  }
  const { data: existing } = await admin.from("profiles").select("id, active").eq("email", email).maybeSingle();
  let userId = existing?.id as string | undefined;

  if (existing?.active) {
    const { data: pending } = await admin.from("invites").select("id").eq("user_id", existing.id).eq("kind", "invite").is("used_at", null).limit(1);
    if (!pending?.length) return { ok: false, message: `${email} is already on the team. Use “Send set-password link” on their row instead.` };
  }
  if (!userId) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: name },
      app_metadata: { invited_role: role },
    });
    if (error && !/already/i.test(error.message)) return { ok: false, message: error.message };
    if (data?.user) userId = data.user.id;
    else {
      const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
      userId = list?.users.find((u) => u.email?.toLowerCase() === email)?.id;
    }
  }
  if (!userId) return { ok: false, message: "Couldn't create the account" };
  await admin.from("profiles").upsert({ id: userId, email, full_name: name, role, role_key: roleKey, active: true }, { onConflict: "id" });

  try {
    const r = await issueLink({
      kind: "invite",
      userId,
      email,
      fullName: name,
      role,
      createdBy: me.id,
      inviterName: me.full_name || me.email,
      site: await siteUrl(),
      validDays: 7,
    });
    return { ok: true, link: r.link, message: r.status };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

/** Owner sends an existing member a link to (re)set their password. */
export async function createSetPasswordLink(userId: string): Promise<Result> {
  let me;
  try {
    me = await requireOwner();
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
  const admin = supabaseAdmin();
  const { data: p } = await admin.from("profiles").select("id, email, full_name, role, active").eq("id", userId).single();
  if (!p?.active) return { ok: false, message: "That person isn't active on the team" };
  const r = await issueLink({
    kind: "reset",
    userId: p.id,
    email: p.email,
    fullName: p.full_name,
    role: p.role,
    createdBy: me.id,
    inviterName: me.full_name || me.email,
    site: await siteUrl(),
    validDays: 7,
  });
  return { ok: true, link: r.link, message: r.status };
}

/** "Forgot password" from the login page. Same answer whether or not the email exists. */
export async function requestPasswordReset(emailRaw: string): Promise<Result> {
  const email = emailRaw.trim().toLowerCase();
  const generic = { ok: true, message: "If that email is on the team, a link to set a new password is on its way." };
  if (!validEmail(email)) return { ok: false, message: "Enter a valid email" };
  const admin = supabaseAdmin();
  const { data: p } = await admin.from("profiles").select("id, email, full_name, role, active").eq("email", email).maybeSingle();
  if (!p?.active) return generic;
  // At most one reset email per 2 minutes per person.
  const { data: recent } = await admin
    .from("invites").select("id").eq("user_id", p.id).eq("kind", "reset")
    .gt("created_at", new Date(Date.now() - 120_000).toISOString()).limit(1);
  if (recent?.length) return generic;
  await issueLink({
    kind: "reset",
    userId: p.id,
    email: p.email,
    fullName: p.full_name,
    role: p.role,
    createdBy: null,
    inviterName: "Kaleidoscope Core",
    site: await siteUrl(),
    validDays: 1 / 12, // 2 hours
  });
  return generic;
}

async function findLink(token: string) {
  if (!token || token.length < 20) return null;
  const { data } = await supabaseAdmin().from("invites").select("*").eq("token_hash", hashToken(token)).maybeSingle();
  if (!data || data.used_at || new Date(data.expires_at).getTime() < Date.now()) return null;
  return data as { id: string; kind: string; user_id: string; email: string; full_name: string; role: TeamRole | null };
}

/** Used by /join to greet the person before they pick a password. */
export async function checkLink(token: string) {
  const l = await findLink(token);
  if (!l) return { ok: false as const };
  return { ok: true as const, kind: l.kind, email: l.email, name: l.full_name, role: l.role ? ROLE_LABEL[l.role] : "" };
}

/** Set the password from a one-time link. The browser then signs in with it. */
export async function completeLink(token: string, password: string): Promise<Result & { email?: string }> {
  if (password.length < 8) return { ok: false, message: "Use at least 8 characters" };
  const l = await findLink(token);
  if (!l) return { ok: false, message: "This link has expired or was already used. Ask an owner for a new one." };
  const admin = supabaseAdmin();
  const { error } = await admin.auth.admin.updateUserById(l.user_id, { password, email_confirm: true });
  if (error) return { ok: false, message: error.message };
  await admin.from("invites").update({ used_at: new Date().toISOString() }).eq("id", l.id);
  await admin.from("profiles").update({ active: true }).eq("id", l.user_id);
  return { ok: true, email: l.email };
}

/** Templates page: send a sample of a template to yourself. */
export async function sendTestEmail(t: EmailTemplate): Promise<Result> {
  let me;
  try {
    me = await requireAdmin();
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
  const site = await siteUrl();
  const msg = renderEmail(t, { ...SAMPLE_VARS, first_name: firstNameFrom(me.full_name, me.email), name: me.full_name || firstNameFrom(me.full_name, me.email), email: me.email }, `${site}/join?t=sample`, site);
  const r = await sendMail(me.email, { ...msg, subject: `[Test] ${msg.subject}` });
  return { ok: r.sent, message: r.status };
}

/** Templates page: is email sending connected, and as whom? (No secrets returned.) */
export async function emailSetup() {
  await requireAdmin();
  const from = process.env.EMAIL_FROM || "Kaleidoscope by Rifah <no-reply@rifahs.com>";
  if (process.env.SMTP_USER && process.env.SMTP_PASS)
    return { ready: true, text: `Sending as ${from} through ${process.env.SMTP_USER} (Google Workspace).` };
  if (process.env.RESEND_API_KEY) return { ready: true, text: `Sending as ${from} through Resend.` };
  return { ready: false, text: "Email sending isn't connected yet — links can still be copied from the Team page." };
}
