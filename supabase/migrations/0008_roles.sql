-- Roles: the owner decides what each role can open, see and change.
-- Built-in rows "admin" and "staff" can be edited; extra roles can be added. Owners always have everything.
create table if not exists public.roles (
  key         text primary key,
  name        text not null,
  permissions jsonb not null default '{}',
  builtin     boolean not null default false,
  created_at  timestamptz not null default now()
);

insert into public.roles (key, name, builtin, permissions) values
  ('admin', 'Admin', true, '{"sales_all":true,"sales_status":true,"sales_disputes":true,"stitching":true,"purchase":true,"inventory":true,"reports":true,"masters":true,"see_amounts":true,"see_sales_total":true,"see_contact":true,"edit_orders":true,"edit_inventory":true,"edit_masters":true}'),
  ('staff', 'Staff', true, '{"sales_all":true,"sales_status":true,"sales_disputes":true,"stitching":true,"purchase":false,"inventory":true,"reports":false,"masters":true,"see_amounts":true,"see_sales_total":false,"see_contact":true,"edit_orders":true,"edit_inventory":true,"edit_masters":false}')
on conflict (key) do nothing;

-- A member with a custom role keeps role = 'staff' and points at the custom role here.
alter table public.profiles add column if not exists role_key text references public.roles (key) on update cascade on delete set null;

create or replace function public.has_perm(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case when pr.role = 'owner' then true
                else coalesce((r.permissions ->> p)::boolean, pr.role = 'admin' and r.key is null) end
    from profiles pr
    left join roles r on r.key = coalesce(pr.role_key, pr.role::text)
    where pr.id = auth.uid() and pr.active
  ), false);
$$;
revoke execute on function public.has_perm(text) from public, anon;
grant execute on function public.has_perm(text) to authenticated;

alter table public.roles enable row level security;
drop policy if exists "team reads roles" on public.roles;
create policy "team reads roles" on public.roles for select using (public.is_team_member());
drop policy if exists "owners manage roles" on public.roles;
create policy "owners manage roles" on public.roles for all
  using (exists (select 1 from profiles where id = auth.uid() and active and role = 'owner'))
  with check (exists (select 1 from profiles where id = auth.uid() and active and role = 'owner'));

-- Money (the Purchase book) follows the role's "purchase" permission instead of admin-only.
drop policy if exists "admins read expenses" on public.expenses;
create policy "admins read expenses" on public.expenses for select using (public.has_perm('purchase'));
drop policy if exists "admins add expenses" on public.expenses;
create policy "admins add expenses" on public.expenses for insert with check (public.has_perm('purchase'));
drop policy if exists "admins edit expenses" on public.expenses;
create policy "admins edit expenses" on public.expenses for update using (public.has_perm('purchase'));

-- Nobody can change their own role, and only an owner can hand out or change a custom role.
create or replace function public.guard_owner_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null
     and (new.role = 'owner' or old.role = 'owner')
     and new.role is distinct from old.role
     and not exists (select 1 from profiles where id = auth.uid() and active and role = 'owner') then
    raise exception 'only an owner can change owner access';
  end if;
  if auth.uid() is not null and new.id = auth.uid()
     and (new.role is distinct from old.role or new.active is distinct from old.active or new.email is distinct from old.email
          or new.role_key is distinct from old.role_key) then
    raise exception 'you cannot change your own access or sign-in email';
  end if;
  -- Non-admins may only touch their own row's personal fields (the policy limits the row; this limits the columns).
  if auth.uid() is not null and not exists (select 1 from profiles where id = auth.uid() and active and role in ('owner','admin'))
     and (new.role is distinct from old.role or new.active is distinct from old.active or new.email is distinct from old.email) then
    raise exception 'not allowed';
  end if;
  if auth.uid() is not null and new.role_key is distinct from old.role_key
     and not exists (select 1 from profiles where id = auth.uid() and active and role = 'owner') then
    raise exception 'only an owner can change roles';
  end if;
  return new;
end;
$$;
