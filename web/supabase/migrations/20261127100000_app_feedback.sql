-- Private feedback inbox. Submissions are created only through the server-side
-- RPC after the caller's Supabase session has been verified.
create table if not exists public.app_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('app_feedback', 'campaign_feedback', 'campaign_report')),
  category text not null check (category in (
    'suggestion', 'bug', 'question', 'fraud', 'scam', 'misleading_story', 'money_not_used',
    'misleading', 'inappropriate', 'suspicious', 'other'
  )),
  message text not null check (char_length(btrim(message)) between 10 and 3000),
  campaign_id text check (campaign_id is null or campaign_id ~ '^[0-9]{1,20}$'),
  evidence_paths text[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint app_feedback_campaign_scope check (
    (kind = 'app_feedback' and campaign_id is null)
    or (kind in ('campaign_feedback', 'campaign_report') and campaign_id is not null)
  ),
  constraint app_feedback_evidence_scope check (
    (kind = 'campaign_report' and cardinality(evidence_paths) between 1 and 5)
    or (kind <> 'campaign_report' and cardinality(evidence_paths) = 0)
  )
);

create index if not exists app_feedback_created_at_idx on public.app_feedback (created_at desc);
create index if not exists app_feedback_user_created_idx on public.app_feedback (user_id, created_at desc);

create table if not exists public.app_feedback_rate_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null,
  submission_count integer not null check (submission_count between 1 and 4)
);

create table if not exists public.campaign_ratings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id text not null check (campaign_id ~ '^[1-9][0-9]{0,19}$'),
  rating smallint not null check (rating between 1 and 5),
  comment text not null default '' check (char_length(btrim(comment)) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, campaign_id)
);
create index if not exists campaign_ratings_feed_idx on public.campaign_ratings (campaign_id, created_at desc);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('campaign-report-evidence', 'campaign-report-evidence', false, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 2097152,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

alter table public.app_feedback enable row level security;
alter table public.app_feedback_rate_limits enable row level security;
alter table public.campaign_ratings enable row level security;
revoke all on public.app_feedback, public.app_feedback_rate_limits, public.campaign_ratings from public, anon, authenticated, service_role;
grant select, insert on public.app_feedback to service_role;
grant select, insert, update, delete on public.app_feedback_rate_limits to service_role;
grant select, insert, update on public.campaign_ratings to service_role;
drop policy if exists "app_feedback_no_client_access" on public.app_feedback;
create policy "app_feedback_no_client_access" on public.app_feedback as restrictive for all to anon, authenticated using (false) with check (false);
drop policy if exists "app_feedback_rate_limits_no_client_access" on public.app_feedback_rate_limits;
create policy "app_feedback_rate_limits_no_client_access" on public.app_feedback_rate_limits as restrictive for all to anon, authenticated using (false) with check (false);
drop policy if exists "campaign_ratings_no_client_access" on public.campaign_ratings;
create policy "campaign_ratings_no_client_access" on public.campaign_ratings as restrictive for all to anon, authenticated using (false) with check (false);

create or replace function public.submit_app_feedback(
  p_user_id uuid,
  p_kind text,
  p_category text,
  p_message text,
  p_campaign_id text default null,
  p_evidence_paths text[] default '{}'
) returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer;
  v_now timestamptz := clock_timestamp();
begin
  if p_user_id is null
    or p_kind not in ('app_feedback', 'campaign_feedback', 'campaign_report')
    or p_category not in ('suggestion', 'bug', 'question', 'fraud', 'scam', 'misleading_story', 'money_not_used', 'misleading', 'inappropriate', 'suspicious', 'other')
    or p_message is null or char_length(btrim(p_message)) not between 10 and 3000
    or (p_kind = 'app_feedback' and p_campaign_id is not null)
    or (p_kind in ('campaign_feedback', 'campaign_report') and (p_campaign_id is null or p_campaign_id !~ '^[0-9]{1,20}$'))
    or (p_kind = 'campaign_report' and cardinality(coalesce(p_evidence_paths, '{}')) not between 1 and 5)
    or (p_kind <> 'campaign_report' and cardinality(coalesce(p_evidence_paths, '{}')) <> 0)
    or exists (
      select 1 from unnest(coalesce(p_evidence_paths, '{}')) as evidence(path)
      where path !~ ('^' || p_user_id::text || '/' || coalesce(p_campaign_id, '') || '/[0-9a-f-]{36}\.(jpg|png|webp)$')
    )
  then
    raise exception 'Invalid feedback submission';
  end if;

  insert into public.app_feedback_rate_limits (user_id, window_started_at, submission_count)
  values (p_user_id, v_now, 1)
  on conflict (user_id) do update set
    window_started_at = case
      when public.app_feedback_rate_limits.window_started_at <= v_now - interval '10 minutes' then v_now
      else public.app_feedback_rate_limits.window_started_at
    end,
    submission_count = case
      when public.app_feedback_rate_limits.window_started_at <= v_now - interval '10 minutes' then 1
      else least(public.app_feedback_rate_limits.submission_count + 1, 4)
    end
  returning submission_count into v_count;

  if v_count > 3 then
    return 'rate_limited';
  end if;

  insert into public.app_feedback (user_id, kind, category, message, campaign_id, evidence_paths)
  values (p_user_id, p_kind, p_category, btrim(p_message), p_campaign_id, coalesce(p_evidence_paths, '{}'));
  return 'saved';
end;
$$;

revoke all on function public.submit_app_feedback(uuid, text, text, text, text, text[]) from public, anon, authenticated;
grant execute on function public.submit_app_feedback(uuid, text, text, text, text, text[]) to service_role;

create or replace function public.submit_campaign_rating(
  p_user_id uuid,
  p_campaign_id text,
  p_rating smallint,
  p_comment text
) returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_user_id is null or p_campaign_id is null or p_campaign_id !~ '^[1-9][0-9]{0,19}$'
    or p_rating not between 1 and 5 or p_comment is null or char_length(btrim(p_comment)) > 500
  then raise exception 'Invalid campaign rating'; end if;

  insert into public.campaign_ratings (user_id, campaign_id, rating, comment)
  values (p_user_id, p_campaign_id, p_rating, btrim(p_comment))
  on conflict (user_id, campaign_id) do update set
    rating = excluded.rating, comment = excluded.comment, updated_at = clock_timestamp();
  return 'saved';
end;
$$;

revoke all on function public.submit_campaign_rating(uuid, text, smallint, text) from public, anon, authenticated;
grant execute on function public.submit_campaign_rating(uuid, text, smallint, text) to service_role;
