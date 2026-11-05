import OpsShell from "@/components/OpsShell";

// Static shell — served from Netlify's CDN. Data loads in the browser straight from Supabase.
export default function OpsLayout({ children }: { children: React.ReactNode }) {
  return <OpsShell>{children}</OpsShell>;
}
