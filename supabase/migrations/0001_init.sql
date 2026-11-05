-- Rifah's Ops — initial schema
-- Team members, the order book, express promises, courier issues and money.

create extension if not exists pgcrypto;

-- ───────────────────────── Team ─────────────────────────
create type team_role as enum ('owner', 'admin', 'staff');

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null unique,
  full_name   text not null default '',
  role        team_role not null default 'staff',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Helpers used by RLS policies. SECURITY DEFINER so they can read profiles
-- without recursing through the profiles policy.
create or replace function public.is_team_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and active);
$$;

create or replace function public.is_team_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and active and role in ('owner', 'admin'));
$$;

-- Only people created by the server get a profile: the bootstrap owner (first sign-in
-- with BOOTSTRAP_OWNER_EMAIL) or someone an admin added on the Team page. Anyone who
-- signs up directly through the Supabase API gets no profile and therefore no access.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.raw_app_meta_data ->> 'bootstrap_owner' = 'true' and not exists (select 1 from profiles) then
    insert into profiles (id, email, full_name, role)
    values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''), 'owner');
  elsif new.raw_app_meta_data ->> 'invited_role' is not null then
    insert into profiles (id, email, full_name, role)
    values (new.id, new.email,
            coalesce(new.raw_user_meta_data ->> 'full_name', ''),
            (new.raw_app_meta_data ->> 'invited_role')::team_role)
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Only an owner may create or demote an owner, even via the raw API.
create or replace function public.guard_owner_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null  -- service role / server bypasses this check
     and (new.role = 'owner' or old.role = 'owner')
     and new.role is distinct from old.role
     and not exists (select 1 from profiles where id = auth.uid() and active and role = 'owner') then
    raise exception 'only an owner can change owner access';
  end if;
  if auth.uid() is not null and new.id = auth.uid() and (new.role is distinct from old.role or new.active is distinct from old.active) then
    raise exception 'you cannot change your own access';
  end if;
  return new;
end;
$$;

create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_owner_role();

-- ───────────────────────── Orders ─────────────────────────
create type order_status as enum (
  'new', 'printing', 'stitching', 'checking', 'ready', 'dispatched', 'delivered',
  'refunded', 'cancelled'
);

create or replace function public.jsonb_items_text(items jsonb) returns text
language sql immutable as $$
  select coalesce(string_agg(concat_ws(' ', i ->> 'title', i ->> 'size', i ->> 'variant'), ' '), '')
  from jsonb_array_elements(items) as i;
$$;

create table public.orders (
  id                  uuid primary key default gen_random_uuid(),
  shopify_id          bigint unique,                 -- null for manual / offline entries
  order_number        text,                          -- "#1271"
  customer_name       text not null default '',
  customer_email      text,
  customer_phone      text,
  items               jsonb not null default '[]',   -- [{title, variant, size, quantity, price}]
  total               numeric(12, 2),                -- null = unpriced (e.g. custom international set)
  currency            text not null default 'INR',
  source              text,                          -- Shopflo, Razorpay, Instagram, WhatsApp, Manual…
  channel             text not null default 'Website',
  shopify_source_name text,                          -- web, shopify_draft_order, pos…
  status              order_status not null default 'new',
  is_express          boolean not null default false,
  promise_date        date,                          -- when we promised it would ship
  is_international    boolean not null default false,
  ship_country        text,
  ship_city           text,
  ship_address        jsonb,
  courier             text,
  tracking_number     text,
  tracking_url        text,
  dispatched_at       timestamptz,
  shopify_fulfilled   boolean not null default false,
  financial_status    text,                          -- paid, pending, refunded…
  notes               text not null default '',
  tags                text[] not null default '{}',
  placed_at           timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid references public.profiles (id),
  updated_by          uuid references public.profiles (id)
);

create index orders_status_idx   on public.orders (status);
create index orders_placed_idx   on public.orders (placed_at desc);
create index orders_express_idx  on public.orders (is_express) where is_express;
create index orders_intl_idx     on public.orders (is_international) where is_international;

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

-- Every status change / edit is logged so you can see who did what.
create table public.order_events (
  id          bigint generated always as identity primary key,
  order_id    uuid not null references public.orders (id) on delete cascade,
  kind        text not null,              -- status, note, edit, shopify_sync, fulfillment
  from_status order_status,
  to_status   order_status,
  message     text not null default '',
  actor       uuid references public.profiles (id),
  created_at  timestamptz not null default now()
);
create index order_events_order_idx on public.order_events (order_id, created_at desc);

-- ───────────────────────── Courier issues ─────────────────────────
create type issue_status as enum ('open', 'waiting', 'resolved');

create table public.issues (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid references public.orders (id) on delete set null,
  title        text not null,
  kind         text not null default 'Courier',  -- Courier, Delayed, Damaged, Return, Exchange, Payment, Other
  courier      text,
  tracking_number text,
  details      text not null default '',
  status       issue_status not null default 'open',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  created_by   uuid references public.profiles (id)
);
create trigger issues_touch before update on public.issues
  for each row execute function public.touch_updated_at();

