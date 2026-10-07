-- SETUP RECIPE ONLY. Not applied by the app. Review the intended Salapi project
-- before applying; do not run this against another accessible Supabase project.
-- This does not modify circles_waitlist, deploy a contract or send email.
-- Recipient email is private service-role data; never SELECT * in public actions.
begin;

create table if not exists public.campaign_update_subscriptions (
  id uuid primary key default gen_random_uuid(),
  network text not null check (network = 'testnet'),
  contract_id text not null check (contract_id ~ '^C[A-Z2-7]{55}$'),
  campaign_id text not null check (campaign_id ~ '^[1-9][0-9]{0,19}$' and campaign_id::numeric <= 18446744073709551615),
  user_id uuid not null references auth.users(id) on delete cascade,
  wallet text not null check (wallet ~ '^G[A-Z2-7]{55}$'),
  email text not null check (length(email) <= 200 and email = lower(btrim(email)) and email ~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$'),
  notify_ok boolean not null check (notify_ok),
  active boolean not null default true,
  consent_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (network, contract_id, campaign_id, user_id),
  check ((active and revoked_at is null) or (not active and revoked_at is not null))
);

create table if not exists public.campaign_updates (
  id uuid primary key,
  network text not null check (network = 'testnet'),
  contract_id text not null check (contract_id ~ '^C[A-Z2-7]{55}$'),
  campaign_id text not null check (campaign_id ~ '^[1-9][0-9]{0,19}$' and campaign_id::numeric <= 18446744073709551615),
  creator_wallet text not null check (creator_wallet ~ '^G[A-Z2-7]{55}$'),
  published_by uuid references auth.users(id) on delete set null,
  title text not null check (length(title) between 1 and 120 and title = btrim(title) and title !~ '[\r\n]'),
  body text not null check (length(body) between 1 and 4000 and body = btrim(body)),
  public_acknowledged boolean not null default true check (public_acknowledged),
  purpose text not null default 'fictional-circles-qa' check (purpose = 'fictional-circles-qa'),
  published_at timestamptz not null default now()
);

create table if not exists public.campaign_update_outbox (
  id uuid primary key default gen_random_uuid(),
  update_id uuid not null references public.campaign_updates(id) on delete cascade,
  subscription_id uuid not null references public.campaign_update_subscriptions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  recipient_email text not null,
  subject text not null check (length(subject) between 1 and 160 and subject !~ '[\r\n]'),
  email_text text not null check (length(email_text) between 1 and 6000),
  -- Set once on the first claim. Retried request bodies must stay identical,
  -- even if the deployment's sender configuration changes later.
  sender text,
  status text not null default 'pending' check (status in ('pending','inflight','unknown','accepted','rejected','cancelled','needs_review')),
  first_attempt_at timestamptz,
  retry_after timestamptz,
  lease_token uuid,
  lease_until timestamptz,
  provider_id uuid,
  updated_at timestamptz not null default now(),
  unique (update_id, subscription_id)
);

create index if not exists campaign_update_subscriptions_scope_idx on public.campaign_update_subscriptions(network,contract_id,campaign_id) where active;
create index if not exists campaign_updates_scope_idx on public.campaign_updates(network,contract_id,campaign_id,published_at desc);
create index if not exists campaign_update_outbox_retry_idx on public.campaign_update_outbox(update_id,status,retry_after);
create index if not exists campaign_update_subscriptions_user_idx on public.campaign_update_subscriptions(user_id);
create index if not exists campaign_updates_publisher_idx on public.campaign_updates(published_by);
create index if not exists campaign_update_outbox_subscription_idx on public.campaign_update_outbox(subscription_id);
create index if not exists campaign_update_outbox_user_idx on public.campaign_update_outbox(user_id);

alter table public.campaign_update_subscriptions enable row level security;
alter table public.campaign_updates enable row level security;
alter table public.campaign_update_outbox enable row level security;
revoke all on public.campaign_update_subscriptions, public.campaign_updates, public.campaign_update_outbox from public, anon, authenticated, service_role;
grant select, insert, update on public.campaign_update_subscriptions, public.campaign_updates, public.campaign_update_outbox to service_role;

drop policy if exists campaign_update_subscriptions_no_client on public.campaign_update_subscriptions;
create policy campaign_update_subscriptions_no_client on public.campaign_update_subscriptions as restrictive for all to anon, authenticated using (false) with check (false);
drop policy if exists campaign_updates_no_client on public.campaign_updates;
create policy campaign_updates_no_client on public.campaign_updates as restrictive for all to anon, authenticated using (false) with check (false);
drop policy if exists campaign_update_outbox_no_client on public.campaign_update_outbox;
create policy campaign_update_outbox_no_client on public.campaign_update_outbox as restrictive for all to anon, authenticated using (false) with check (false);

-- Every RPC is SECURITY INVOKER and only service_role can execute it. The
-- server verifies getUser(), canonical saved wallet, complete current D4 config
-- and the reviewed active Circles QA mapping before invoking subscription/publish.
create or replace function public.campaign_updates_subscribe(
  p_network text, p_contract text, p_campaign text, p_user uuid, p_wallet text, p_email text, p_notify_ok boolean
) returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if p_notify_ok is distinct from true then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_network || '/' || p_contract || '/' || p_campaign, 0));
  insert into public.campaign_update_subscriptions(network,contract_id,campaign_id,user_id,wallet,email,notify_ok)
  values(p_network,p_contract,p_campaign,p_user,p_wallet,p_email,true)
  on conflict(network,contract_id,campaign_id,user_id) do update
    set wallet = excluded.wallet, email = excluded.email, notify_ok = true, active = true, consent_at = now(), revoked_at = null;
  -- Never re-enable previously cancelled old updates on a new subscription.
  return true;
