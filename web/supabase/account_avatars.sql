-- Configuration recipe, NOT an applied migration. Apply only to the intended
-- Supabase project after reviewing its existing storage policies. For CLI
-- migration tracking, run `supabase migration new account_avatars` first and
-- copy this recipe into the generated file. Nothing is applied by the app.
-- Private bucket: short-lived signed URLs, no service-role upload, no public
-- read policy. The request JWT and its auth.uid() own each UUID folder.

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('account-avatars', 'account-avatars', false, 524288, array['image/jpeg'])
on conflict (id) do nothing;

-- Never silently reuse a bucket that was configured as public.
do $$
begin
  if exists (select 1 from storage.buckets where id = 'account-avatars' and public) then
    raise exception 'account-avatars must be private. Review existing objects and configure its privacy before continuing.';
  end if;
end $$;

update storage.buckets set file_size_limit = 524288, allowed_mime_types = array['image/jpeg']
where id = 'account-avatars' and not public;

drop policy if exists "account_avatar_read_own" on storage.objects;
create policy "account_avatar_read_own" on storage.objects for select to authenticated
using (bucket_id = 'account-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "account_avatar_insert_own" on storage.objects;
create policy "account_avatar_insert_own" on storage.objects for insert to authenticated
with check (bucket_id = 'account-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and array_length(storage.foldername(name), 1) = 1
  and storage.filename(name) ~ '^[0-9a-f-]{36}\.jpg$');

drop policy if exists "account_avatar_delete_own" on storage.objects;
create policy "account_avatar_delete_own" on storage.objects for delete to authenticated
using (bucket_id = 'account-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Uploads always use a fresh UUID. No UPDATE/upsert permission is required.
-- Existing broad storage policies are permissive ORs: check them before using
-- this bucket. They must not grant cross-user reads/writes for account-avatars.
-- Preference lives in auth user metadata via auth.updateUser(), not a public
-- table. It is display-only and every path is revalidated against getUser().id.
-- Cleanup failure can leave a private orphan. Use Storage API owner cleanup or
-- a reviewed lifecycle process; never delete object rows directly with SQL.

commit;
