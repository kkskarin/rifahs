-- The bill or receipt behind an expense, kept in a private storage bucket.
alter table public.expenses add column if not exists bill_path text, add column if not exists bill_name text;
insert into storage.buckets (id, name, public, file_size_limit) values ('bills', 'bills', false, 5242880) on conflict (id) do nothing;
drop policy if exists "purchase reads bills" on storage.objects;
create policy "purchase reads bills" on storage.objects for select to authenticated using (bucket_id = 'bills' and public.has_perm('purchase'));
drop policy if exists "purchase adds bills" on storage.objects;
create policy "purchase adds bills" on storage.objects for insert to authenticated with check (bucket_id = 'bills' and public.has_perm('purchase'));
drop policy if exists "purchase removes bills" on storage.objects;
create policy "purchase removes bills" on storage.objects for delete to authenticated using (bucket_id = 'bills' and public.has_perm('purchase'));
