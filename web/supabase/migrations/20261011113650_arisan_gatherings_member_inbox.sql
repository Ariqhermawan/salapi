-- Server-only social coordination. No wallet secret, financial mutation,
-- payment authorization, public directory, email or push delivery is added.
begin;

create table public.arisan_gatherings (
  id uuid primary key default gen_random_uuid(),
  network text not null default 'testnet' check (network = 'testnet'),
  contract_id text not null check (contract_id ~ '^C[A-Z2-7]{55}$'),
  room_kind text not null check (room_kind in ('upfront','installments','scheduled')),
  room_id bigint not null check (room_id between 1 and 4294967295),
  host_wallet text not null check (host_wallet ~ '^G[A-Z2-7]{55}$'),
  room_name text not null check (length(room_name) between 1 and 120),
  revision integer not null check (revision between 1 and 2000000000),
  details jsonb not null check (jsonb_typeof(details) = 'object'),
  starts_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (network,contract_id,room_kind,room_id)
);
create table public.arisan_gathering_saves (
  actor_wallet text not null check (actor_wallet ~ '^G[A-Z2-7]{55}$'),
  mutation_id uuid not null,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (actor_wallet,mutation_id)
);
create table public.arisan_gathering_rsvps (
  gathering_id uuid not null references public.arisan_gatherings(id) on delete cascade,
  revision integer not null check (revision > 0),
  wallet text not null check (wallet ~ '^G[A-Z2-7]{55}$'),
  response text not null check (response in ('yes','no','maybe')),
  updated_at timestamptz not null default now(),
  primary key (gathering_id,revision,wallet)
);
create table public.arisan_member_notifications (
  id uuid primary key default gen_random_uuid(),
  network text not null default 'testnet' check (network = 'testnet'),
  contract_id text not null check (contract_id ~ '^C[A-Z2-7]{55}$'),
  room_kind text not null check (room_kind in ('upfront','installments','scheduled')),
  room_id bigint not null check (room_id between 1 and 4294967295),
  wallet text not null check (wallet ~ '^G[A-Z2-7]{55}$'),
  event_key text not null check (length(event_key) between 1 and 180),
  event_type text not null check (event_type in ('meeting_updated','meeting_day_before','meeting_hour_before','funding_complete','started','round_changed','completed','cancelled','funding_deadline_day_before','funding_deadline_hour_before','commit_deadline_hour_before','reveal_deadline_hour_before')),
  room_name text not null check (length(room_name) between 1 and 120),
  title text not null check (length(title) between 1 and 160),
  body text not null check (length(body) between 1 and 1200),
  gathering_revision integer,
  starts_at timestamptz,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (network,contract_id,room_kind,room_id,wallet,event_key)
);
create index arisan_member_notifications_wallet_idx on public.arisan_member_notifications(wallet,created_at desc,id);
create index arisan_member_notifications_unread_idx on public.arisan_member_notifications(wallet) where read_at is null;
create table public.arisan_gathering_reminders (
  id uuid primary key default gen_random_uuid(),
  gathering_id uuid not null references public.arisan_gatherings(id) on delete cascade,
  revision integer not null check (revision > 0),
  offset_seconds integer not null check (offset_seconds in (86400,3600)),
  due_at timestamptz not null,
  last_attempt_at timestamptz,
  processed_at timestamptz,
  cancelled boolean not null default false,
  unique (gathering_id,revision,offset_seconds)
);
create index arisan_gathering_reminders_due_idx on public.arisan_gathering_reminders(due_at) where processed_at is null and not cancelled;
create table public.arisan_room_notification_watches (
  network text not null default 'testnet' check (network = 'testnet'),
  contract_id text not null check (contract_id ~ '^C[A-Z2-7]{55}$'),
  room_kind text not null check (room_kind in ('upfront','installments','scheduled')),
  room_id bigint not null check (room_id between 1 and 4294967295),
  snapshot jsonb not null,
  last_checked_at timestamptz not null default now(),
  primary key (network,contract_id,room_kind,room_id)
);
create index arisan_room_notification_watches_check_idx on public.arisan_room_notification_watches(last_checked_at);

-- No browser Data API access, even for signed-in users. Server routes always
-- verify getUser + canonical saved wallet, and independently read the roster.
alter table public.arisan_gatherings enable row level security;
alter table public.arisan_gathering_saves enable row level security;
alter table public.arisan_gathering_rsvps enable row level security;
alter table public.arisan_member_notifications enable row level security;
alter table public.arisan_gathering_reminders enable row level security;
alter table public.arisan_room_notification_watches enable row level security;
revoke all on public.arisan_gatherings,public.arisan_gathering_saves,public.arisan_gathering_rsvps,public.arisan_member_notifications,public.arisan_gathering_reminders,public.arisan_room_notification_watches from public,anon,authenticated;
grant select,insert,update,delete on public.arisan_gatherings,public.arisan_gathering_saves,public.arisan_gathering_rsvps,public.arisan_member_notifications,public.arisan_gathering_reminders,public.arisan_room_notification_watches to service_role;

