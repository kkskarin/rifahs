-- Applied to the live project as "app_settings" and "disputes".
create table if not exists public.app_settings (
  key text primary key, value jsonb not null,
  updated_at timestamptz not null default now(), updated_by uuid references public.profiles (id)
);
alter table public.app_settings enable row level security;
create policy "team reads settings" on public.app_settings for select using (public.is_team_member());
create policy "admins add settings" on public.app_settings for insert with check (public.is_team_admin());
create policy "admins edit settings" on public.app_settings for update using (public.is_team_admin());
insert into public.app_settings (key, value) values ('due_rules', '{"standard_days": 21, "express_days": 7, "unstitched_days": 5}') on conflict do nothing;

alter table public.issues add column if not exists category text not null default 'shipping' check (category in ('shipping', 'customer'));
create table if not exists public.issue_updates (
  id bigint generated always as identity primary key,
  issue_id uuid not null references public.issues (id) on delete cascade,
  message text not null, actor uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
alter table public.issue_updates enable row level security;
create policy "team reads issue updates" on public.issue_updates for select using (public.is_team_member());
create policy "team adds issue updates" on public.issue_updates for insert with check (public.is_team_member());
alter table public.orders add column if not exists is_exchange boolean not null default false;

-- Personal details and preferences (applied live as "profile_personalise"; also adds a self-update policy
-- and extends guard_owner_role() so nobody can change their own role, access or sign-in email).
alter table public.profiles
  add column if not exists avatar_url text,
  add column if not exists phone text not null default '',
  add column if not exists contact_email text not null default '',
  add column if not exists dob date,
  add column if not exists gender text not null default '',
  add column if not exists prefs jsonb not null default '{}';
