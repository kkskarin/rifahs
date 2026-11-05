import { requireAdmin } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase-server";
import { shortDate } from "@/lib/format";
import type { Profile } from "@/lib/types";
import InviteForm from "@/components/InviteForm";
import MemberControls from "@/components/MemberControls";

export const metadata = { title: "Team" };

export default async function TeamPage() {
  const me = await requireAdmin();
  const db = await supabaseServer();
  const { data } = await db.from("profiles").select("*").order("created_at");
  const people = (data ?? []) as Profile[];

  return (
    <>
      <InviteForm canMakeOwner={me.role === "owner"} />
      <div className="panel">
        <h3>Who has access</h3>
        <p className="hint" style={{ marginTop: -6 }}>
          <b>Owner / Admin</b> see everything including money, and manage the team and Shopify. <b>Staff</b> see orders,
          express, international and issues — no money.
        </p>
        <div className="scroll-x">
          <table className="t">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Since</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id} style={{ opacity: p.active ? 1 : 0.5 }}>
                  <td>{p.full_name || "—"}</td>
                  <td>{p.email}</td>
                  <td style={{ textTransform: "capitalize" }}>{p.active ? p.role : "Removed"}</td>
                  <td>{shortDate(p.created_at)}</td>
                  <td>{p.id !== me.id && <MemberControls p={p} canMakeOwner={me.role === "owner"} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
