-- Stage only: preserves meeting IDs, attendees, data and all existing permission guards.
begin;
create function officehub_private.meeting_next_end_at(m public.meetings, reference_time timestamptz default now()) returns timestamptz
language plpgsql stable set search_path='' as $$
declare anchor date;candidate date;occurrence public.meetings;finish timestamptz;
begin
 if coalesce(m.recurrence,'None') not in ('Daily','Weekly','Monthly') or m.status in ('Cancelled','Completed') then return officehub_private.meeting_end_at(m);end if;
 if officehub_private.meeting_end_at(m) is null then return null;end if;
 anchor:=m.date::date;
 for candidate in select d::date from generate_series(greatest(anchor,(reference_time at time zone 'Africa/Dar_es_Salaam')::date-1)::timestamp,
  greatest(anchor,(reference_time at time zone 'Africa/Dar_es_Salaam')::date)::timestamp+interval '366 days',interval '1 day') d loop
  if m.recurrence='Daily' or (m.recurrence='Weekly' and (candidate-anchor)%7=0) or (m.recurrence='Monthly' and extract(day from candidate)=extract(day from anchor)) then
   occurrence:=m;occurrence.date:=candidate::text;finish:=officehub_private.meeting_end_at(occurrence);
   if finish>reference_time then return finish;end if;
  end if;
 end loop;
 return null;
end$$;
revoke all on function officehub_private.meeting_next_end_at(public.meetings,timestamptz) from public,anon,authenticated;


create or replace function public.officehub_meeting_response_deadline() returns trigger language plpgsql security definer set search_path='' as $$
declare m public.meetings;k text;deadline timestamptz;
begin
 if coalesce(auth.role(),'')<>'authenticated' then if TG_OP='DELETE' then return old;else return new;end if;end if;
 if TG_OP='DELETE' then k:=old.meeting_id;else k:=new.meeting_id;end if;
 select * into m from public.meetings where id=k;
 -- Parent deletion/cascade remains governed by its existing permission checks.
 if not found then if TG_OP='DELETE' then return old;else return new;end if;end if;
 if not officehub_private.meeting_member(k,auth.uid()) then if TG_OP='DELETE' then return old;else return new;end if;end if;
 deadline:=officehub_private.meeting_next_end_at(m);
 if deadline is null or clock_timestamp()>=deadline or m.status in ('Cancelled','Completed') then
  if TG_OP<>'UPDATE' or to_jsonb(new) is distinct from to_jsonb(old) then raise exception 'This meeting is dormant. Its response window has closed.' using errcode='42501';end if;
 end if;
 if TG_OP='DELETE' then return old;else return new;end if;
end$$;

create or replace function public.officehub_dormant_meeting_schedule() returns trigger language plpgsql security definer set search_path='' as $$
declare deadline timestamptz;
begin
 if coalesce(auth.role(),'')<>'authenticated' then return new;end if;
 deadline:=officehub_private.meeting_next_end_at(old);
 if coalesce(old.recurrence,'None') in ('Daily','Weekly','Monthly') and coalesce(new.recurrence,'None')='None'
  and officehub_private.meeting_end_at(new)<=clock_timestamp() then
  raise exception 'Choose a future date to change this series to a single meeting, or cancel the series.' using errcode='23514';
 end if;
 if ((deadline is not null and clock_timestamp()>=deadline) or old.status in ('Cancelled','Completed')) and
  (new.date,new.time,new.start_time,new.end_time,new.duration_minutes,new.recurrence) is distinct from (old.date,old.time,old.start_time,old.end_time,old.duration_minutes,old.recurrence) then
  raise exception 'Past meetings are dormant. Create a new meeting to schedule another allocation.' using errcode='42501';
 end if;return new;
end$$;

create or replace function officehub_private.email_meeting_event() returns trigger
language plpgsql security definer set search_path='' as $$begin return new;end$$;


