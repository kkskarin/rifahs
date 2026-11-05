-- Internal / test orders: kept for the record, left out of lists, counts and sales.
alter table public.orders add column if not exists is_internal boolean not null default false;
create index if not exists orders_internal_idx on public.orders (is_internal) where is_internal;

create or replace function public.ops_summary()
returns table (sales numeric, spent numeric, not_dispatched bigint, open_issues bigint, express_due bigint)
language sql stable security invoker set search_path = public as $$
  select
    coalesce((select sum(total) from orders where not is_internal and status not in ('refunded', 'cancelled')), 0),
    coalesce((select sum(amount) from expenses), 0),
    (select count(*) from orders where not is_internal and status in ('new', 'printing', 'stitching', 'checking', 'ready')),
    (select count(*) from issues where status <> 'resolved'),
    (select count(*) from orders where not is_internal and is_express and status in ('new', 'printing', 'stitching', 'checking', 'ready'));
$$;

create or replace function public.order_status_counts()
returns table (status order_status, n bigint)
language sql stable security invoker set search_path = public as $$
  select status, count(*) from orders where not is_internal group by status;
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
                and not o.is_internal and o.status not in ('refunded', 'cancelled')), 0),
    coalesce((select sum(amount) from expenses e where date_trunc('month', e.spent_on)::date = m.month), 0),
    (select count(*) from orders o
      where date_trunc('month', o.placed_at at time zone 'Asia/Kolkata')::date = m.month
        and not o.is_internal and o.status not in ('refunded', 'cancelled'))
  from m order by m.month desc;
$$;

revoke execute on function public.ops_summary(), public.order_status_counts(), public.money_by_month(int) from public, anon;
grant execute on function public.ops_summary(), public.order_status_counts(), public.money_by_month(int) to authenticated;
