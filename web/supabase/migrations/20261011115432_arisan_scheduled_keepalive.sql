-- Operational Testnet TTL maintenance only. No member signer or payout authority.
begin;
create table public.arisan_scheduled_keepalive (
  contract_id text not null check(contract_id ~ '^C[A-Z2-7]{55}$'),
  room_id bigint not null check(room_id between 1 and 4294967295),
  last_confirmed_at timestamptz,
  last_confirmed_hash text check(last_confirmed_hash ~ '^[0-9a-f]{64}$'),
  last_attempt_at timestamptz,
  last_error text check(length(last_error)<=80),
  lease_token uuid,
  lease_until timestamptz,
  pending_hash text check(pending_hash ~ '^[0-9a-f]{64}$'),
  pending_envelope text check(length(pending_envelope) between 1 and 131072),
  pending_min_time bigint,
  pending_max_time bigint,
  primary key(contract_id,room_id),
  check((pending_hash is null and pending_envelope is null and pending_min_time is null and pending_max_time is null)
    or (pending_hash is not null and pending_envelope is not null and pending_min_time is not null and pending_max_time>pending_min_time))
);
create table public.arisan_operational_signer_leases (
  signer_wallet text primary key check(signer_wallet ~ '^G[A-Z2-7]{55}$'),
  lease_token uuid not null,
  lease_until timestamptz not null
);
alter table public.arisan_scheduled_keepalive enable row level security;
alter table public.arisan_operational_signer_leases enable row level security;
revoke all on public.arisan_scheduled_keepalive,public.arisan_operational_signer_leases from public,anon,authenticated;
grant select,insert,update,delete on public.arisan_scheduled_keepalive,public.arisan_operational_signer_leases to service_role;

-- Only rooms registered through an authoritative verified-chain watcher are
-- eligible. A signer lease serializes envelope construction across workers.
create function public.arisan_scheduled_keepalive_claim(p_contract text,p_signer text,p_token uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.arisan_scheduled_keepalive; held public.arisan_operational_signer_leases;
begin
  if p_contract !~ '^C[A-Z2-7]{55}$' or p_signer !~ '^G[A-Z2-7]{55}$' or p_token is null then raise exception 'Invalid operational scope'; end if;
  perform pg_advisory_xact_lock(hashtextextended('arisan-keepalive:'||p_signer,0));
  select * into held from public.arisan_operational_signer_leases where signer_wallet=p_signer for update;
  if held.lease_until>now() then return null; end if;
  insert into public.arisan_scheduled_keepalive(contract_id,room_id)
    select contract_id,room_id from public.arisan_room_notification_watches where contract_id=p_contract and room_kind='scheduled' and snapshot->>'status' in ('Open','Active')
    on conflict do nothing;
  select k.* into j from public.arisan_scheduled_keepalive k
    where k.contract_id=p_contract and (k.lease_until is null or k.lease_until<=now())
      and ((k.pending_hash is not null and (k.last_attempt_at is null or k.last_attempt_at<=now()-interval '10 minutes'))
        or (k.pending_hash is null and (k.last_confirmed_at is null or k.last_confirmed_at<=now()-interval '7 days')
          and (k.last_attempt_at is null or k.last_attempt_at<=now()-interval '6 hours')
          and exists(select 1 from public.arisan_room_notification_watches w where w.contract_id=k.contract_id and w.room_kind='scheduled' and w.room_id=k.room_id and w.snapshot->>'status' in ('Open','Active'))))
    order by k.last_attempt_at nulls first,k.room_id limit 1 for update skip locked;
  if j.contract_id is null then return null; end if;
  insert into public.arisan_operational_signer_leases values(p_signer,p_token,now()+interval '5 minutes')
    on conflict(signer_wallet) do update set lease_token=excluded.lease_token,lease_until=excluded.lease_until;
  update public.arisan_scheduled_keepalive set lease_token=p_token,lease_until=now()+interval '5 minutes',last_attempt_at=now() where contract_id=j.contract_id and room_id=j.room_id returning * into j;
  return to_jsonb(j);
end $$;

-- Signed envelopes are private recovery material, persisted BEFORE the first
-- send. Never replace one while its acceptance is unknown.
create function public.arisan_scheduled_keepalive_prepare(p_contract text,p_room bigint,p_signer text,p_token uuid,p_hash text,p_envelope text,p_min_time bigint,p_max_time bigint)
returns boolean language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
  if p_hash !~ '^[0-9a-f]{64}$' or length(p_envelope) not between 1 and 131072
    or p_min_time<extract(epoch from now())::bigint-60 or p_max_time<=extract(epoch from now())::bigint or p_max_time>extract(epoch from now())::bigint+120 or p_max_time-p_min_time>120 then raise exception 'Invalid bounded envelope'; end if;
  perform 1 from public.arisan_operational_signer_leases where signer_wallet=p_signer and lease_token=p_token and lease_until>now() for update;
  if not found then return false; end if;
  update public.arisan_scheduled_keepalive set pending_hash=p_hash,pending_envelope=p_envelope,pending_min_time=p_min_time,pending_max_time=p_max_time,last_error=null
    where contract_id=p_contract and room_id=p_room and lease_token=p_token and lease_until>now() and pending_hash is null;
  get diagnostics n=row_count; return n=1;
end $$;

create function public.arisan_scheduled_keepalive_finish(p_contract text,p_room bigint,p_signer text,p_token uuid,p_hash text,p_outcome text,p_error text default null)
returns boolean language plpgsql security invoker set search_path='' as $$
declare j public.arisan_scheduled_keepalive;
begin
  if p_outcome not in ('confirmed','failed','expired','deferred','pending') or length(p_error)>80 then raise exception 'Invalid operational outcome'; end if;
  perform 1 from public.arisan_operational_signer_leases where signer_wallet=p_signer and lease_token=p_token for update;
  if not found then return false; end if;
  select * into j from public.arisan_scheduled_keepalive where contract_id=p_contract and room_id=p_room and lease_token=p_token for update;
  if j.contract_id is null or (p_outcome='deferred' and j.pending_hash is not null)
    or (p_outcome<>'deferred' and (j.pending_hash is null or j.pending_hash is distinct from p_hash)) then return false; end if;
  update public.arisan_scheduled_keepalive set
    last_confirmed_at=case when p_outcome='confirmed' then now() else last_confirmed_at end,
    last_confirmed_hash=case when p_outcome='confirmed' then pending_hash else last_confirmed_hash end,
    pending_hash=case when p_outcome='pending' then pending_hash else null end,
    pending_envelope=case when p_outcome='pending' then pending_envelope else null end,
    pending_min_time=case when p_outcome='pending' then pending_min_time else null end,
    pending_max_time=case when p_outcome='pending' then pending_max_time else null end,
    last_error=p_error,lease_token=null,lease_until=null where contract_id=p_contract and room_id=p_room;
  delete from public.arisan_operational_signer_leases where signer_wallet=p_signer and lease_token=p_token;
  return true;
end $$;
revoke all on function public.arisan_scheduled_keepalive_claim(text,text,uuid),public.arisan_scheduled_keepalive_prepare(text,bigint,text,uuid,text,text,bigint,bigint),public.arisan_scheduled_keepalive_finish(text,bigint,text,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.arisan_scheduled_keepalive_claim(text,text,uuid),public.arisan_scheduled_keepalive_prepare(text,bigint,text,uuid,text,text,bigint,bigint),public.arisan_scheduled_keepalive_finish(text,bigint,text,uuid,text,text,text) to service_role;
commit;
