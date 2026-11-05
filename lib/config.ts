// Public Supabase settings for the "Rifah's Kaleidoscope" project. These are safe to ship
// to the browser (row-level security protects the data); env vars override them.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://cqirofbbxoedbirijnva.supabase.co";
export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_B82mhukrFBDmZXBD34L9WA_2cnvcNjR";
