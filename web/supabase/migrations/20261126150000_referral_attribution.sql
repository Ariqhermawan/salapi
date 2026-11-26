create table public.referral_codes (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  code text not null unique default upper(substr(gen_random_uuid()::text, 1, 8)),
  created_at timestamptz not null default now(),
  constraint referral_code_format check (code ~ '^[A-F0-9]{8}$')
);

create table public.referral_attributions (
  invited_id uuid primary key references auth.users(id) on delete cascade,
  inviter_id uuid not null references public.referral_codes(owner_id) on delete cascade,
  recorded_at timestamptz not null default now(),
  constraint referral_distinct_accounts check (invited_id <> inviter_id)
);

create index referral_attributions_inviter_idx on public.referral_attributions(inviter_id);
alter table public.referral_codes enable row level security;
alter table public.referral_attributions enable row level security;
revoke all on public.referral_codes, public.referral_attributions from anon, authenticated, service_role;
grant select, insert on public.referral_codes, public.referral_attributions to service_role;
