-- A per-deployment repair cursor. Never advance past an unpersisted room watch.
begin;
create table public.arisan_scheduled_discovery (
  contract_id text primary key check(contract_id ~ '^C[A-Z2-7]{55}$'),
  highwater bigint not null default 0 check(highwater between 0 and 4294967295),
  updated_at timestamptz not null default now()
);
alter table public.arisan_scheduled_discovery enable row level security;
revoke all on public.arisan_scheduled_discovery from public,anon,authenticated;
grant select,insert,update,delete on public.arisan_scheduled_discovery to service_role;
create function public.arisan_scheduled_discovery_cursor(p_contract text)
returns bigint language plpgsql security invoker set search_path='' as $$
declare n bigint;
begin
  insert into public.arisan_scheduled_discovery(contract_id) values(p_contract) on conflict do nothing;
  select highwater into n from public.arisan_scheduled_discovery where contract_id=p_contract;
  return n;
end $$;
create function public.arisan_scheduled_discovery_advance(p_contract text,p_expected bigint,p_next bigint)
returns boolean language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
  if p_next<>p_expected+1 or p_next not between 1 and 4294967295 then raise exception 'Discovery cannot skip rooms'; end if;
  if not exists(select 1 from public.arisan_room_notification_watches where contract_id=p_contract and room_kind='scheduled' and room_id=p_next) then return false; end if;
  update public.arisan_scheduled_discovery set highwater=p_next,updated_at=now() where contract_id=p_contract and highwater=p_expected;
  get diagnostics n=row_count; return n=1;
end $$;
revoke all on function public.arisan_scheduled_discovery_cursor(text),public.arisan_scheduled_discovery_advance(text,bigint,bigint) from public,anon,authenticated;
grant execute on function public.arisan_scheduled_discovery_cursor(text),public.arisan_scheduled_discovery_advance(text,bigint,bigint) to service_role;
commit;