-- ───────────────────────── Money ─────────────────────────
create table public.expenses (
  id          uuid primary key default gen_random_uuid(),
  spent_on    date not null default current_date,
  category    text not null,      -- Fabric, Printing, Stitching, Courier, Packaging, Marketing, Salaries, Other
  amount      numeric(12, 2) not null check (amount >= 0),
  paid_to     text not null default '',
  note        text not null default '',
  created_at  timestamptz not null default now(),
  created_by  uuid references public.profiles (id)
);
create index expenses_spent_on_idx on public.expenses (spent_on desc);

-- ───────────────────────── Shopify sync state ─────────────────────────
create table public.sync_state (
  key         text primary key,
  value       jsonb not null default '{}',
  updated_at  timestamptz not null default now()
);

-- ───────────────────────── Row-level security ─────────────────────────
alter table public.profiles     enable row level security;
alter table public.orders       enable row level security;
alter table public.order_events enable row level security;
alter table public.issues       enable row level security;
alter table public.expenses     enable row level security;
alter table public.sync_state   enable row level security;

create policy "team reads profiles"   on public.profiles for select using (public.is_team_member());
create policy "admins manage profiles" on public.profiles for update using (public.is_team_admin());

create policy "team reads orders"   on public.orders for select using (public.is_team_member());
create policy "team adds orders"    on public.orders for insert with check (public.is_team_member());
create policy "team edits orders"   on public.orders for update using (public.is_team_member());
create policy "admins delete orders" on public.orders for delete using (public.is_team_admin());

create policy "team reads events" on public.order_events for select using (public.is_team_member());
create policy "team adds events"  on public.order_events for insert with check (public.is_team_member());

create policy "team reads issues"   on public.issues for select using (public.is_team_member());
create policy "team adds issues"    on public.issues for insert with check (public.is_team_member());
create policy "team edits issues"   on public.issues for update using (public.is_team_member());
create policy "admins delete issues" on public.issues for delete using (public.is_team_admin());

-- Money is visible to owners/admins only.
create policy "admins read expenses"   on public.expenses for select using (public.is_team_admin());
create policy "admins add expenses"    on public.expenses for insert with check (public.is_team_admin());
create policy "admins edit expenses"   on public.expenses for update using (public.is_team_admin());
create policy "admins delete expenses" on public.expenses for delete using (public.is_team_admin());

create policy "team reads sync state" on public.sync_state for select using (public.is_team_member());
-- sync_state is written only by the server (service role bypasses RLS).

-- ───────────────────────── Dashboard helpers ─────────────────────────
-- security invoker: RLS still applies, so staff get spent = 0 (they can't see expenses).
create or replace function public.ops_summary()
returns table (sales numeric, spent numeric, not_dispatched bigint, open_issues bigint, express_due bigint)
language sql stable security invoker set search_path = public as $$
  select
    coalesce((select sum(total) from orders where status not in ('refunded', 'cancelled')), 0),
    coalesce((select sum(amount) from expenses), 0),
    (select count(*) from orders where status in ('new', 'printing', 'stitching', 'checking', 'ready')),
    (select count(*) from issues where status <> 'resolved'),
    (select count(*) from orders where is_express and status in ('new', 'printing', 'stitching', 'checking', 'ready'));
$$;

create or replace function public.order_status_counts()
returns table (status order_status, n bigint)
language sql stable security invoker set search_path = public as $$
  select status, count(*) from orders group by status;
$$;

create or replace function public.money_by_month(months int default 12)
returns table (month date, sales numeric, spent numeric, orders bigint)
language sql stable security invoker set search_path = public as $$
  with m as (
    select generate_series(
      date_trunc('month', (now() at time zone 'Asia/Kolkata'))::date - make_interval(months => months - 1),
      date_trunc('month', (now() at time zone 'Asia/Kolkata'))::date,
      interval '1 month')::date as month
  )
  select m.month,
    coalesce((select sum(total) from orders o
              where date_trunc('month', o.placed_at at time zone 'Asia/Kolkata')::date = m.month
                and o.status not in ('refunded', 'cancelled')), 0),
    coalesce((select sum(amount) from expenses e where date_trunc('month', e.spent_on)::date = m.month), 0),
    (select count(*) from orders o
      where date_trunc('month', o.placed_at at time zone 'Asia/Kolkata')::date = m.month
        and o.status not in ('refunded', 'cancelled'))
  from m order by m.month desc;
$$;

grant execute on function public.ops_summary(), public.order_status_counts(), public.money_by_month(int) to authenticated;

-- Searchable text of the line items ("Monochrome Muse S Ziya Plum Set M") for the search box.
alter table public.orders add column items_text text
  generated always as (public.jsonb_items_text(items)) stored;

-- ───────────────────────── Hardening ─────────────────────────
alter function public.jsonb_items_text(jsonb) set search_path = public;
alter function public.touch_updated_at() set search_path = public;

-- Trigger functions are never called directly.
revoke execute on function public.handle_new_user(), public.guard_owner_role() from public, anon, authenticated;

-- RLS helpers: signed-in users only.
revoke execute on function public.is_team_member(), public.is_team_admin() from public, anon;
grant execute on function public.is_team_member(), public.is_team_admin() to authenticated;

revoke execute on function public.ops_summary(), public.order_status_counts(), public.money_by_month(int) from public, anon;
grant execute on function public.ops_summary(), public.order_status_counts(), public.money_by_month(int) to authenticated;
