# Rifah's Ops — ops.rifahs.com

The team's order book for **Kaleidoscope by Rifah**: orders, express promises, international parcels,
courier issues and money in one place. It syncs live with the Shopify store and has invite-only team login.

Styled after rifahs.com: cream `#F4EAC4`, cocoa ink `#2A1416`, wine `#822537`, Fraunces + Inter.

## What it does

| Tab | |
|---|---|
| **Orders** | Every order (Shopify + manual entries). Filter by status, search by name/product/order #/AWB, bulk-select, CSV export. One tap moves an order along **New → Printing → Stitching → Checking → Ready → Dispatched → Delivered**. |
| **Express** | Express orders still to ship, soonest promise date first, flagged when late. |
| **International** | Overseas orders in progress (auto-detected from the shipping country). |
| **Issues** | Courier problems, damages, returns and exchanges, linked to orders. |
| **Money** *(admins)* | Sales vs expenses by month, expense log by category, approx. profit. |
| **Team** *(admins)* | Give or remove access; roles: Owner, Admin, Staff (staff never see money). |
| **Shopify** *(admins)* | Connection status and "Sync now". Read-only — nothing is ever written to Shopify. |

**Shopify sync (read-only):** the app never writes to Shopify. New and updated orders are pulled every
10 minutes (and on "Sync orders now"). The team's statuses and notes are never overwritten; Shopify only
moves an order forward (fulfilled → Dispatched, cancelled, refunded). Dispatching here does not touch
Shopify.

**Login:** email + 6-digit code (no passwords). Only people added on the Team page can sign in.
Every status change is logged with who did it.

## Stack

Next.js 15 (App Router) · Supabase (Postgres, Auth, row-level security) · Shopify Admin GraphQL API · Netlify.

## Setup

### 1. Supabase — project "Rifah's Kaleidoscope" (`cqirofbbxoedbirijnva`, Mumbai)
The schema in `supabase/migrations/0001_init.sql` is **already applied**. Remaining dashboard settings:
1. Authentication → Sign In / Providers → Email: **turn off "Allow new users to sign up"**
   (the app creates users itself; anyone signing up directly would get no access anyway).
2. Authentication → Email Templates → *Magic Link*: make the email show the code, e.g.
   `Your Rifah's sign-in code is <b>{{ .Token }}</b>` and the link
   `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email`.
3. Authentication → URL Configuration → Site URL = the Netlify address (e.g. `https://rifahs.netlify.app`).
   Add `https://rifahs.netlify.app/**` (and later `https://ops.rifahs.com/**`) to Redirect URLs.
4. Recommended: Authentication → SMTP → your own sender (e.g. `ops@rifahs.com` via Zoho/Resend);
   Supabase's built-in mailer only sends a few emails an hour.
5. Project Settings → API Keys → copy the **secret** key for `SUPABASE_SERVICE_ROLE_KEY`.

### 2. Shopify app
1. Shopify **Dev Dashboard** → create an app → Admin API scopes:
   `read_orders, read_customers` (add `read_all_orders` if Shopify grants it). No write scopes — the app is read-only.
2. Install it on `xd1uww-uu.myshopify.com`; copy the **Client ID** and **Client secret**.

### 3. Netlify
1. Add new site → Import from GitHub → `kkskarin/rifahs`. Build settings come from `netlify.toml`.
2. Site configuration → Environment variables → add everything from `.env.example`
   (`CRON_SECRET`: any long random string; `BOOTSTRAP_OWNER_EMAIL`: the owner's email).
3. Site configuration → change site name to `rifahs` so it lives at https://rifahs.netlify.app.
   *Later:* Domain management → add `ops.rifahs.com` and a DNS **CNAME** `ops → rifahs.netlify.app`
   (rifahs.com itself stays on Shopify). The app picks up the new address automatically; just add it
   to Supabase's Redirect URLs.
4. Open the site and sign in with the bootstrap email — you become Owner.
5. **Shopify tab → Sync orders now** (press until it says done — first run pulls the full history
   in batches). After that a read-only sync runs every 10 minutes.
6. **Team tab** → add Amma and the team.

The 10-minute read-only sync is `netlify/functions/shopify-sync.mjs` (a Netlify scheduled function).

## Email
Invite and password emails are sent from **no-reply@rifahs.com** through the Google Workspace mailbox
operations@rifahs.com (SMTP + app password; see `.env.example`). Wording is edited in the app under
☰ → Email templates.

## Deploying (saves Netlify credits)
- Day-to-day changes go to the `preview` branch → free branch deploy at https://preview--rifahs.netlify.app.
- Production (`main`) is only updated when we decide to go live, batching many changes into one deploy.

## Local development
```bash
cp .env.example .env.local   # fill in
npm install
npm run dev
```
