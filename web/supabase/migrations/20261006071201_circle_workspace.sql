-- User-authored campaign metadata. Apply only to the verified Salapi project.
-- This migration does not publish invented examples, move funds, or verify KYC.
begin;

create table public.circle_workspace_media (
  id uuid primary key,
  owner_id uuid not null references auth.users(id),
  object_path text not null unique,
  name text not null check (char_length(name) between 1 and 100),
  mime text not null check (mime = 'image/webp'),
  size integer not null check (size between 1 and 4194304),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  check (object_path = owner_id::text || '/' || id::text || '.webp')
);
create table public.circle_workspace_campaigns (
  id uuid primary key,
  organizer_id uuid not null references auth.users(id),
  organizer_name text not null check (char_length(organizer_name) between 1 and 80),
  organizer_kind text not null default 'person' check (organizer_kind in ('person', 'ngo')),
  title text not null check (char_length(title) between 5 and 100 and octet_length(title) <= 120),
  story text not null check (char_length(story) between 40 and 8000),
  location text not null check (char_length(location) between 2 and 100),
  category text not null check (category in ('disaster','medical','education','community','family','creator','animals','care','volunteer')),
  goal_php numeric(12,2) not null check (goal_php between 1 and 100000000),
  allowance_pct integer not null check (allowance_pct between 0 and 10),
  cover_media_id uuid not null references public.circle_workspace_media(id),
  status text not null default 'published' check (status in ('published','completed')),
  contract_campaign_id text unique check (contract_campaign_id ~ '^[1-9][0-9]{0,19}$'),
  contract_creator_wallet text check (contract_creator_wallet ~ '^G[A-Z2-7]{55}$'),
  contract_address text check (contract_address ~ '^C[A-Z2-7]{55}$'),
  created_at timestamptz not null default now(),
  check ((contract_campaign_id is null) = (contract_creator_wallet is null)),
  check ((contract_campaign_id is null) = (contract_address is null))
);
create table public.circle_workspace_updates (
  id uuid primary key,
  campaign_id uuid not null references public.circle_workspace_campaigns(id),
  organizer_id uuid not null references auth.users(id),
  title text not null check (char_length(title) between 3 and 100),
  body text not null check (char_length(body) between 10 and 4000),
  kind text not null check (kind in ('progress','spend','delivery')),
  media_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  check (cardinality(media_ids) between 0 and 4),
  check (kind <> 'delivery' or cardinality(media_ids) > 0)
);
create table public.circle_workspace_follows (
  campaign_id uuid not null references public.circle_workspace_campaigns(id),
  user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (campaign_id, user_id)
);
create table public.circle_workspace_reviews (
  id uuid primary key,
  campaign_id uuid not null references public.circle_workspace_campaigns(id),
  organizer_id uuid not null references auth.users(id),
  donor_id uuid not null references auth.users(id),
  donor_name text not null check (char_length(donor_name) between 1 and 80),
  stars integer not null check (stars between 1 and 5),
  comment text not null check (char_length(comment) between 10 and 1000),
  created_at timestamptz not null default now(),
  unique(campaign_id, donor_id),
  check (organizer_id <> donor_id)
);

create index circle_workspace_campaigns_owner_idx on public.circle_workspace_campaigns(organizer_id);
create index circle_workspace_updates_campaign_idx on public.circle_workspace_updates(campaign_id, created_at desc);
create index circle_workspace_reviews_organizer_idx on public.circle_workspace_reviews(organizer_id, created_at desc);
create index circle_workspace_media_owner_idx on public.circle_workspace_media(owner_id);
create index circle_workspace_follows_user_idx on public.circle_workspace_follows(user_id);

alter table public.circle_workspace_media enable row level security;
alter table public.circle_workspace_campaigns enable row level security;
alter table public.circle_workspace_updates enable row level security;
alter table public.circle_workspace_follows enable row level security;
alter table public.circle_workspace_reviews enable row level security;