create or replace function officehub_private.email_attendee_event() returns trigger
language plpgsql security definer set search_path = '' as $$
declare m public.meetings; k text;
begin
  select * into m from public.meetings where id=new.meeting_id;
  if tg_op='INSERT' then return new;end if;
  if (new.status,new.proposed_date,new.proposed_time,new.proposed_end_time)
      is distinct from (old.status,old.proposed_date,old.proposed_time,old.proposed_end_time)
      and new.user_id is distinct from m.organizer_id then
    k:='meeting-rsvp:'||m.id||':'||new.user_id||':'||txid_current()||':'||md5(jsonb_build_array(new.status,new.proposed_date,new.proposed_time,new.proposed_end_time)::text);
    perform officehub_private.enqueue_email(k,'meeting_rsvp',m.id,m.organizer_id,
      '[OfficeHub] Meeting response: '||m.title,
      coalesce((select p.name from public.profiles p where p.id=new.user_id),'An attendee')||' has updated their response for "'||m.title||'" to '||coalesce(new.status,'Pending')||'. Sign in to OfficeHub to review it.');
  end if;
  return new;
end $$;

create or replace function officehub_private.enqueue_physical_calendar(m public.meetings,recipient uuid,method text,event_key text) returns void
language plpgsql security definer set search_path='' as $$
declare sequence_number bigint;payload jsonb;previous_invitation jsonb;
begin
 if method not in ('REQUEST','CANCEL') then return;end if;
 if method='CANCEL' then
  select q.calendar_payload into previous_invitation from public.officehub_email_outbox q
   where q.entity_id=m.id and q.recipient_id=recipient and q.event_type='physical_calendar_request'
    and q.status in ('accepted','sending','review') and q.calendar_payload is not null
   order by (q.calendar_payload->>'sequence')::bigint desc limit 1;
 end if;
 update public.officehub_email_outbox q set status='cancelled',last_error='Superseded by a newer calendar event',lease_until=null
  where q.entity_id=m.id and q.recipient_id=recipient and q.event_type in ('physical_calendar_request','physical_calendar_cancel') and q.status in ('queued','retry','processing');
 if method='CANCEL' and (previous_invitation is null or ((previous_invitation->>'end')::timestamptz<=now() and coalesce(previous_invitation->>'recurrence','None')='None')) then return;end if;
 if method='REQUEST' and (officehub_private.meeting_start_at(m) is null or officehub_private.meeting_next_end_at(m)<=now()) then return;end if;
 sequence_number:=nextval('officehub_private.calendar_event_seq');
 payload:=jsonb_build_object('version',1,'id',m.id,'title',left(m.title,240),'description',left(coalesce(m.description,'')||E'\nOrganized in OfficeHub by '||coalesce(m.organizer_name,'OfficeHub'),12000),
  'location',left(coalesce(m.location,''),512),'start',officehub_private.meeting_start_at(m),'end',officehub_private.meeting_end_at(m),
  'recurrence',coalesce(m.recurrence,'None'),'sequence',sequence_number,'method',method,'organizerName',m.organizer_name);
 if method='CANCEL' then payload:=previous_invitation||jsonb_build_object('recurrence',coalesce(m.recurrence,'None'),'sequence',sequence_number,'method','CANCEL','description','Meeting cancelled in OfficeHub.','location','');end if;
 perform officehub_private.enqueue_email(event_key,case when method='CANCEL' then 'physical_calendar_cancel' else 'physical_calendar_request' end,m.id,recipient,
  '[OfficeHub] Physical meeting '||case when method='CANCEL' then 'cancelled: ' else 'invitation: ' end||(payload->>'title'),
  case when method='CANCEL' then 'This physical meeting invitation has been cancelled in OfficeHub.' else 'Physical meeting: '||m.title||E'\nVenue: '||coalesce(m.location,'')||E'\nWhen: '||m.date||' '||coalesce(m.start_time,m.time,'')||' – '||coalesce(m.end_time,'')||E' EAT.\nRepeats: '||coalesce(m.recurrence,'None')||E'.\nThis Outlook calendar invitation contains no Teams link.' end);
 update public.officehub_email_outbox q set calendar_payload=payload where q.event_key=enqueue_physical_calendar.event_key and q.recipient_id=recipient;
