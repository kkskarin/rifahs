import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { supabaseServer } from "./supabase-server";
import type { Profile } from "./types";

/** The signed-in, active team member. Redirects to /login otherwise. */
export const requireMember = cache(async (): Promise<Profile> => {
  const supabase = await supabaseServer();
  // Verified locally with the project's signing key — no extra round trip to Supabase Auth.
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (!profile || !profile.active) redirect("/login?error=no-access");
  return profile as Profile;
});

export async function requireAdmin(): Promise<Profile> {
  const me = await requireMember();
  if (me.role !== "owner" && me.role !== "admin") redirect("/orders");
  return me;
}

export const isAdmin = (p: Profile) => p.role === "owner" || p.role === "admin";
