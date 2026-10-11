-- Supersedes the initial weekly cadence. Scheduled contract code TTL is kept
-- short to bound rent fees, so operational maintenance must be attempted daily.
begin;
create or replace function public.arisan_scheduled_keepalive_claim(p_contract text,p_signer text,p_token uuid)
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
        or (k.pending_hash is null and (k.last_confirmed_at is null or k.last_confirmed_at<=now()-interval '1 day')
          and (k.last_attempt_at is null or k.last_attempt_at<=now()-interval '6 hours')
          and exists(select 1 from public.arisan_room_notification_watches w where w.contract_id=k.contract_id and w.room_kind='scheduled' and w.room_id=k.room_id and w.snapshot->>'status' in ('Open','Active'))))
    order by k.last_attempt_at nulls first,k.room_id limit 1 for update skip locked;
  if j.contract_id is null then return null; end if;
  insert into public.arisan_operational_signer_leases values(p_signer,p_token,now()+interval '5 minutes')
    on conflict(signer_wallet) do update set lease_token=excluded.lease_token,lease_until=excluded.lease_until;
  update public.arisan_scheduled_keepalive set lease_token=p_token,lease_until=now()+interval '5 minutes',last_attempt_at=now() where contract_id=j.contract_id and room_id=j.room_id returning * into j;
  return to_jsonb(j);
end $$;
revoke all on function public.arisan_scheduled_keepalive_claim(text,text,uuid) from public,anon,authenticated;
grant execute on function public.arisan_scheduled_keepalive_claim(text,text,uuid) to service_role;
commit;
