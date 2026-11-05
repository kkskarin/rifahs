// Hourly safety net: pulls any Shopify orders the webhooks missed.
// Netlify runs this on a schedule; it calls the app's own sync endpoint.
export default async () => {
  const base = process.env.URL; // set by Netlify to the site's primary URL
  const res = await fetch(`${base}/api/cron/shopify-sync`, {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  console.log("shopify-sync", res.status, await res.text());
};

export const config = { schedule: "17 * * * *" };
