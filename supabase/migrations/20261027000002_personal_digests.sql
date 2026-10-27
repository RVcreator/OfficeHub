-- Personal planning digests. No historical sends; enable only after validation.
begin;
alter table public.officehub_email_outbox add column digest_payload jsonb;
create unique index officehub_digest_recipient_period on public.officehub_email_outbox(event_key,recipient_id)
 where event_type in ('digest_week','digest_month');
create table officehub_private.digest_settings (
 id boolean primary key default true check(id), enabled boolean not null default false
);
alter table officehub_private.digest_settings enable row level security;
revoke all on officehub_private.digest_settings from public,anon,authenticated;
insert into officehub_private.digest_settings(id) values(true);

create function officehub_private.digest_date(v text) returns date
language plpgsql immutable set search_path='' as $$
begin
 if v is null or v !~ '^\d{4}-\d{2}-\d{2}$' then return null; end if;
 return v::date;
exception when datetime_field_overflow or invalid_datetime_format then return null;
end $$;

create function officehub_private.personal_digest(p_user uuid,p_kind text,p_start date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p_end date; result jsonb;
begin
 if p_kind not in ('week','month') or p_start is null then raise exception 'Invalid digest period'; end if;
 p_end := case when p_kind='week' then p_start+7 else (p_start+interval '1 month')::date end;
 with mine as (
  select t.*,officehub_private.digest_date(t.due_date) as due
  from public.tasks t where lower(t.status) not in ('done','completed','cancelled','canceled')
   and (p_user in (select * from officehub_private.task_recipients(to_jsonb(t)))
    or exists(select 1 from public.task_assignees a where a.task_id=t.id and a.user_id=p_user)
    or (t.assignment_type='personal' and t.created_by_id=p_user))
 ), task_rows as (
  select jsonb_build_object('id',id,'title',title,'date',due,'status',status,'priority',priority,
   'overdue',coalesce(due<p_start,false)) as item,due,title,id from mine where due<p_end or due is null
 ), meeting_rows as (
  select jsonb_build_object('id',m.id,'title',m.title,'date',officehub_private.digest_date(m.date),
   'time',coalesce(nullif(m.time,''),m.start_time),'endTime',m.end_time,'type',m.meeting_type) as item,m.date,m.start_time,m.id
  from public.meetings m where lower(m.status) not in ('completed','cancelled','canceled')
   and officehub_private.digest_date(m.date)>=p_start and officehub_private.digest_date(m.date)<p_end
   and (m.organizer_id=p_user or m.chair_id=p_user or exists(select 1 from public.meeting_attendees a
     where a.meeting_id=m.id and a.user_id=p_user and lower(a.status)<>'declined'))
 ), project_rows as (
  select jsonb_build_object('id',p.id,'title',p.title,'date',officehub_private.digest_date(p.target_date),
   'status',p.status,'progress',coalesce(p.progress,0),'overdue',coalesce(officehub_private.digest_date(p.target_date)<p_start,false)) as item,p.target_date,p.title,p.id
  from public.projects p where lower(p.status) not in ('completed','cancelled','canceled','archived')
   and (officehub_private.digest_date(p.start_date) is null or officehub_private.digest_date(p.start_date)<p_end)
   and (p.leader_id=p_user or exists(select 1 from public.project_members pm where pm.project_id=p.id and pm.user_id=p_user)
    or exists(select 1 from mine t where t.project_id=p.id))
 ) select jsonb_build_object('version',1,'kind',p_kind,'start',p_start,'end',p_end-1,'timezone','Africa/Dar_es_Salaam',
   'tasks',coalesce((select jsonb_agg(item order by due nulls last,title,id) from task_rows),'[]'::jsonb),
   'meetings',coalesce((select jsonb_agg(item order by date,start_time,id) from meeting_rows),'[]'::jsonb),
   'projects',coalesce((select jsonb_agg(item order by target_date nulls last,title,id) from project_rows),'[]'::jsonb)) into result;
 return result;
end $$;

create function officehub_private.enqueue_personal_digests(p_kind text,p_now timestamptz default now())
returns integer language plpgsql security definer set search_path='' as $$
declare local_now timestamp:=p_now at time zone 'Africa/Dar_es_Salaam'; start_day date; inserted integer;
begin
 if p_kind not in ('week','month') then raise exception 'Invalid digest kind'; end if;
 if not (select enabled from officehub_private.digest_settings where id)
   or not (select capture_enabled from officehub_private.email_settings where id) then return 0; end if;
 if local_now::time < time '08:00' then return 0; end if;
 if p_kind='week' and extract(isodow from local_now)<>1 then return 0; end if;
 if p_kind='month' and extract(day from local_now)<>1 then return 0; end if;
 start_day:=local_now::date;
 insert into public.officehub_email_outbox(event_key,event_type,entity_id,recipient_id,recipient_email,recipient_name,subject,body_text,digest_payload)
 select 'digest:'||p_kind||':'||start_day,'digest_'||p_kind,start_day::text,p.id,lower(trim(u.email)),p.name,
  '[OfficeHub] Your '||case when p_kind='week' then 'week ahead' else 'month ahead' end||' | '||to_char(start_day,'DD Mon YYYY'),
  'Your personal OfficeHub planning summary. Dates and times use Tanzania time. Open OfficeHub for the latest details.',
  officehub_private.personal_digest(p.id,p_kind,start_day)
 from public.profiles p join auth.users u on u.id=p.id
 where u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<now())
  and coalesce(p.app_metadata->>'deactivated','false')<>'true'
  and coalesce(to_jsonb(p)->>'deactivated','false')<>'true'
  and lower(trim(u.email)) ~ '^[^[:space:]@]+@wipahs[.]org$'
 on conflict do nothing;
 get diagnostics inserted=row_count; return inserted;
