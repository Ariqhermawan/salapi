-- SETUP RECIPE ONLY. Not an applied migration and never executed by the app.
-- Review the intended project and existing schema before applying. Only the
-- server may attach metadata after verifying a successful D4 Testnet receipt.
-- Client wallet/amount/hash claims and contribution totals are not proof.

begin;

create table if not exists public.campaign_donors (
  id bigint generated always as identity primary key,
  network text not null check (network = 'testnet'),
  contract_id text not null check (contract_id ~ '^C[A-Z2-7]{55}$'),
  campaign_id text not null check (campaign_id ~ '^[1-9][0-9]{0,19}$'
    and campaign_id::numeric <= 18446744073709551615),
  transaction_hash text not null check (transaction_hash ~ '^[a-f0-9]{64}$' and transaction_hash <> repeat('0', 64)),
  donor_wallet text not null check (donor_wallet ~ '^G[A-Z2-7]{55}$'),
  owner_id uuid references auth.users(id) on delete set null,
  amount_stroops text not null check (amount_stroops ~ '^[1-9][0-9]{0,38}$'
    and amount_stroops::numeric <= 170141183460469231731687303715884105727),
  ledger bigint not null check (ledger between 1 and 4294967295),
  created_at timestamptz not null,
  anonymous boolean not null,
  public_profile_ok boolean not null default false check (not anonymous or not public_profile_ok),
  comment text not null default '' check (octet_length(comment) <= 500),
  unique (network, contract_id, transaction_hash)
);

create index if not exists campaign_donors_feed_idx on public.campaign_donors (network, contract_id, campaign_id, id desc);
create index if not exists campaign_donors_owner_idx on public.campaign_donors (owner_id);

alter table public.campaign_donors enable row level security;
revoke all on public.campaign_donors from public, anon, authenticated;
-- Immutable receipt rows: no client read and no UPDATE/DELETE privilege, not
-- even for the app service role. Anonymous-safe projection is server-only.
grant select, insert on public.campaign_donors to service_role;
revoke update, delete on public.campaign_donors from service_role;
grant usage, select on sequence public.campaign_donors_id_seq to service_role;
revoke all on sequence public.campaign_donors_id_seq from public, anon, authenticated;
drop policy if exists "campaign_donors_no_client_access" on public.campaign_donors;
create policy "campaign_donors_no_client_access" on public.campaign_donors as restrictive
for all to anon, authenticated using (false) with check (false);

-- No view or public RPC is created. Public feed entries omit owner_id always,
-- and anonymous entries additionally omit wallet, handle, photo and tx hash.
-- Display anonymity cannot erase public-chain amounts/timing or copied data.
-- Before applying to an existing table, inspect column grants, constraints,
-- identity sequence, triggers and policies; CREATE IF NOT EXISTS is not a
-- migration for a legacy table with incompatible columns/permissions.

commit;
