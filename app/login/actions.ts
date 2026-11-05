"use server";

import { redirect } from "next/navigation";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase-server";
import { siteUrl } from "@/lib/site";

export type LoginState = { step: "email" | "code"; email?: string; error?: string; info?: string };

const norm = (e: FormDataEntryValue | null) => String(e ?? "").trim().toLowerCase();

export async function sendCode(_: LoginState, form: FormData): Promise<LoginState> {
  const email = norm(form.get("email"));
  if (!/^\S+@\S+\.\S+$/.test(email)) return { step: "email", error: "Enter a valid email address." };

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { step: "email", error: "Setup isn't finished: SUPABASE_SERVICE_ROLE_KEY is missing on Netlify." };
  }
  const admin = supabaseAdmin();
  const { count } = await admin.from("profiles").select("id", { count: "exact", head: true });

  if (!count) {
    // First run: only the configured owner may create the workspace.
    const owner = (process.env.BOOTSTRAP_OWNER_EMAIL ?? "").trim().toLowerCase();
    if (!owner || email !== owner) {
      return { step: "email", error: "This workspace hasn't been set up yet. Ask the owner to sign in first." };
    }
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      app_metadata: { bootstrap_owner: true },
    });
    if (created?.user) {
      await admin
        .from("profiles")
        .upsert({ id: created.user.id, email, role: "owner", active: true }, { onConflict: "id", ignoreDuplicates: true });
    }
    if (error && !/already/i.test(error.message)) return { step: "email", error: error.message };
    if (error) {
      // The auth user already existed (e.g. signed up earlier) — attach the owner profile directly.
      const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
      const u = list?.users.find((x) => x.email?.toLowerCase() === email);
      if (!u) return { step: "email", error: "Couldn't set up the owner account." };
      await admin.from("profiles").upsert({ id: u.id, email, role: "owner", active: true });
    }
  } else {
    const { data: p } = await admin.from("profiles").select("active").eq("email", email).maybeSingle();
    // Same message either way, so the form doesn't reveal who is on the team.
    if (!p?.active) return { step: "code", email, info: "If this email is on the team, a code is on its way." };
  }

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${await siteUrl()}/auth/callback`,
    },
  });
  if (error) return { step: "email", email, error: error.message };
  return { step: "code", email, info: "If this email is on the team, a code is on its way." };
}

export async function verifyCode(_: LoginState, form: FormData): Promise<LoginState> {
  const email = norm(form.get("email"));
  const token = String(form.get("code") ?? "").replace(/\s/g, "");
  const next = String(form.get("next") ?? "/orders");
  if (!/^\d{6,10}$/.test(token)) return { step: "code", email, error: "Enter the code from the email." };

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) return { step: "code", email, error: "That code didn't work — check it or send a new one." };
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/orders");
}

export async function signOut() {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect("/login");
}
