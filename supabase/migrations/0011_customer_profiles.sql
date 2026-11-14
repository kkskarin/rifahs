-- A customer's cleaned-up details: name, phone with country code and a properly split address.
-- Filled in by Claude (Customers → Clean Up) or typed by the team on the customer's profile.
-- Orders keep exactly what Shopify holds; this is Core's tidy copy, keyed like the customer list.
create table if not exists public.customers (
  key         text primary key,
  name        text not null default '',
  phone       text not null default '',
  email       text not null default '',
  address1    text not null default '',
  address2    text not null default '',
  city        text not null default '',
  district    text not null default '',
  state       text not null default '',
  pin         text not null default '',
  country     text not null default '',
  status      text not null default 'clean' check (status in ('clean', 'review')),
  doubts      jsonb not null default '[]',
  source      text not null default 'claude' check (source in ('claude', 'person')),
  raw         jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles (id)
);
alter table public.customers enable row level security;
drop policy if exists "team reads customers" on public.customers;
create policy "team reads customers" on public.customers for select using (public.has_perm('see_contact'));
drop policy if exists "team writes customers" on public.customers;
create policy "team writes customers" on public.customers for all using (public.has_perm('see_contact') and public.has_perm('edit_orders')) with check (public.has_perm('see_contact') and public.has_perm('edit_orders'));