create function public.arisan_gathering_save(p_contract text,p_kind text,p_room bigint,p_host text,p_room_name text,p_members text[],p_expected_revision integer,p_mutation_id uuid,p_request_hash text,p_details jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare g public.arisan_gatherings; prior public.arisan_gathering_saves; result jsonb; notified integer := 0; start_time timestamptz;
begin
  if p_contract !~ '^C[A-Z2-7]{55}$' or p_kind not in ('upfront','installments','scheduled') or p_room not between 1 and 4294967295
    or p_host !~ '^G[A-Z2-7]{55}$' or cardinality(p_members) not between 1 and 20 or not (p_host = any(p_members))
    or exists (select 1 from unnest(p_members) m where m is null or m !~ '^G[A-Z2-7]{55}$')
    or cardinality(p_members) <> (select count(distinct m) from unnest(p_members) m) then raise exception 'Invalid verified room scope'; end if;
  -- Serialize this room before inspecting its revision. The mutation lock also
  -- protects retries reusing one UUID across two rooms from racing the receipt.
  perform pg_advisory_xact_lock(hashtextextended(p_host || ':' || p_mutation_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended(p_contract || ':' || p_kind || ':' || p_room::text,0));
  select * into prior from public.arisan_gathering_saves where actor_wallet=p_host and mutation_id=p_mutation_id;
  if found then
    if prior.request_hash <> p_request_hash then raise exception using errcode='22023',message='Mutation ID already used for different details'; end if;
    return prior.result;
  end if;
  select * into g from public.arisan_gatherings where network='testnet' and contract_id=p_contract and room_kind=p_kind and room_id=p_room for update;
  if coalesce(g.revision,0) <> p_expected_revision then raise exception using errcode='40001',message='Meeting changed. Refresh before saving'; end if;
  if g.id is not null and g.host_wallet <> p_host then raise exception 'Host changed. Refresh the room'; end if;
  if g.id is not null and g.details = p_details then
    result := jsonb_build_object('gathering',jsonb_build_object('id',g.id,'contractId',g.contract_id,'kind',g.room_kind,'roomId',g.room_id,'revision',g.revision,'updatedAt',g.updated_at)||g.details,'notifiedMembers',0);
    insert into public.arisan_gathering_saves values(p_host,p_mutation_id,p_request_hash,result,now());
    return result;
  end if;
  if g.id is not null and g.updated_at > now()-interval '30 seconds' then raise exception using errcode='P0001',message='Wait 30 seconds between meeting updates'; end if;
  start_time := nullif(p_details->>'startsAt','')::timestamptz;
  if start_time is not null and (start_time <= now() or start_time > now()+interval '366 days') then raise exception 'Invalid future meeting time'; end if;
  insert into public.arisan_gatherings(contract_id,room_kind,room_id,host_wallet,room_name,revision,details,starts_at)
    values(p_contract,p_kind,p_room,p_host,p_room_name,1,p_details,start_time)
    on conflict(network,contract_id,room_kind,room_id) do update set revision=public.arisan_gatherings.revision+1,details=excluded.details,starts_at=excluded.starts_at,room_name=excluded.room_name,updated_at=now()
    returning * into g;
  update public.arisan_gathering_reminders set cancelled=true where gathering_id=g.id and processed_at is null;
  if start_time is not null then
    insert into public.arisan_gathering_reminders(gathering_id,revision,offset_seconds,due_at)
      select g.id,g.revision,n,start_time-make_interval(secs=>n) from unnest(array[86400,3600]) n where start_time-make_interval(secs=>n)>now();
  end if;
  insert into public.arisan_member_notifications(contract_id,room_kind,room_id,wallet,event_key,event_type,room_name,title,body,gathering_revision,starts_at)
    select p_contract,p_kind,p_room,m,'meeting:'||g.revision::text,'meeting_updated',p_room_name,'Meeting details updated',
      'Your host updated the optional meeting for '||p_room_name||'. Open the room to review the latest details. This does not change funding or payout rules.',g.revision,g.starts_at from unnest(p_members) m
    on conflict(network,contract_id,room_kind,room_id,wallet,event_key) do nothing;
  get diagnostics notified = row_count;
  result := jsonb_build_object('gathering',jsonb_build_object('id',g.id,'contractId',g.contract_id,'kind',g.room_kind,'roomId',g.room_id,'revision',g.revision,'updatedAt',g.updated_at)||g.details,'notifiedMembers',notified);
  insert into public.arisan_gathering_saves values(p_host,p_mutation_id,p_request_hash,result,now());
  return result;
end $$;

create function public.arisan_gathering_rsvp(p_gathering uuid,p_revision integer,p_wallet text,p_response text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare g public.arisan_gatherings;
begin
  select * into g from public.arisan_gatherings where id=p_gathering for update;
  if g.id is null or g.revision<>p_revision or g.starts_at is null or g.starts_at<=now() then raise exception using errcode='40001',message='Meeting changed or has no future time. Refresh the room'; end if;
  insert into public.arisan_gathering_rsvps(gathering_id,revision,wallet,response) values(g.id,g.revision,p_wallet,p_response)
    on conflict(gathering_id,revision,wallet) do update set response=excluded.response,updated_at=now();
  return true;
end $$;

create function public.arisan_gathering_reminder_enqueue(p_job uuid,p_contract text,p_kind text,p_room bigint,p_members text[])
returns integer language plpgsql security invoker set search_path = '' as $$
declare j public.arisan_gathering_reminders; g public.arisan_gatherings; n integer := 0;
begin
  select * into j from public.arisan_gathering_reminders where id=p_job;
  if j.id is null then return 0; end if;
  -- Same lock order as host save: gathering, then its jobs. Concurrent workers
  -- cannot send an old revision after an edit commits or process one job twice.
  select * into g from public.arisan_gatherings where id=j.gathering_id for update;
  select * into j from public.arisan_gathering_reminders where id=p_job for update;
  if j.cancelled or j.processed_at is not null or j.due_at>now() or g.revision<>j.revision or g.starts_at is null or g.starts_at<=now()
    or g.contract_id<>p_contract or g.room_kind<>p_kind or g.room_id<>p_room then return 0; end if;
  if cardinality(p_members) not between 1 and 20 or exists(select 1 from unnest(p_members) m where m is null or m !~ '^G[A-Z2-7]{55}$') then raise exception 'Invalid verified members'; end if;
  insert into public.arisan_member_notifications(contract_id,room_kind,room_id,wallet,event_key,event_type,room_name,title,body,gathering_revision,starts_at)
    select g.contract_id,g.room_kind,g.room_id,m,'meeting:'||g.revision::text||':reminder:'||j.offset_seconds::text,
      case when j.offset_seconds=86400 then 'meeting_day_before' else 'meeting_hour_before' end,g.room_name,'Upcoming group meeting',
      'Your group meeting is coming up. Open '||g.room_name||' to review its latest time, location or online link. Attendance does not authorize payments.',g.revision,g.starts_at from unnest(p_members) m
    on conflict(network,contract_id,room_kind,room_id,wallet,event_key) do nothing;
  get diagnostics n = row_count;
  update public.arisan_gathering_reminders set processed_at=now() where id=j.id;
  return n;
end $$;

create function public.arisan_gathering_due_reminders(p_limit integer default 20)
returns setof jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('id',j.id,'contract_id',g.contract_id,'room_kind',g.room_kind,'room_id',g.room_id,'revision',j.revision)
  from public.arisan_gathering_reminders j join public.arisan_gatherings g on g.id=j.gathering_id
  where j.processed_at is null and not j.cancelled and j.due_at<=now() and g.starts_at>now() and g.revision=j.revision
  order by j.last_attempt_at nulls first,j.due_at,j.id limit greatest(1,least(p_limit,20));
$$;

create function public.arisan_room_watch_sync(p_contract text,p_kind text,p_room bigint,p_members text[],p_snapshot jsonb,p_events jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare e jsonb; n integer := 0; added integer;
begin
  if p_contract !~ '^C[A-Z2-7]{55}$' or p_kind not in ('upfront','installments','scheduled') or p_room not between 1 and 4294967295
    or cardinality(p_members) not between 1 and 20 or exists(select 1 from unnest(p_members) m where m is null or m !~ '^G[A-Z2-7]{55}$')
    or jsonb_typeof(p_snapshot)<>'object' or jsonb_typeof(p_events)<>'array' or jsonb_array_length(p_events)>4 then raise exception 'Invalid verified room snapshot'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_contract||':'||p_kind||':'||p_room::text,0));
  insert into public.arisan_room_notification_watches(contract_id,room_kind,room_id,snapshot)
    values(p_contract,p_kind,p_room,p_snapshot) on conflict(network,contract_id,room_kind,room_id) do update set snapshot=excluded.snapshot,last_checked_at=now();
  for e in select value from jsonb_array_elements(p_events) loop
    insert into public.arisan_member_notifications(contract_id,room_kind,room_id,wallet,event_key,event_type,room_name,title,body)
      select p_contract,p_kind,p_room,m,e->>'key',e->>'type',p_snapshot->>'name',e->>'title',e->>'body' from unnest(p_members) m
      on conflict(network,contract_id,room_kind,room_id,wallet,event_key) do nothing;
    get diagnostics added = row_count;
    n := n+added;
  end loop;
  return n;
end $$;

revoke all on function public.arisan_gathering_save(text,text,bigint,text,text,text[],integer,uuid,text,jsonb),public.arisan_gathering_rsvp(uuid,integer,text,text),public.arisan_gathering_reminder_enqueue(uuid,text,text,bigint,text[]),public.arisan_gathering_due_reminders(integer),public.arisan_room_watch_sync(text,text,bigint,text[],jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.arisan_gathering_save(text,text,bigint,text,text,text[],integer,uuid,text,jsonb),public.arisan_gathering_rsvp(uuid,integer,text,text),public.arisan_gathering_reminder_enqueue(uuid,text,text,bigint,text[]),public.arisan_gathering_due_reminders(integer),public.arisan_room_watch_sync(text,text,bigint,text[],jsonb,jsonb) to service_role;
commit;