end $$;

create or replace function public.campaign_updates_unsubscribe(
  p_network text, p_contract text, p_campaign text, p_user uuid
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare subscription uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_network || '/' || p_contract || '/' || p_campaign, 0));
  update public.campaign_update_subscriptions set active = false, revoked_at = now()
  where network = p_network and contract_id = p_contract and campaign_id = p_campaign and user_id = p_user
  returning id into subscription;
  if subscription is not null then
    update public.campaign_update_outbox set status = 'cancelled', lease_token = null, lease_until = null, retry_after = null, updated_at = now()
    where subscription_id = subscription and status in ('pending','unknown','inflight');
  end if;
  -- A request already accepted by the provider cannot be recalled. There is no
  -- claim of recall/delivery; future dispatches are disabled immediately.
  return true;
end $$;

create or replace function public.campaign_updates_publish(
  p_network text, p_contract text, p_campaign text, p_update uuid, p_user uuid,
  p_creator text, p_title text, p_body text, p_email_text text
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare existing public.campaign_updates%rowtype;
begin
  -- Serialize publishing per campaign, including concurrent idempotent retries.
  perform pg_advisory_xact_lock(hashtextextended(p_network || '/' || p_contract || '/' || p_campaign, 0));
  select * into existing from public.campaign_updates where id = p_update;
  if found then
    if existing.network = p_network and existing.contract_id = p_contract and existing.campaign_id = p_campaign
      and existing.published_by = p_user and existing.creator_wallet = p_creator and existing.title = p_title and existing.body = p_body
      then return existing.id; else return null; end if;
  end if;
  -- Explicit limits avoid unlimited email snapshots/spam in this QA feature.
  if (select count(*) from public.campaign_updates where network = p_network and contract_id = p_contract and campaign_id = p_campaign) >= 100
    or exists(select 1 from public.campaign_updates where network = p_network and contract_id = p_contract and campaign_id = p_campaign and published_at > now() - interval '1 minute')
    or (select count(*) from public.campaign_update_subscriptions where network = p_network and contract_id = p_contract and campaign_id = p_campaign and active and notify_ok) > 1000
    then return null; end if;
  insert into public.campaign_updates(id,network,contract_id,campaign_id,creator_wallet,published_by,title,body)
  values(p_update,p_network,p_contract,p_campaign,p_creator,p_user,p_title,p_body);
  insert into public.campaign_update_outbox(update_id,subscription_id,user_id,recipient_email,subject,email_text)
  select p_update,id,user_id,email,'[QA Testnet] ' || p_title,p_email_text from public.campaign_update_subscriptions
  where network = p_network and contract_id = p_contract and campaign_id = p_campaign and active and notify_ok and revoked_at is null;
  return p_update;
end $$;

create or replace function public.campaign_updates_claim(
  p_network text, p_contract text, p_campaign text, p_update uuid, p_sender text, p_limit integer default 5
) returns setof public.campaign_update_outbox language plpgsql security invoker set search_path = '' as $$
begin
  if p_limit < 1 or p_limit > 5 or p_sender is null or length(p_sender) > 200 or p_sender ~ '[\r\n]' then return; end if;
  if not exists(select 1 from public.campaign_updates where id = p_update and network = p_network and contract_id = p_contract and campaign_id = p_campaign) then return; end if;
  -- Never resend uncertain requests after the provider's 24h idempotency
  -- retention. A human must reconcile provider state; a new key is not safe.
  update public.campaign_update_outbox set status = 'needs_review', lease_token = null, lease_until = null, retry_after = null, updated_at = now()
  where update_id = p_update and status in ('unknown','inflight') and first_attempt_at <= now() - interval '23 hours'
    and (lease_until is null or lease_until <= now());
  return query
  with eligible as (
    select o.id from public.campaign_update_outbox o
    join public.campaign_update_subscriptions s on s.id = o.subscription_id
    where o.update_id = p_update and s.active and s.notify_ok and s.revoked_at is null and s.email = o.recipient_email
      and (o.status in ('pending','unknown') or (o.status = 'inflight' and o.lease_until <= now()))
      and (o.retry_after is null or o.retry_after <= now())
      and (o.first_attempt_at is null or o.first_attempt_at > now() - interval '23 hours')
    order by o.id limit p_limit for update of o skip locked
  ) update public.campaign_update_outbox o set status = 'inflight',
    first_attempt_at = coalesce(o.first_attempt_at,now()), sender = coalesce(o.sender,p_sender),
    lease_token = gen_random_uuid(), lease_until = now() + interval '3 minutes', updated_at = now()
    from eligible where o.id = eligible.id returning o.*;
end $$;

create or replace function public.campaign_updates_finish(
  p_outbox uuid, p_lease uuid, p_status text, p_provider_id uuid, p_retry_after timestamptz
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare changed integer;
begin
  if p_status not in ('accepted','unknown','rejected','cancelled') or (p_status = 'accepted' and p_provider_id is null) then return false; end if;
  update public.campaign_update_outbox set status = p_status, provider_id = p_provider_id,
    retry_after = case when p_status = 'unknown' then greatest(coalesce(p_retry_after,now() + interval '1 minute'),now() + interval '1 minute') else null end,
    lease_token = null, lease_until = null, updated_at = now()
  where id = p_outbox and status = 'inflight' and lease_token = p_lease;
  get diagnostics changed = row_count;
  return changed = 1;
end $$;

revoke all on function public.campaign_updates_subscribe(text,text,text,uuid,text,text,boolean) from public,anon,authenticated,service_role;
revoke all on function public.campaign_updates_unsubscribe(text,text,text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.campaign_updates_publish(text,text,text,uuid,uuid,text,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.campaign_updates_claim(text,text,text,uuid,text,integer) from public,anon,authenticated,service_role;
revoke all on function public.campaign_updates_finish(uuid,uuid,text,uuid,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.campaign_updates_subscribe(text,text,text,uuid,text,text,boolean) to service_role;
grant execute on function public.campaign_updates_unsubscribe(text,text,text,uuid) to service_role;
grant execute on function public.campaign_updates_publish(text,text,text,uuid,uuid,text,text,text,text) to service_role;
grant execute on function public.campaign_updates_claim(text,text,text,uuid,text,integer) to service_role;
grant execute on function public.campaign_updates_finish(uuid,uuid,text,uuid,timestamptz) to service_role;
commit;
