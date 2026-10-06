-- SETUP RECIPE ONLY. Not an applied migration and never executed by the app.
-- Review the intended project and existing Storage policies first. For tracked
-- migrations, create a migration with Supabase CLI and copy this reviewed recipe.
-- These are organizer-published PUBLIC, UNVERIFIED photos, not D4 proof records.
-- Do not reuse a bucket containing private media or change its privacy silently.

begin;

create table if not exists public.campaign_media (
  network text not null check (network = 'testnet'),
  contract_id text not null check (contract_id ~ '^C[A-Z2-7]{55}$'),
  campaign_id text not null check (campaign_id ~ '^[1-9][0-9]{0,19}$'
    and campaign_id::numeric <= 18446744073709551615),
  creator_wallet text not null check (creator_wallet ~ '^G[A-Z2-7]{55}$'),
  published_by uuid references auth.users(id) on delete set null,
  photos jsonb not null check (jsonb_typeof(photos) = 'array'
    and jsonb_array_length(photos) between 3 and 6 and octet_length(photos::text) <= 8192),
  public_acknowledged boolean not null check (public_acknowledged),
  updated_at timestamptz not null default now(),
  primary key (network, contract_id, campaign_id)
);

create index if not exists campaign_media_published_by_idx on public.campaign_media (published_by);

alter table public.campaign_media enable row level security;
-- No anonymous/authenticated metadata policies. All access goes through server
-- actions with a service role kept off the client. Writes check getUser(), the
-- saved public wallet and current D4 creator; caller-supplied contract is ignored.
revoke all on public.campaign_media from public, anon, authenticated;
grant select, insert, update on public.campaign_media to service_role;
-- Also deny existing column-level grants or older permissive policies if this
-- reviewed table name already exists. Service-role bypass remains intentional.
drop policy if exists "campaign_media_no_client_access" on public.campaign_media;
create policy "campaign_media_no_client_access" on public.campaign_media as restrictive
for all to anon, authenticated using (false) with check (false);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('campaign-media', 'campaign-media', true, 153600, array['image/jpeg'])
on conflict (id) do nothing;

do $$
begin
  if exists (select 1 from storage.buckets where id = 'campaign-media' and not public) then
    raise exception 'campaign-media is private. Choose a fresh public bucket after reviewing existing files; do not expose them silently.';
  end if;
end $$;

update storage.buckets set file_size_limit = 153600, allowed_mime_types = array['image/jpeg']
where id = 'campaign-media' and public;

-- Restrictive policies prevent even an existing broad permissive policy from
-- granting direct client uploads, replacements, deletes or listings here. Other
-- buckets retain their existing behavior. Public object downloads bypass read
-- RLS by design; the explicit upload acknowledgement must explain that fact.
drop policy if exists "campaign_media_no_client_insert" on storage.objects;
create policy "campaign_media_no_client_insert" on storage.objects as restrictive
for insert to anon, authenticated with check (bucket_id <> 'campaign-media');

drop policy if exists "campaign_media_no_client_update" on storage.objects;
create policy "campaign_media_no_client_update" on storage.objects as restrictive
for update to anon, authenticated
using (bucket_id <> 'campaign-media') with check (bucket_id <> 'campaign-media');

drop policy if exists "campaign_media_no_client_delete" on storage.objects;
create policy "campaign_media_no_client_delete" on storage.objects as restrictive
for delete to anon, authenticated using (bucket_id <> 'campaign-media');

drop policy if exists "campaign_media_no_client_list" on storage.objects;
create policy "campaign_media_no_client_list" on storage.objects as restrictive
for select to anon, authenticated using (bucket_id <> 'campaign-media');

-- Service-role SDK requests bypass RLS, so keep that key server-only. Uploads
-- use immutable scoped UUID batches and upsert:false. A failed/ambiguous metadata
-- publication can leave public orphan objects. Review lifecycle cleanup through
-- the Storage API, not direct SQL object-row deletion. Public CDN caches or copied
-- photos cannot be recalled; these uploads must never include private documents.

commit;
