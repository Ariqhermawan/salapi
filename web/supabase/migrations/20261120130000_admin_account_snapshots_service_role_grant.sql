-- New tables in this project no longer get DML grants for service_role by
-- default, so the snapshot cron's upsert was refused. The table stays
-- server-only: anon/authenticated keep no access and RLS has no policies.
grant select, insert, update on public.admin_account_snapshots to service_role;