revoke all on public.circle_workspace_media, public.circle_workspace_campaigns, public.circle_workspace_updates, public.circle_workspace_follows, public.circle_workspace_reviews from anon, authenticated;
grant select on public.circle_workspace_campaigns, public.circle_workspace_updates, public.circle_workspace_reviews to anon, authenticated;
grant select on public.circle_workspace_media to anon;
grant select, insert on public.circle_workspace_media, public.circle_workspace_campaigns, public.circle_workspace_updates to authenticated;
grant select, insert, delete on public.circle_workspace_follows to authenticated;
grant all on public.circle_workspace_media, public.circle_workspace_campaigns, public.circle_workspace_updates, public.circle_workspace_follows, public.circle_workspace_reviews to service_role;

create policy workspace_campaign_read on public.circle_workspace_campaigns for select to anon, authenticated using (true);
create policy workspace_campaign_insert on public.circle_workspace_campaigns for insert to authenticated with check (
  organizer_id = (select auth.uid()) and organizer_kind = 'person' and status = 'published'
  and coalesce((select auth.jwt()->>'is_anonymous'), 'false') <> 'true'
  and contract_campaign_id is null and contract_creator_wallet is null and contract_address is null
  and exists (select 1 from public.circle_workspace_media m where m.id = cover_media_id and m.owner_id = (select auth.uid()))
);
-- No authenticated campaign UPDATE. Fee/title are immutable. Binding/completion
-- require server authentication and fresh matching D4 chain reads, never client claims.
create policy workspace_update_read on public.circle_workspace_updates for select to anon, authenticated using (true);
create policy workspace_update_insert on public.circle_workspace_updates for insert to authenticated with check (
  organizer_id = (select auth.uid())
  and coalesce((select auth.jwt()->>'is_anonymous'), 'false') <> 'true'
  and exists (select 1 from public.circle_workspace_campaigns c where c.id = campaign_id and c.organizer_id = (select auth.uid()) and c.status = 'published')
  and not exists (select 1 from unnest(media_ids) image_id where not exists (select 1 from public.circle_workspace_media m where m.id = image_id and m.owner_id = (select auth.uid())))
);
create policy workspace_media_read on public.circle_workspace_media for select to anon, authenticated using (
  owner_id = (select auth.uid())
  or exists (select 1 from public.circle_workspace_campaigns c where c.cover_media_id = circle_workspace_media.id)
  or exists (select 1 from public.circle_workspace_updates u where circle_workspace_media.id = any(u.media_ids))
);
create policy workspace_media_insert on public.circle_workspace_media for insert to authenticated with check (owner_id = (select auth.uid()) and coalesce((select auth.jwt()->>'is_anonymous'), 'false') <> 'true');
create policy workspace_follow_read on public.circle_workspace_follows for select to authenticated using (user_id = (select auth.uid()));
create policy workspace_follow_insert on public.circle_workspace_follows for insert to authenticated with check (user_id = (select auth.uid()) and coalesce((select auth.jwt()->>'is_anonymous'), 'false') <> 'true');
create policy workspace_follow_delete on public.circle_workspace_follows for delete to authenticated using (user_id = (select auth.uid()));
create policy workspace_review_read on public.circle_workspace_reviews for select to anon, authenticated using (true);
-- No anon/authenticated INSERT/UPDATE/DELETE on reviews. The narrowly scoped
-- server-only review action validates Released + positive nonrefunded D4 viewer contribution.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('circle-workspace-media', 'circle-workspace-media', false, 4194304, array['image/webp'])
on conflict (id) do nothing;
create policy workspace_object_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'circle-workspace-media' and (storage.foldername(name))[1] = (select auth.uid())::text
  and coalesce((select auth.jwt()->>'is_anonymous'), 'false') <> 'true'
  and name ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}\.webp$'
);
create policy workspace_object_read on storage.objects for select to anon, authenticated using (
  bucket_id = 'circle-workspace-media'
  and ((storage.foldername(name))[1] = (select auth.uid())::text or exists (select 1 from public.circle_workspace_media m where m.object_path = storage.objects.name))
);
create policy workspace_object_cleanup on storage.objects for delete to authenticated using (
  bucket_id = 'circle-workspace-media' and (storage.foldername(name))[1] = (select auth.uid())::text
  and not exists (select 1 from public.circle_workspace_media m where m.object_path = storage.objects.name)
);
commit;