end$$;

create or replace function public.officehub_physical_calendar_event() returns trigger
language plpgsql security definer set search_path='' as $$
declare m public.meetings;r uuid;k text;method text;
begin
 if tg_op='DELETE' then m:=old;else m:=new;end if;
 if m.meeting_type<>'In-Person Boardroom' and not(tg_op='UPDATE' and old.meeting_type='In-Person Boardroom') then return coalesce(new,old);end if;
 if tg_op='UPDATE' and (new.title,new.description,new.date,new.time,new.start_time,new.end_time,new.duration_minutes,new.location,new.status,new.meeting_type,new.recurrence)
   is not distinct from (old.title,old.description,old.date,old.time,old.start_time,old.end_time,old.duration_minutes,old.location,old.status,old.meeting_type,old.recurrence) then return new;end if;
 method:=case when tg_op='DELETE' or m.status in ('Cancelled','Completed') or m.meeting_type<>'In-Person Boardroom' then 'CANCEL' else 'REQUEST' end;
 if tg_op='UPDATE' and old.meeting_type='In-Person Boardroom' and new.meeting_type<>'In-Person Boardroom' then m:=old;end if;
 k:='physical-meeting:'||m.id||':'||nextval('officehub_private.calendar_event_seq');
 for r in select user_id from public.meeting_attendees where meeting_id=m.id and status<>'Declined' union select m.organizer_id loop
  perform officehub_private.enqueue_physical_calendar(m,r,method,k);
 end loop;return coalesce(new,old);
end$$;

