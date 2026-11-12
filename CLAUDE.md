# Working on this repo

## Deploys cost money — follow this workflow
- Netlify charges credits for every **production** deploy (each push to `main`). Branch deploys are free.
- Commit and push all work to the **`preview`** branch. Netlify builds it for free at
  https://preview--rifahs.netlify.app so changes can be checked there.
- **Never push to `main`** unless the user explicitly says to deploy / go live. Then fast-forward `main`
  to `preview` (one production deploy for the whole batch).
- Database changes (Supabase) are live immediately and shared by preview and production — make them
  backwards-compatible, and mention them when asking to deploy.

## Stack
Next.js (static pages; data loaded in the browser from Supabase with row-level security),
Supabase project "Rifah's Kaleidoscope" (cqirofbbxoedbirijnva, Mumbai), Netlify hosting,
Shopify: orders and stock are read by the sync. Allowed writes (each at the user's request, all in
`lib/shopify.ts`): `createShopifyOrder` (manual entry → Shopify order), `updateOrderDetails`
(customer email / shipping address), `changeLineSize` (order edit), `fulfillOrder` (dispatch; customer
emailed only when the box is ticked). Never cancel or refund Shopify orders, never change Shopify stock
or prices, and never send customer emails by default.
