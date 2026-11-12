-- Expense categories (with sub-categories) and vendors; expenses link to both.
-- Applied to the live project as "expense_categories_and_vendors".
create table if not exists public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  parent_id uuid references public.expense_categories (id) on delete restrict,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists expense_categories_name_idx on public.expense_categories (coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null, phone text not null default '', notes text not null default '',
  created_at timestamptz not null default now()
);
create unique index if not exists vendors_name_idx on public.vendors (lower(name));
alter table public.expenses add column if not exists category_id uuid references public.expense_categories (id) on delete restrict;
alter table public.expenses add column if not exists vendor_id uuid references public.vendors (id) on delete restrict;
alter table public.expense_categories enable row level security;
alter table public.vendors enable row level security;
create policy "team reads expense categories" on public.expense_categories for select using (public.is_team_member());
create policy "admins add expense categories" on public.expense_categories for insert with check (public.is_team_admin());
create policy "admins edit expense categories" on public.expense_categories for update using (public.is_team_admin());
create policy "admins delete expense categories" on public.expense_categories for delete using (public.is_team_admin());
create policy "team reads vendors" on public.vendors for select using (public.is_team_member());
create policy "admins add vendors" on public.vendors for insert with check (public.is_team_admin());
create policy "admins edit vendors" on public.vendors for update using (public.is_team_admin());
create policy "admins delete vendors" on public.vendors for delete using (public.is_team_admin());