end $$;

-- Preserve all existing domain-event eligibility, including document sharing.
alter function officehub_private.email_recipient_is_current(text,text,uuid) rename to email_event_recipient_is_current;
create function officehub_private.email_recipient_is_current(p_type text,p_entity text,p_recipient uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select case when p_type in ('digest_week','digest_month') then
  (select enabled from officehub_private.digest_settings where id)
  and officehub_private.digest_date(p_entity) is not null
  and (officehub_private.digest_date(p_entity)+case when p_type='digest_week' then interval '7 days' else interval '1 month' end)::date > (now() at time zone 'Africa/Dar_es_Salaam')::date
  and exists(select 1 from public.profiles p where p.id=p_recipient and coalesce(p.app_metadata->>'deactivated','false')<>'true')
 else officehub_private.email_event_recipient_is_current(p_type,p_entity,p_recipient) end;
$$;
revoke all on function officehub_private.digest_date(text) from public,anon,authenticated;
revoke all on function officehub_private.personal_digest(uuid,text,date) from public,anon,authenticated;
revoke all on function officehub_private.enqueue_personal_digests(text,timestamptz) from public,anon,authenticated;
revoke all on function officehub_private.email_recipient_is_current(text,text,uuid) from public,anon,authenticated;
-- Refresh each digest at claim time so removed assignments are not included.
create or replace function public.officehub_email_claim() returns setof public.officehub_email_outbox
language plpgsql security definer set search_path = '' as $$
begin
  if not (select delivery_enabled from officehub_private.email_settings where id) then return; end if;
  update public.officehub_email_outbox set status='review',last_error='Send outcome unknown; inspect Exchange before retrying',lease_until=null
    where status='sending' and lease_until<now();
  update public.officehub_email_outbox set status=case when attempts>=6 then 'failed' else 'retry' end,
    available_at=now(),lease_until=null where status='processing' and lease_until<now();
  update public.officehub_email_outbox q set status='cancelled',last_error='Recipient is no longer eligible for this event'
    where q.status in ('queued','retry') and not officehub_private.email_recipient_is_current(q.event_type,q.entity_id,q.recipient_id);
  return query with candidate as (
    select q.id from public.officehub_email_outbox q
    cross join officehub_private.email_settings s
    join auth.users u on u.id=q.recipient_id
    join public.profiles p on p.id=q.recipient_id
    where q.status in ('queued','retry') and q.available_at<=now() and q.attempts<6
      and lower(trim(u.email))=q.recipient_email and u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until<now())
      and coalesce(to_jsonb(p)->>'deactivated','false')<>'true'
      and (cardinality(s.allowed_recipient_emails)=0 or q.recipient_email=any(s.allowed_recipient_emails))
    order by q.available_at,q.created_at for update of q skip locked limit 1
  ) update public.officehub_email_outbox q set status='processing',attempts=q.attempts+1,
    digest_payload=case when q.event_type in ('digest_week','digest_month')
      then officehub_private.personal_digest(q.recipient_id,case when q.event_type='digest_week' then 'week' else 'month' end,officehub_private.digest_date(q.entity_id))
      else q.digest_payload end,
    lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes'
    from candidate c where q.id=c.id returning q.*;
end $$;

commit;
