-- Customers are worked out from orders. These two tables remember what the team decided:
-- customer_links      "this record is the same person as that one" (a merge, can be undone)
-- customer_dismissals "these look alike but are different people" (stop suggesting them)
create table if not exists public.customer_links (
  alias_key   text primary key,
  primary_key text not null,
  created_at  timestamptz not null default now(),
  created_by  uuid references public.profiles (id)
);
create table if not exists public.customer_dismissals (
  signature   text primary key,
  created_at  timestamptz not null default now(),
  created_by  uuid references public.profiles (id)
);
alter table public.customer_links enable row level security;
alter table public.customer_dismissals enable row level security;
drop policy if exists "team reads customer links" on public.customer_links;
create policy "team reads customer links" on public.customer_links for select using (public.is_team_member());
drop policy if exists "team writes customer links" on public.customer_links;
create policy "team writes customer links" on public.customer_links for all using (public.has_perm('see_contact') and public.has_perm('edit_orders')) with check (public.has_perm('see_contact') and public.has_perm('edit_orders'));
drop policy if exists "team reads customer dismissals" on public.customer_dismissals;
create policy "team reads customer dismissals" on public.customer_dismissals for select using (public.is_team_member());
drop policy if exists "team writes customer dismissals" on public.customer_dismissals;
create policy "team writes customer dismissals" on public.customer_dismissals for all using (public.has_perm('see_contact') and public.has_perm('edit_orders')) with check (public.has_perm('see_contact') and public.has_perm('edit_orders'));
