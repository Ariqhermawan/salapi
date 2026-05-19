-- Run once in Supabase → SQL Editor → New query → Run.
-- Per-user custodial Stellar wallet (testnet). Secret is AES-256-GCM encrypted
-- by the app before insert; RLS is ON with NO policies, so only the server's
-- service-role key can read/write it. Clients can never reach the secret.

create table if not exists public.wallets (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  public_key    text not null,
  secret_cipher text not null,
  created_at    timestamptz not null default now()
);

alter table public.wallets enable row level security;

revoke all on public.wallets from anon, authenticated;
