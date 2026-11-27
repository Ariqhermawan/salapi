-- Server-only, one-time Testnet USDC referral reward state.
-- No client role can read or mutate claim state or signed transaction XDR.

begin;

create table public.referral_reward_payouts (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  network text not null default 'testnet' check (network = 'testnet'),
  amount_stroops text not null default '200000000' check (amount_stroops = '200000000'),
  qualified_invites smallint not null default 10 check (qualified_invites = 10),
  status text not null default 'pending'
    check (status in ('pending', 'preparing', 'submitted', 'paid', 'failed')),
  treasury_public_key text check (treasury_public_key is null or treasury_public_key ~ '^G[A-Z2-7]{55}$'),
  recipient_wallet text check (recipient_wallet is null or recipient_wallet ~ '^G[A-Z2-7]{55}$'),
  transaction_hash text check (transaction_hash is null or transaction_hash ~ '^[a-f0-9]{64}$'),
  transaction_xdr text check (transaction_xdr is null or octet_length(transaction_xdr) between 1 and 8192),
  lease_token uuid,
  lease_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint referral_reward_transaction_state check (
    (status in ('pending', 'preparing') and treasury_public_key is null and recipient_wallet is null
      and transaction_hash is null and transaction_xdr is null)
    or (status in ('submitted', 'paid', 'failed') and treasury_public_key is not null and recipient_wallet is not null
      and transaction_hash is not null and transaction_xdr is not null)
  )
);

alter table public.referral_reward_payouts enable row level security;
revoke all on public.referral_reward_payouts from public, anon, authenticated, service_role;
grant select, insert, update on public.referral_reward_payouts to service_role;
drop policy if exists "referral_reward_payouts_no_client_access" on public.referral_reward_payouts;
create policy "referral_reward_payouts_no_client_access" on public.referral_reward_payouts as restrictive
for all to anon, authenticated using (false) with check (false);

-- One lease serializes all payouts that share the dedicated treasury's Stellar
-- sequence number. A missed confirmation leaves the lease to expire safely.
create table public.referral_reward_treasury_lock (
  lock_id smallint primary key default 1 check (lock_id = 1),
  lease_token uuid,
  lease_until timestamptz,
  updated_at timestamptz not null default now(),
  constraint referral_reward_treasury_lock_lease check (
    (lease_token is null and lease_until is null) or (lease_token is not null and lease_until is not null)
  )
);
insert into public.referral_reward_treasury_lock (lock_id) values (1);
alter table public.referral_reward_treasury_lock enable row level security;
revoke all on public.referral_reward_treasury_lock from public, anon, authenticated, service_role;
grant select, update on public.referral_reward_treasury_lock to service_role;
create policy "referral_reward_treasury_lock_no_client_access" on public.referral_reward_treasury_lock as restrictive
for all to anon, authenticated using (false) with check (false);

-- Campaign-donor receipts are installed separately in some deployments. Use
-- dynamic SQL so this migration can be applied first; reads fail closed until
-- that immutable, server-written receipt table is present.
create or replace function public.referral_donation_totals(p_inviter_id uuid, p_contract_id text)
returns table(invited_id uuid, amount_stroops text)
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if to_regclass('public.campaign_donors') is null then
    raise exception 'campaign donor receipts are not configured';
  end if;
  return query execute $query$
    select donors.owner_id, sum(donors.amount_stroops::numeric)::text
    from public.campaign_donors as donors
    join public.referral_attributions as attribution on attribution.invited_id = donors.owner_id
    where attribution.inviter_id = $1
      and donors.network = 'testnet'
      and donors.contract_id = $2
      and donors.owner_id is not null
    group by donors.owner_id
  $query$ using p_inviter_id, p_contract_id;
end;
$$;

revoke all on function public.referral_donation_totals(uuid, text) from public, anon, authenticated;
grant execute on function public.referral_donation_totals(uuid, text) to service_role;

commit;
