import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase-server";

// Handles the magic link in the sign-in email (both PKCE `code` and `token_hash` styles).
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const supabase = await supabaseServer();
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = (url.searchParams.get("type") ?? "email") as EmailOtpType;

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error("missing token") };

  return NextResponse.redirect(new URL(error ? "/login?error=link" : "/", url.origin));
}
