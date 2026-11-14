-- Inventory spec (14 Nov 2026), stage 1: stock by stage, stitching orders, per-item order stages.
-- Everything is counted in sets. Existing columns keep their meaning so older code keeps working:
--   products.in_production = fabric Incoming from Vendor      products.in_stock = fabric On Hand
--   products.at_stitching  = total sets In Stitching          stitched_stock.qty = size variant On Hand

alter table public.products
  add column if not exists committed_stitch integer not null default 0,
  add column if not exists not_sellable integer not null default 0;
alter table public.stitched_stock
  add column if not exists in_stitching integer not null default 0,
  add column if not exists incoming integer not null default 0,
  add column if not exists not_sellable integer not null default 0;
alter table public.orders
  add column if not exists delivered_at timestamptz,
  add column if not exists delivery_status text;

create table if not exists public.stitching_orders (
  id          uuid primary key default gen_random_uuid(),
  number      serial,
  tailor      text not null default '',
  notes       text not null default '',
  status      text not null default 'committed' check (status in ('committed', 'sent', 'received', 'cancelled')),
  created_at  timestamptz not null default now(),
  created_by  uuid references public.profiles (id),
  sent_at     timestamptz,
  received_at timestamptz
);
create table if not exists public.stitching_order_lines (
  id                 uuid primary key default gen_random_uuid(),
  stitching_order_id uuid not null references public.stitching_orders (id) on delete cascade,
  product_id         uuid not null references public.products (id),
  size               text not null,
  qty                integer not null check (qty > 0),
  received           integer not null default 0,
  order_id           uuid references public.orders (id) on delete set null,
  item_index         integer
);
create index if not exists stitching_order_lines_so_idx on public.stitching_order_lines (stitching_order_id);

alter table public.stitching_orders enable row level security;
alter table public.stitching_order_lines enable row level security;
drop policy if exists "team reads stitching orders" on public.stitching_orders;
create policy "team reads stitching orders" on public.stitching_orders for select using (public.is_team_member());
drop policy if exists "team reads stitching lines" on public.stitching_order_lines;
create policy "team reads stitching lines" on public.stitching_order_lines for select using (public.is_team_member());
-- Writes go through the functions below, so every move keeps stock and order stages in step.

create or replace function public.norm_size(s text) returns text
language sql immutable set search_path = public as $$
  select case
    when s is null or btrim(s) = '' then ''
    when s ~* 'unstitch' then 'Unstitched'
    else replace(replace(upper(btrim(regexp_replace(s, '^.*/', ''))), 'XXXL', '3XL'), '2XL', 'XXL')
  end
$$;

create or replace function public.product_for(t text) returns uuid
language sql stable set search_path = public as $$
  select p.id from products p
  where norm_design(p.name) = norm_design(t) or exists (select 1 from unnest(p.aliases) a where norm_design(a) = norm_design(t))
  order by p.active desc limit 1
$$;

create or replace function public._inv_guard() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  -- The server (no signed-in user) may always act; people need the "change inventory" permission.
  if auth.uid() is not null and not has_perm('edit_inventory') then
    raise exception 'Your role can''t change inventory';
  end if;
end $$;

