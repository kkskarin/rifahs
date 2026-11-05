"use server";

// Only the jobs that need server-side secrets live here: adding/removing team members
// (Supabase admin key) and the Shopify sync (Shopify keys). Everything else runs in the browser.
import { requireAdmin } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase-server";
import { shopifyConfigured } from "@/lib/shopify";
import { syncBudgetMs, syncRecent } from "@/lib/sync";
import { siteUrl } from "@/lib/site";
import type { TeamRole } from "@/lib/types";

export type ActionResult = { ok: boolean; message?: string };

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

// ───────────────────────── Team ─────────────────────────

export async function inviteMember(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const me = await requireAdmin();
  const email = str(form, "email").toLowerCase();
  const role = (str(form, "role") || "staff") as TeamRole;
  if (!/^\S+@\S+\.\S+$/.test(email)) return { ok: false, message: "Enter a valid email" };
  if (role === "owner" && me.role !== "owner") return { ok: false, message: "Only the owner can add another owner" };

  const admin = supabaseAdmin();
  const { data: existing } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
  if (existing) {
    await admin.from("profiles").update({ active: true, role }).eq("id", existing.id);
  } else {
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      app_metadata: { invited_role: role },
      user_metadata: { full_name: str(form, "full_name") },
    });
    if (error) return { ok: false, message: error.message };
    // Don't rely only on the database trigger — make sure the profile exists.
    await admin
      .from("profiles")
      .upsert({ id: created.user.id, email, full_name: str(form, "full_name"), role, active: true }, { onConflict: "id", ignoreDuplicates: true });
  }
  return { ok: true, message: `${email} can now sign in at ${await siteUrl()}` };
}

export async function updateMember(id: string, patch: { role?: TeamRole; active?: boolean }): Promise<ActionResult> {
  const me = await requireAdmin();
  if (id === me.id) return { ok: false, message: "You can't change your own access" };
  const admin = supabaseAdmin();
  const { data: target } = await admin.from("profiles").select("role").eq("id", id).single();
  if ((target?.role === "owner" || patch.role === "owner") && me.role !== "owner")
    return { ok: false, message: "Only the owner can change an owner" };
  const { error } = await admin.from("profiles").update(patch).eq("id", id);
  if (error) return { ok: false, message: error.message };
  if (patch.active === false) await admin.auth.admin.signOut(id).catch(() => undefined);
  return { ok: true };
}

// ───────────────────────── Shopify ─────────────────────────

export async function syncShopifyNow(): Promise<ActionResult> {
  await requireAdmin();
  if (!shopifyConfigured()) return { ok: false, message: "Shopify credentials aren't set yet" };
  try {
    const r = await syncRecent(syncBudgetMs());
      return {
      ok: true,
      message: `${r.created} new, ${r.updated} updated${r.done ? "" : " — more to fetch, press again"}`,
    };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}
