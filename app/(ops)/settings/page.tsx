import { requireAdmin } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase-server";
import { shopifyAdminUrl, shopifyConfigured } from "@/lib/shopify";
import { dateTime } from "@/lib/format";
import ShopifyButtons from "@/components/ShopifyButtons";

export const metadata = { title: "Shopify" };

export default async function SettingsPage() {
  await requireAdmin();
  const db = await supabaseServer();
  const [{ data: state }, { count: synced }] = await Promise.all([
    db.from("sync_state").select("value, updated_at").eq("key", "shopify_orders").maybeSingle(),
    db.from("orders").select("id", { count: "exact", head: true }).not("shopify_id", "is", null),
  ]);
  const ready = shopifyConfigured();
  const store = process.env.SHOPIFY_STORE_DOMAIN ?? "xd1uww-uu.myshopify.com";

  return (
    <div className="panel">
      <h2>Shopify connection</h2>
      <table className="t" style={{ marginBottom: 18 }}>
        <tbody>
          <tr>
            <td>Store</td>
            <td>
              <a className="link" href={shopifyAdminUrl()} target="_blank" rel="noreferrer">
                {store} ↗
              </a>
            </td>
          </tr>
          <tr>
            <td>API access</td>
            <td className={ready ? "success" : "error"}>{ready ? "Connected" : "Not set up — add the Shopify keys to the server"}</td>
          </tr>
          <tr>
            <td>Orders from Shopify</td>
            <td>{synced ?? 0}</td>
          </tr>
          <tr>
            <td>Last sync</td>
            <td>{state?.updated_at ? dateTime(state.updated_at) : "Never"}</td>
          </tr>
        </tbody>
      </table>
      <p className="hint">
        New and updated orders arrive instantly through webhooks; a background sync runs every hour as a safety net. Your
        team&apos;s statuses and notes are never overwritten — Shopify only moves an order forward when it&apos;s fulfilled,
        cancelled or refunded there.
      </p>
      <ShopifyButtons disabled={!ready} />
    </div>
  );
}
