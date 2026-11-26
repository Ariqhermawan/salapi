create table if not exists public.wallet_confirmation_intents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  wallet_address text not null,
  action text not null check (action in (
    'username_send',
    'campaign_create',
    'campaign_donate',
    'campaign_submit_proof',
    'campaign_approve',
    'campaign_release',
    'campaign_refund',
    'campaign_close_empty'
  )),
  payload jsonb not null,
  transaction_xdr text not null,
  fee_stroops text not null check (fee_stroops ~ '^[1-9][0-9]{0,15}$'),
  intent_hash text not null check (intent_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at and expires_at <= created_at + interval '5 minutes')
);

create index if not exists wallet_confirmation_intents_owner_expiry_idx
  on public.wallet_confirmation_intents (owner_id, expires_at);

alter table public.wallet_confirmation_intents enable row level security;
revoke all on public.wallet_confirmation_intents from anon, authenticated;
grant select, insert, update, delete on public.wallet_confirmation_intents to service_role;
