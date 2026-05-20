-- Run once in Supabase → SQL Editor → New query → Run.
-- Salapi Circles waitlist (Build-Award preview). Captures pledges from the
-- /circles/[id]/donate and /circles/create flows so we can notify supporters
-- the moment Salapi Circles ships at Build-Award. NO money is moved, NO
-- on-chain transaction is created. RLS is ON with NO policies; only the
-- server's service-role key can read/write. Email is the only PII collected.

create table if not exists public.circles_waitlist (
  id              uuid primary key default gen_random_uuid(),
  email           text not null,
  circle_id       text,            -- seed circle id, or "draft:<slug>" for creators
  peso_pledge     integer,         -- app-internal currency unit (PHP); informational
  anonymous       boolean not null default false,
  marketing_ok    boolean not null default true,
  locale          text,            -- en / tl / id / vi at time of pledge
  created_at      timestamptz not null default now()
);

create index if not exists circles_waitlist_email_idx
  on public.circles_waitlist (email);

create index if not exists circles_waitlist_circle_idx
  on public.circles_waitlist (circle_id);

alter table public.circles_waitlist enable row level security;

revoke all on public.circles_waitlist from anon, authenticated;
