-- SETUP RECIPE ONLY. Not an applied migration. No live rows are provisioned.
-- Review the intended Supabase project, D4 Testnet deployment and QA wallets
-- before execution. For tracked migrations, use Supabase CLI migration new.
-- These associations are fictional QA exercises, not verified NGO campaigns.
begin;

create table if not exists public.circles_testnet_campaigns (
  network text not null check (network = 'testnet'),
  contract_id text not null check (contract_id ~ '^C[A-Z2-7]{55}$'),
  circle_slug text not null check (circle_slug in (
    'tino-relief', 'ate-mei-dialysis', 'arisan-banjir-jakarta', 'barangay-library',
    'ofw-family-tuition', 'creator-baybayin', 'cebu-family-home', 'cebu-community-water',
    'quezon-afterclass', 'quezon-family-roof', 'jakarta-river-cleanup', 'jakarta-community-mural',
    'bohol-health-screening', 'bohol-reading-zine', 'tarlac-storm-packs', 'tarlac-school-kits',
    'manila-medical-transport', 'manila-community-makerspace', 'cats-recovery', 'dogs-rescue-care',
    'shared-animal-shelter', 'orphanage-learning-room', 'elder-home-meals', 'community-free-kitchen',
    'river-volunteer-kit', 'flood-volunteer-logistics', 'forest-fire-volunteer-safety'
  )),
  campaign_id text not null check (campaign_id ~ '^[1-9][0-9]{0,19}$'
    and campaign_id::numeric <= 18446744073709551615),
  campaign_title text not null check (campaign_title = 'QA Circles: ' || circle_slug
    and octet_length(campaign_title) between 1 and 120),
  creator_wallet text not null check (creator_wallet ~ '^G[A-Z2-7]{55}$'),
  beneficiary_wallet text not null check (beneficiary_wallet ~ '^G[A-Z2-7]{55}$' and beneficiary_wallet <> creator_wallet),
  token_id text not null check (token_id = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC'),
  approver_wallets text[] not null check (cardinality(approver_wallets) = 3
    and array_ndims(approver_wallets) = 1 and array_lower(approver_wallets, 1) = 1
    and approver_wallets[1] is not null and approver_wallets[2] is not null and approver_wallets[3] is not null
    and approver_wallets[1] ~ '^G[A-Z2-7]{55}$' and approver_wallets[2] ~ '^G[A-Z2-7]{55}$'
    and approver_wallets[3] ~ '^G[A-Z2-7]{55}$' and approver_wallets[1] <> approver_wallets[2]
    and approver_wallets[1] <> approver_wallets[3] and approver_wallets[2] <> approver_wallets[3]
    and not (creator_wallet = any(approver_wallets)) and not (beneficiary_wallet = any(approver_wallets))),
  creator_cut_bps integer not null check (creator_cut_bps between 0 and 1000),
  funding_deadline text not null check (funding_deadline ~ '^[1-9][0-9]{0,19}$'
    and funding_deadline::numeric <= 18446744073709551615),
  review_deadline text not null check (review_deadline ~ '^[1-9][0-9]{0,19}$'
    and review_deadline::numeric <= 18446744073709551615
    and review_deadline::numeric > funding_deadline::numeric),
  purpose text not null check (purpose = 'fictional-circles-qa'),
  created_at timestamptz not null default now(),
  archived_at timestamptz check (archived_at is null or archived_at >= created_at),
  -- A campaign can never be rebound to a different fictional cause, even after
  -- archival. Replacement requires a reviewed fresh on-chain campaign ID.
  primary key (network, contract_id, campaign_id)
);

create unique index if not exists circles_testnet_campaigns_active_slug_idx
  on public.circles_testnet_campaigns (network, contract_id, circle_slug)
  where archived_at is null;

alter table public.circles_testnet_campaigns enable row level security;
-- Service-role reads are intentionally server-only. The application does not
-- create, replace, archive or delete mappings. Provisioning is a separate,
-- reviewed privileged operation, never an anon/authenticated SDK request.
revoke all on public.circles_testnet_campaigns from public, anon, authenticated, service_role;
grant select on public.circles_testnet_campaigns to service_role;
drop policy if exists "circles_testnet_campaigns_no_client_access" on public.circles_testnet_campaigns;
create policy "circles_testnet_campaigns_no_client_access" on public.circles_testnet_campaigns as restrictive
for all to anon, authenticated using (false) with check (false);

-- Immutable terms also hold for privileged updates. Only a one-way archival
-- timestamp is permitted; a fresh mapping is inserted after explicit review.
-- SECURITY INVOKER, no elevated privileges and no callable mutation RPC.
create or replace function public.guard_circles_testnet_campaign_mapping()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if TG_OP = 'DELETE' then
    raise exception 'Circles Testnet mappings retain immutable history; archive instead';
  end if;
  if old.archived_at is not null or new.archived_at is null
    or (to_jsonb(new) - 'archived_at') is distinct from (to_jsonb(old) - 'archived_at') then
    raise exception 'Circles Testnet mapping terms are immutable; only one-way archival is allowed';
  end if;
  return new;
end $$;
revoke all on function public.guard_circles_testnet_campaign_mapping() from public, anon, authenticated, service_role;
drop trigger if exists circles_testnet_campaigns_immutable on public.circles_testnet_campaigns;
create trigger circles_testnet_campaigns_immutable before update or delete
  on public.circles_testnet_campaigns for each row execute function public.guard_circles_testnet_campaign_mapping();

-- No real creator/beneficiary/reviewer wallet is inferred from the fictional
-- organizer portrait or name. Confirm each QA recipient and controller before
-- inserting rows. Verify all terms against D4 version(), token(), campaign().
commit;
