-- Inventory (applied to the live project as migration "inventory").
-- See the live schema for: norm_design(), products, stitched_stock, stock_moves, adjust_stock().
create or replace function public.norm_design(t text) returns text
language sql immutable set search_path = public as $$
  select regexp_replace(
           regexp_replace(lower(translate(coalesce(t,''), 'éèêáàíóúÉ', 'eeeaaiouE')),
             '\m(unstitched|stitched|suit set|set|printed|pants?)\M|[()]', '', 'g'),
           '[^a-z0-9]', '', 'g')
$$;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  aliases text[] not null default '{}',
  category text not null default 'Suit set',
  collection text not null default 'Current',
  in_stock int not null default 0,
  at_stitching int not null default 0,
  in_production int not null default 0,
  low_at int not null default 3,
  active boolean not null default true,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.stitched_stock (
  product_id uuid not null references public.products (id) on delete cascade,
  size text not null,
  qty int not null default 0 check (qty >= 0),
  primary key (product_id, size)
);
create table if not exists public.stock_moves (
  id bigint generated always as identity primary key,
  product_id uuid not null references public.products (id) on delete cascade,
  field text not null, size text, delta int not null, reason text not null default '',
  order_id uuid references public.orders (id) on delete set null,
  actor uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
alter table public.products enable row level security;
alter table public.stitched_stock enable row level security;
alter table public.stock_moves enable row level security;
create policy "team reads products" on public.products for select using (public.is_team_member());
create policy "team adds products" on public.products for insert with check (public.is_team_member());
create policy "team edits products" on public.products for update using (public.is_team_member());
create policy "admins delete products" on public.products for delete using (public.is_team_admin());
create policy "team reads stitched" on public.stitched_stock for select using (public.is_team_member());
create policy "team writes stitched" on public.stitched_stock for all using (public.is_team_member()) with check (public.is_team_member());
create policy "team reads moves" on public.stock_moves for select using (public.is_team_member());
create policy "team adds moves" on public.stock_moves for insert with check (public.is_team_member());

create or replace function public.adjust_stock(p_product uuid, p_field text, p_delta int, p_size text default null,
                                               p_reason text default '', p_order uuid default null)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if p_field = 'stitched' then
    if p_size is null or p_size = '' then raise exception 'size required for stitched stock'; end if;
    insert into stitched_stock (product_id, size, qty) values (p_product, p_size, greatest(p_delta, 0))
      on conflict (product_id, size) do update set qty = greatest(stitched_stock.qty + p_delta, 0);
  elsif p_field = 'in_stock' then update products set in_stock = greatest(in_stock + p_delta, 0) where id = p_product;
  elsif p_field = 'at_stitching' then update products set at_stitching = greatest(at_stitching + p_delta, 0) where id = p_product;
  elsif p_field = 'in_production' then update products set in_production = greatest(in_production + p_delta, 0) where id = p_product;
  else raise exception 'unknown stock field %', p_field;
  end if;
  insert into stock_moves (product_id, field, size, delta, reason, order_id, actor)
  values (p_product, p_field, nullif(p_size, ''), p_delta, coalesce(p_reason, ''), p_order, auth.uid());
end;
$$;
revoke execute on function public.adjust_stock(uuid, text, int, text, text, uuid) from public, anon;
grant execute on function public.adjust_stock(uuid, text, int, text, text, uuid) to authenticated;
