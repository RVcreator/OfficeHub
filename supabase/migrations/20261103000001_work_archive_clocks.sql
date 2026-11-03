begin;
alter table public.approvals add column if not exists archive_ready_at timestamptz;
alter table public.decisions add column if not exists archive_ready_at timestamptz;

create or replace function officehub_private.archive_timestamp(value text) returns timestamptz
language plpgsql immutable set search_path=pg_catalog as $$
begin
 if value ~ '^\d{4}-\d{2}-\d{2}$' then return value::date::timestamp at time zone 'Africa/Dar_es_Salaam';end if;
 if value ~ '^\d{4}-\d{2}-\d{2}[T ][0-9:.]+([Zz]|[+-][0-9:]+)$' then return value::timestamptz;end if;
 return null;
exception when others then return null;
end$$;

-- Preserve recorded historical dates. Missing/unusable dates start a conservative
-- new clock now; they must not make a record disappear based on its creation age.
update public.approvals set archive_ready_at=least(coalesce(officehub_private.archive_timestamp(approved_date),now()),now())
 where status='Approved' and archive_ready_at is null;
update public.decisions set archive_ready_at=least(coalesce(officehub_private.archive_timestamp(date),now()),now())
 where status in ('Approved','Adopted','Implemented') and archive_ready_at is null;
update public.notice_acknowledgements set acknowledged_at=now()::text
 where officehub_private.archive_timestamp(acknowledged_at) is null;

create or replace function public.officehub_work_archive_clock() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare ready boolean;
begin
 ready:=case when tg_table_name='approvals' then new.status='Approved'
             else new.status in ('Approved','Adopted','Implemented') end;
 if not coalesce(ready,false) then new.archive_ready_at:=null;
 elsif tg_op='INSERT' then new.archive_ready_at:=clock_timestamp();
 elsif new.status is distinct from old.status then new.archive_ready_at:=clock_timestamp();
 else new.archive_ready_at:=coalesce(old.archive_ready_at,clock_timestamp());end if;
 return new;
end$$;
drop trigger if exists officehub_work_archive_clock on public.approvals;
create trigger officehub_work_archive_clock before insert or update on public.approvals
 for each row execute function public.officehub_work_archive_clock();
drop trigger if exists officehub_work_archive_clock on public.decisions;
create trigger officehub_work_archive_clock before insert or update on public.decisions
 for each row execute function public.officehub_work_archive_clock();

create or replace function public.officehub_notice_ack_clock() returns trigger
language plpgsql set search_path=pg_catalog as $$
begin
 new.acknowledged_at:=clock_timestamp()::text;
 return new;
end$$;
drop trigger if exists officehub_notice_ack_clock on public.notice_acknowledgements;
create trigger officehub_notice_ack_clock before insert on public.notice_acknowledgements
 for each row execute function public.officehub_notice_ack_clock();
revoke all on function officehub_private.archive_timestamp(text),public.officehub_work_archive_clock(),public.officehub_notice_ack_clock() from public,anon,authenticated;

-- Filter before pagination, so archived notices cannot crowd active ones out.
-- SECURITY INVOKER preserves the caller's existing notice and acknowledgement RLS.
create or replace function public.officehub_active_notices() returns setof public.notices
language sql stable security invoker set search_path=pg_catalog,public as $$
 select n.* from public.notices n where not exists (
  select 1 from public.notice_acknowledgements a where a.notice_id=n.id and a.user_id=auth.uid()
   and (case when a.acknowledged_at ~ '^\d{4}-\d{2}-\d{2}$'
         then a.acknowledged_at::date::timestamp at time zone 'Africa/Dar_es_Salaam'
         else a.acknowledged_at::timestamptz end)<=now()-interval '14 days'
 )
$$;
revoke all on function public.officehub_active_notices() from public,anon;
grant execute on function public.officehub_active_notices() to authenticated;
commit;
