create table if not exists public.wallet_activity_withdrawals (
  owner_id uuid not null references auth.users (id) on delete cascade,
  wallet_address text not null check (wallet_address ~ '^G[A-Z2-7]{55}$'),
  transaction_hash text not null check (transaction_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  primary key (owner_id, wallet_address, transaction_hash)
);

alter table public.wallet_activity_withdrawals enable row level security;
revoke all on public.wallet_activity_withdrawals from anon, authenticated;
grant select, insert, update, delete on public.wallet_activity_withdrawals to service_role;