-- The order's status is the stage of its slowest item.
create or replace function public._set_item_stage(p_order uuid, p_idx integer, p_stage text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_old order_status;
  v_min integer;
  v_flow text[] := array['new', 'printing', 'stitching', 'checking', 'ready'];
  v_new order_status;
begin
  update orders set items = jsonb_set(items, array[p_idx::text, 'stage'], to_jsonb(p_stage)) where id = p_order
    and jsonb_array_length(items) > p_idx returning status into v_old;
  if v_old is null or not (v_old::text = any (v_flow)) then return; end if;
  select min(array_position(v_flow, coalesce(i ->> 'stage', v_old::text))) into v_min from orders o, jsonb_array_elements(o.items) i where o.id = p_order;
  if v_min is null then return; end if;
  v_new := v_flow[v_min]::order_status;
  if v_new is distinct from v_old then
    update orders set status = v_new where id = p_order;
    insert into order_events (order_id, kind, from_status, to_status, message, actor) values (p_order, 'status', v_old, v_new, 'Stock movement', auth.uid());
  end if;
end $$;

create or replace function public.create_stitching_order(p_lines jsonb, p_tailor text default '', p_notes text default '') returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; l record;
begin
  perform _inv_guard();
  if p_lines is null or jsonb_array_length(p_lines) = 0 then raise exception 'Nothing to stitch'; end if;
  insert into stitching_orders (tailor, notes, created_by) values (coalesce(p_tailor, ''), coalesce(p_notes, ''), auth.uid()) returning id into v_id;
  for l in select * from jsonb_to_recordset(p_lines) as x(product_id uuid, size text, qty integer, order_id uuid, item_index integer) loop
    update products set in_stock = in_stock - l.qty, committed_stitch = committed_stitch + l.qty where id = l.product_id and in_stock >= l.qty;
    if not found then raise exception 'Not enough fabric on hand for %', coalesce((select name from products where id = l.product_id), 'this design'); end if;
    insert into stitching_order_lines (stitching_order_id, product_id, size, qty, order_id, item_index) values (v_id, l.product_id, norm_size(l.size), l.qty, l.order_id, l.item_index);
    insert into stock_moves (product_id, field, size, delta, reason, order_id, actor) values (l.product_id, 'in_stock', null, -l.qty, 'Committed to stitch', l.order_id, auth.uid());
    if l.order_id is not null and l.item_index is not null then perform _set_item_stage(l.order_id, l.item_index, 'printing'); end if;
  end loop;
  return v_id;
end $$;

create or replace function public.send_stitching_order(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare l record;
begin
  perform _inv_guard();
  update stitching_orders set status = 'sent', sent_at = now() where id = p_id and status = 'committed';
  if not found then raise exception 'This stitching order was already sent or cancelled'; end if;
  for l in select * from stitching_order_lines where stitching_order_id = p_id loop
    update products set committed_stitch = greatest(committed_stitch - l.qty, 0), at_stitching = at_stitching + l.qty where id = l.product_id;
    insert into stitched_stock (product_id, size, qty, in_stitching) values (l.product_id, l.size, 0, l.qty)
      on conflict (product_id, size) do update set in_stitching = stitched_stock.in_stitching + l.qty;
    if l.order_id is not null and l.item_index is not null then perform _set_item_stage(l.order_id, l.item_index, 'stitching'); end if;
  end loop;
end $$;

create or replace function public.receive_stitching_line(p_line uuid, p_qty integer) returns void
language plpgsql security definer set search_path = public as $$
declare l stitching_order_lines; q integer;
begin
  perform _inv_guard();
  select sl.* into l from stitching_order_lines sl join stitching_orders so on so.id = sl.stitching_order_id where sl.id = p_line and so.status = 'sent' for update of sl;
  if not found then raise exception 'Send the stitching order to the tailor before receiving it'; end if;
  q := least(greatest(p_qty, 0), l.qty - l.received);
  if q = 0 then return; end if;
  update stitched_stock set in_stitching = greatest(in_stitching - q, 0) where product_id = l.product_id and size = l.size;
  update products set at_stitching = greatest(at_stitching - q, 0) where id = l.product_id;
  update stitching_order_lines set received = received + q where id = p_line;
  if l.order_id is not null and l.item_index is not null then
    -- Stitched for a customer: it goes straight to that order.
    if l.received + q >= l.qty then perform _set_item_stage(l.order_id, l.item_index, 'checking'); end if;
  else
    update stitched_stock set qty = qty + q where product_id = l.product_id and size = l.size;
    insert into stock_moves (product_id, field, size, delta, reason, actor) values (l.product_id, 'stitched', l.size, q, 'Received from stitching', auth.uid());
  end if;
  if not exists (select 1 from stitching_order_lines where stitching_order_id = l.stitching_order_id and received < qty) then
    update stitching_orders set status = 'received', received_at = now() where id = l.stitching_order_id;
  end if;
end $$;

create or replace function public.cancel_stitching_order(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare l record;
begin
  perform _inv_guard();
  update stitching_orders set status = 'cancelled' where id = p_id and status = 'committed';
  if not found then raise exception 'Only a stitching order that has not been sent can be cancelled'; end if;
  for l in select * from stitching_order_lines where stitching_order_id = p_id loop
    update products set committed_stitch = greatest(committed_stitch - l.qty, 0), in_stock = in_stock + l.qty where id = l.product_id;
    insert into stock_moves (product_id, field, size, delta, reason, order_id, actor) values (l.product_id, 'in_stock', null, l.qty, 'Stitching order cancelled', l.order_id, auth.uid());
    if l.order_id is not null and l.item_index is not null then perform _set_item_stage(l.order_id, l.item_index, 'new'); end if;
  end loop;
end $$;

-- "Order received" items take stock that is On Hand, oldest order first: a size variant for a stitched
-- item, a fabric set for an item sold unstitched. They move to Committed to Dispatch.
create or replace function public.allocate_on_hand() returns integer
language plpgsql security definer set search_path = public as $$
declare o record; it record; v_pid uuid; v_size text; v_n integer := 0;
begin
  perform _inv_guard();
  for o in select id, items from orders where status = 'new' and not is_internal order by placed_at loop
    for it in select (ord - 1)::integer as idx, i from jsonb_array_elements(o.items) with ordinality as e(i, ord) loop
      continue when coalesce(it.i ->> 'stage', 'new') <> 'new';
      v_pid := product_for(it.i ->> 'title');
      continue when v_pid is null;
      v_size := case when (it.i ->> 'title') ~* 'unstitched' then 'Unstitched' else norm_size(it.i ->> 'size') end;
      continue when v_size = '';
      if v_size = 'Unstitched' then
        update products set in_stock = in_stock - greatest((it.i ->> 'quantity')::integer, 1) where id = v_pid and in_stock >= greatest((it.i ->> 'quantity')::integer, 1);
      else
        update stitched_stock set qty = qty - greatest((it.i ->> 'quantity')::integer, 1)
          where product_id = v_pid and norm_size(size) = v_size and qty >= greatest((it.i ->> 'quantity')::integer, 1);
      end if;
      if found then
        insert into stock_moves (product_id, field, size, delta, reason, order_id, actor)
          values (v_pid, case when v_size = 'Unstitched' then 'in_stock' else 'stitched' end, nullif(v_size, 'Unstitched'), -greatest((it.i ->> 'quantity')::integer, 1), 'Committed to dispatch', o.id, auth.uid());
        perform _set_item_stage(o.id, it.idx, 'checking');
        v_n := v_n + 1;
      end if;
    end loop;
  end loop;
  return v_n;
end $$;

-- Cancellation before dispatch: sets already committed or ready go straight back to On Hand.
create or replace function public.release_order(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
declare it record; v_pid uuid; v_size text; v_q integer;
begin
  perform _inv_guard();
  for it in select (ord - 1)::integer as idx, i from orders o, jsonb_array_elements(o.items) with ordinality as e(i, ord) where o.id = p_order loop
    if (it.i ->> 'stage') in ('checking', 'ready') then
      v_pid := product_for(it.i ->> 'title');
      v_q := greatest((it.i ->> 'quantity')::integer, 1);
      v_size := case when (it.i ->> 'title') ~* 'unstitched' then 'Unstitched' else norm_size(it.i ->> 'size') end;
      if v_pid is not null and v_size = 'Unstitched' then
        update products set in_stock = in_stock + v_q where id = v_pid;
      elsif v_pid is not null and v_size <> '' then
        insert into stitched_stock (product_id, size, qty) values (v_pid, v_size, v_q) on conflict (product_id, size) do update set qty = stitched_stock.qty + v_q;
      end if;
      if v_pid is not null then
        insert into stock_moves (product_id, field, size, delta, reason, order_id, actor)
          values (v_pid, case when v_size = 'Unstitched' then 'in_stock' else 'stitched' end, nullif(v_size, 'Unstitched'), v_q, 'Order cancelled before dispatch', p_order, auth.uid());
      end if;
    end if;
  end loop;
  -- Sets still with the tailor will come back as free stock.
  update stitching_order_lines set order_id = null, item_index = null where order_id = p_order;
  update orders set items = (select coalesce(jsonb_agg(i - 'stage'), '[]'::jsonb) from jsonb_array_elements(items) i) where id = p_order;
end $$;

revoke execute on function public.create_stitching_order(jsonb, text, text), public.send_stitching_order(uuid), public.receive_stitching_line(uuid, integer),
  public.cancel_stitching_order(uuid), public.allocate_on_hand(), public.release_order(uuid), public._set_item_stage(uuid, integer, text), public._inv_guard() from public, anon;
grant execute on function public.create_stitching_order(jsonb, text, text), public.send_stitching_order(uuid), public.receive_stitching_line(uuid, integer),
  public.cancel_stitching_order(uuid), public.allocate_on_hand(), public.release_order(uuid) to authenticated, service_role;
revoke execute on function public._set_item_stage(uuid, integer, text) from authenticated;