create or replace function officehub_private.email_recipient_is_current(p_type text,p_entity text,p_recipient uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select case when p_type='physical_calendar_cancel' then exists(select 1 from public.profiles where id=p_recipient)
 when p_type='physical_calendar_request' then exists(select 1 from public.meetings m where m.id=p_entity and m.meeting_type='In-Person Boardroom' and m.status not in ('Cancelled','Completed')
  and officehub_private.meeting_next_end_at(m)>now() and (m.organizer_id=p_recipient or exists(select 1 from public.meeting_attendees a where a.meeting_id=m.id and a.user_id=p_recipient and a.status<>'Declined')))
 else officehub_private.email_recipient_before_physical_calendar(p_type,p_entity,p_recipient) end
$$;

create or replace function public.officehub_save_meeting(p_id text,p_changes jsonb,p_attendees jsonb default null,p_create boolean default false)returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;m public.meetings;begin
 if p_changes ? 'recurrence' and coalesce(p_changes->>'recurrence','None') not in ('None','Daily','Weekly','Monthly') then
  raise exception 'Choose a supported meeting recurrence.' using errcode='23514';end if;
 if p_changes ?| array['teams_join_url','teams_meeting_id','teams_passcode','microsoft_sync_status','microsoft_sync_error'] then
  raise exception 'Microsoft meeting links and sync state are managed by the server' using errcode='42501';end if;
 if not p_create and p_changes ? 'chair_id' and p_attendees is null then
  select coalesce(jsonb_agg(jsonb_build_object('user_id',user_id)),'[]') into p_attendees from public.meeting_attendees where meeting_id=p_id;
 end if;
 result:=officehub_private.save_meeting_before_teams(p_id,p_changes,p_attendees,p_create);
 select * into m from public.meetings where id=p_id;
 if m.meeting_type<>'In-Person Boardroom' and not exists(select 1 from officehub_private.teams_sync_jobs where meeting_id=p_id) then perform officehub_private.queue_teams_sync(m);end if;
 return jsonb_build_object('meeting',(select to_jsonb(x) from public.meetings x where id=p_id),'attendees',result->'attendees');
end $$;

create or replace function public.officehub_claim_teams_sync(p_meeting text default null)returns jsonb language plpgsql security definer set search_path='' as $$
declare j officehub_private.teams_sync_jobs;m public.meetings;payload jsonb;begin
 select * into j from officehub_private.teams_sync_jobs where (p_meeting is null or meeting_id=p_meeting) and status in('pending','retry') and next_attempt<=now()
 and (lease_until is null or lease_until<now()) order by next_attempt,meeting_id for update skip locked limit 1;
 if not found then return null;end if;
 update officehub_private.teams_sync_jobs set lease_token=gen_random_uuid(),lease_until=now()+interval '3 minutes',attempts=attempts+1 where meeting_id=j.meeting_id returning * into j;
 if j.cancelled then payload:=jsonb_build_object('cancelled',true,'organizer_email',j.organizer_email);
 else
  select * into m from public.meetings where id=j.meeting_id;
  payload:=jsonb_build_object('cancelled',false,'title',m.title,'description',coalesce(m.description,''),'recurrence',coalesce(m.recurrence,'None'),'start',officehub_private.meeting_start_at(m),'end',officehub_private.meeting_end_at(m),
   'organizer_email',j.organizer_email,'chair_email',(select lower(u.email) from auth.users u where u.id=m.chair_id and u.email_confirmed_at is not null and u.deleted_at is null),
   'attendees',(select coalesce(jsonb_agg(jsonb_build_object('email',case when u.email_confirmed_at is not null and u.deleted_at is null and coalesce(p.app_metadata->>'deactivated','false')<>'true' then lower(u.email) end,'name',p.name) order by a.user_id),'[]') from public.meeting_attendees a join public.profiles p on p.id=a.user_id left join auth.users u on u.id=a.user_id where a.meeting_id=m.id));
 end if;
 return to_jsonb(j)||jsonb_build_object('payload',payload);
end $$;

create or replace function officehub_private.personal_digest(p_user uuid,p_kind text,p_start date)
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
  select jsonb_build_object('id',m.id,'title',m.title,'date',occurrence.day::date,'recurrence',coalesce(m.recurrence,'None'),
   'time',coalesce(nullif(m.time,''),m.start_time),'endTime',m.end_time,'type',m.meeting_type) as item,occurrence.day::date as date,m.start_time,m.id
  from public.meetings m cross join generate_series(p_start::timestamp,(p_end-1)::timestamp,interval '1 day') occurrence(day) where lower(m.status) not in ('completed','cancelled','canceled')
   and officehub_private.digest_date(m.date)<=occurrence.day::date
   and (officehub_private.digest_date(m.date)=occurrence.day::date or m.recurrence='Daily'
    or (m.recurrence='Weekly' and (occurrence.day::date-officehub_private.digest_date(m.date))%7=0)
    or (m.recurrence='Monthly' and extract(day from occurrence.day)=extract(day from officehub_private.digest_date(m.date))))
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

-- Cancel only redundant unsent Teams messages; accepted/review/sending history stays intact.
update public.officehub_email_outbox q set status='cancelled',last_error='Calendar invitation owns meeting delivery',lease_until=null
where q.status in ('queued','retry','processing') and q.event_type in ('meeting','meeting_invite')
and exists(select 1 from public.meetings m where m.id=q.entity_id and m.meeting_type<>'In-Person Boardroom');
-- Existing active physical series need one corrected invitation with the same UID.
-- This is staged with the migration, never run against production during testing.
do $$declare m public.meetings;r uuid;begin
 for m in select * from public.meetings where recurrence in ('Daily','Weekly','Monthly') and status not in ('Cancelled','Completed') loop
  if m.meeting_type='In-Person Boardroom' then
   for r in select user_id from public.meeting_attendees where meeting_id=m.id and status<>'Declined' union select m.organizer_id loop
    perform officehub_private.enqueue_physical_calendar(m,r,'REQUEST','recurrence-repair-v1:'||m.id);
   end loop;
  else perform officehub_private.queue_teams_sync(m);
  end if;
 end loop;
end$$;
notify pgrst,'reload schema';
commit;
