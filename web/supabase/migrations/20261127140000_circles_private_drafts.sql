-- One private, account-owned Circles planning draft per verified user.
-- This is not a campaign, public listing, donation record, or KYC result.
begin;

create table if not exists public.circles_drafts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  draft jsonb not null check (jsonb_typeof(draft) = 'object' and octet_length(draft::text) <= 24000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists circles_drafts_updated_at_idx
  on public.circles_drafts (updated_at desc);

alter table public.circles_drafts enable row level security;
revoke all on public.circles_drafts from public, anon, authenticated, service_role;
grant select, insert, update on public.circles_drafts to service_role;
drop policy if exists "circles_drafts_no_client_access" on public.circles_drafts;
create policy "circles_drafts_no_client_access" on public.circles_drafts as restrictive
  for all to anon, authenticated using (false) with check (false);

-- D4 campaign bookmarks are private account preferences, not public pledges.
create table if not exists public.d4_saved_campaigns (
  user_id uuid not null references auth.users (id) on delete cascade,
  campaign_id text not null check (campaign_id ~ '^[1-9][0-9]{0,19}$' and campaign_id::numeric <= 18446744073709551615),
  created_at timestamptz not null default now(),
  primary key (user_id, campaign_id)
);

create index if not exists d4_saved_campaigns_recent_idx
  on public.d4_saved_campaigns (user_id, created_at desc);

alter table public.d4_saved_campaigns enable row level security;
revoke all on public.d4_saved_campaigns from public, anon, authenticated, service_role;
grant select, insert, delete on public.d4_saved_campaigns to service_role;
drop policy if exists "d4_saved_campaigns_no_client_access" on public.d4_saved_campaigns;
create policy "d4_saved_campaigns_no_client_access" on public.d4_saved_campaigns as restrictive
  for all to anon, authenticated using (false) with check (false);

commit;
