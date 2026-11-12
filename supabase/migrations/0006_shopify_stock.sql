-- Read-only copy of Shopify's available quantities (applied live as "shopify_stock").
create table if not exists public.shopify_stock (
  variant_id bigint primary key, product_id bigint not null, product_title text not null,
  variant_title text not null default '', product_status text not null default '',
  quantity int, synced_at timestamptz not null default now()
);
alter table public.shopify_stock enable row level security;
create policy "team reads shopify stock" on public.shopify_stock for select using (public.is_team_member());
alter table public.orders add column if not exists shipping_charge numeric(12,2) not null default 0, add column if not exists tax_mode text not null default 'none', add column if not exists tax_type text not null default '', add column if not exists amount_paid numeric(12,2), add column if not exists payment_terms text not null default '';
alter table public.shopify_stock add column if not exists price numeric(12,2);
