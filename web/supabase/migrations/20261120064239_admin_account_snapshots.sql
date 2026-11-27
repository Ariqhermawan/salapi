-- Daily per-account snapshot for the admin panel (admin.salapi.app): on-chain
-- username and sent-transaction count, read once a day by the
-- /api/cron/admin-snapshot job instead of on every admin page view, and kept
-- so activity can be compared across days. Server-only: RLS on, no policies.
-- Rows are written only when every read for the account succeeded, so a
-- missing value is a confirmed absence, never a failed read.
begin;

create table public.admin_account_snapshots (
  day date not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  wallet text check (wallet ~ '^G[A-Z2-7]{55}$'),
  username text check (username ~ '^[a-z0-9_]{3,32}$'),
  tx_sent integer not null check (tx_sent >= 0),
  captured_at timestamptz not null default now(),
  primary key (day, user_id)
);

create index admin_account_snapshots_user_day on public.admin_account_snapshots (user_id, day desc);

alter table public.admin_account_snapshots enable row level security;
revoke all on public.admin_account_snapshots from anon, authenticated;

commit;
