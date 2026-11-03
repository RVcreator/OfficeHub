begin;
alter table public.meetings add column if not exists location text;
alter table public.officehub_email_outbox add column if not exists calendar_payload jsonb;
create sequence if not exists officehub_private.calendar_event_seq;
create or replace function officehub_private.meeting_start_at(m public.meetings) returns timestamptz
language plpgsql immutable set search_path='' as $$
declare seconds integer:=coalesce(officehub_private.meeting_clock_seconds(m.start_time),officehub_private.meeting_clock_seconds(m.time));
begin
 if m.date !~ '^\d{4}-\d{2}-\d{2}$' or seconds is null then return null;end if;
 return (m.date::date::timestamp+make_interval(secs=>seconds)) at time zone 'Africa/Dar_es_Salaam';
exception when others then return null;end$$;
create or replace function public.officehub_physical_meeting_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.meeting_type='In-Person Boardroom' then
  new.teams_join_url:=null;new.teams_meeting_id:=null;new.teams_passcode:=null;
  new.location:=nullif(btrim(new.location),'');
  if new.location is null then raise exception 'A physical meeting venue is required' using errcode='23514';end if;
  if officehub_private.meeting_start_at(new) is null or officehub_private.meeting_end_at(new) is null
    or officehub_private.meeting_end_at(new)<=officehub_private.meeting_start_at(new) then
   raise exception 'Valid physical meeting start and end times are required' using errcode='23514';end if;
 end if;return new;
end$$;
create trigger officehub_physical_meeting_guard before insert or update on public.meetings
 for each row execute function public.officehub_physical_meeting_guard();
create or replace function public.officehub_save_meeting(p_id text,p_changes jsonb,p_attendees jsonb default null,p_create boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();existing public.meetings;candidate public.meetings;saved public.meetings;
 ids uuid[];actor text;chair record;r record;item jsonb;
begin
 if u is null or coalesce(auth.role(),'')<>'authenticated' then raise exception 'Verified sign-in required' using errcode='42501';end if;
 select name into actor from public.profiles where id=u and coalesce(app_metadata->>'deactivated','false')<>'true';
 if actor is null then raise exception 'Active staff account required' using errcode='42501';end if;
 if p_create then
  if p_changes->>'organizer_id' is not null and p_changes->>'organizer_id'<>u::text then raise exception 'Cannot create a meeting as another member' using errcode='42501';end if;
  candidate:=jsonb_populate_record(null::public.meetings,p_changes-array['id','organizer_id','organizer_name','created_at']);
  candidate.id:=p_id;candidate.organizer_id:=u;candidate.organizer_name:=actor;candidate.created_at:=now();
  candidate.status:=coalesce(candidate.status,'Scheduled');candidate.agenda:=coalesce(candidate.agenda,'{}');candidate.duration_minutes:=coalesce(candidate.duration_minutes,60);
 else
  select * into existing from public.meetings where id=p_id for update;
  if not found or not officehub_private.meeting_manager(p_id,u) then raise exception 'Only the organizer or chair can edit this meeting' using errcode='42501';end if;
  if p_changes ? 'organizer_id' and p_changes->>'organizer_id' is distinct from existing.organizer_id::text then raise exception 'Meeting ownership is immutable' using errcode='42501';end if;
  candidate:=jsonb_populate_record(existing,p_changes-array['id','organizer_id','organizer_name','created_at']);
  if existing.organizer_id<>u and candidate.chair_id is distinct from existing.chair_id then raise exception 'Only the organizer may change the chair' using errcode='42501';end if;
 end if;
 if nullif(btrim(candidate.title),'') is null then raise exception 'Meeting title is required' using errcode='23514';end if;
 candidate.chair_id:=coalesce(candidate.chair_id,candidate.organizer_id);
 select id,name,email into chair from public.profiles where id=candidate.chair_id;
 if not found then raise exception 'Choose an existing chair' using errcode='23514';end if;
 candidate.chair_name:=chair.name;candidate.chair_email:=chair.email;
 if p_attendees is not null then
  if jsonb_typeof(p_attendees)<>'array' then raise exception 'Invalid invitation list' using errcode='23514';end if;
  if exists(select 1 from jsonb_array_elements(p_attendees) a where not exists(select 1 from public.profiles p where p.id::text=a->>'user_id')) then raise exception 'Choose existing members as attendees' using errcode='23514';end if;
  select array_agg(distinct value) into ids from (
   select (a->>'user_id')::uuid value from jsonb_array_elements(p_attendees) a
   union select candidate.organizer_id union select candidate.chair_id) x;
 elsif p_create then ids:=array[candidate.organizer_id,candidate.chair_id];
 end if;
 if p_create then
  insert into public.meetings(id,title,department,date,time,start_time,end_time,duration_minutes,description,organizer_id,organizer_name,agenda,meeting_type,teams_join_url,teams_meeting_id,teams_passcode,minutes,status,recurrence,chair_id,chair_name,chair_email,created_at,location)
  values(candidate.id,candidate.title,candidate.department,candidate.date,candidate.time,candidate.start_time,candidate.end_time,candidate.duration_minutes,candidate.description,candidate.organizer_id,candidate.organizer_name,candidate.agenda,candidate.meeting_type,candidate.teams_join_url,candidate.teams_meeting_id,candidate.teams_passcode,candidate.minutes,candidate.status,candidate.recurrence,candidate.chair_id,candidate.chair_name,candidate.chair_email,candidate.created_at,candidate.location) returning * into saved;
 else
  update public.meetings set title=candidate.title,department=candidate.department,date=candidate.date,time=candidate.time,start_time=candidate.start_time,end_time=candidate.end_time,duration_minutes=candidate.duration_minutes,description=candidate.description,agenda=candidate.agenda,meeting_type=candidate.meeting_type,teams_join_url=candidate.teams_join_url,teams_meeting_id=candidate.teams_meeting_id,teams_passcode=candidate.teams_passcode,minutes=candidate.minutes,status=candidate.status,recurrence=candidate.recurrence,chair_id=candidate.chair_id,chair_name=candidate.chair_name,chair_email=candidate.chair_email,location=candidate.location where id=p_id returning * into saved;
 end if;
 if ids is not null then
  delete from public.meeting_attendees where meeting_id=p_id and not(user_id=any(ids));
  for r in select id,name,email,avatar from public.profiles where id=any(ids) loop
   insert into public.meeting_attendees(meeting_id,user_id,name,email,avatar,status)
   values(p_id,r.id,r.name,r.email,r.avatar,case when r.id=candidate.organizer_id then 'Accepted' else 'Pending' end)
   on conflict(meeting_id,user_id) do update set name=excluded.name,email=excluded.email,avatar=excluded.avatar;
  end loop;
 end if;
 return jsonb_build_object('meeting',to_jsonb(saved),'attendees',(select coalesce(jsonb_agg(to_jsonb(a)),'[]') from public.meeting_attendees a where a.meeting_id=p_id));
end$$;
revoke all on function public.officehub_save_meeting(text,jsonb,jsonb,boolean) from public,anon;
grant execute on function public.officehub_save_meeting(text,jsonb,jsonb,boolean) to authenticated;

create or replace function officehub_private.email_meeting_event() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r uuid; k text;
begin
  if new.meeting_type='In-Person Boardroom' then return new;end if;
  if tg_op='UPDATE' and (new.title,new.date,new.start_time,new.end_time,new.status,new.teams_join_url,new.organizer_id)
    is not distinct from (old.title,old.date,old.start_time,old.end_time,old.status,old.teams_join_url,old.organizer_id) then return new; end if;
  k:='meeting:'||new.id||':'||nextval('officehub_private.email_event_seq');
  for r in select user_id from public.meeting_attendees where meeting_id=new.id union select new.organizer_id loop
    perform officehub_private.enqueue_email(k,'meeting',new.id,r,'[OfficeHub] Meeting: '||new.title,
      'Meeting "'||new.title||'": '||coalesce(new.date,'')||' '||coalesce(new.start_time,'')||' EAT. Status: '||coalesce(new.status,'Scheduled')||'. Sign in to OfficeHub for meeting details.');
  end loop;
  return new;
end $$;
create or replace function officehub_private.email_attendee_event() returns trigger
language plpgsql security definer set search_path = '' as $$
declare m public.meetings; k text;
begin
  select * into m from public.meetings where id=new.meeting_id;
  if tg_op='INSERT' and m.meeting_type='In-Person Boardroom' then return new;end if;
  if tg_op='INSERT' then
    if new.user_id is distinct from m.organizer_id then
      perform officehub_private.enqueue_email('meeting-invite:'||m.id||':'||new.user_id,
        'meeting_invite',m.id,new.user_id,'[OfficeHub] Meeting invitation: '||m.title,
        'You are invited to "'||m.title||'" on '||coalesce(m.date,'')||' at '||coalesce(m.start_time,'')||' EAT. Sign in to OfficeHub to respond.');
    end if;
  elsif (new.status,new.proposed_date,new.proposed_time,new.proposed_end_time)
      is distinct from (old.status,old.proposed_date,old.proposed_time,old.proposed_end_time)
      and new.user_id is distinct from m.organizer_id then
    k:='meeting-rsvp:'||m.id||':'||nextval('officehub_private.email_event_seq');
    perform officehub_private.enqueue_email(k,'meeting_rsvp',m.id,m.organizer_id,
      '[OfficeHub] Meeting response: '||m.title,
      'An attendee has updated their response for "'||m.title||'" to '||coalesce(new.status,'Pending')||'. Sign in to OfficeHub to review it.');
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
 if method='CANCEL' and (previous_invitation is null or (previous_invitation->>'end')::timestamptz<=now()) then return;end if;
 if method='REQUEST' and (officehub_private.meeting_start_at(m) is null or officehub_private.meeting_end_at(m)<=now()) then return;end if;
 sequence_number:=nextval('officehub_private.calendar_event_seq');
 payload:=jsonb_build_object('version',1,'id',m.id,'title',left(m.title,240),'description',left(coalesce(m.description,'')||E'\nOrganized in OfficeHub by '||coalesce(m.organizer_name,'OfficeHub'),12000),
  'location',left(coalesce(m.location,''),512),'start',officehub_private.meeting_start_at(m),'end',officehub_private.meeting_end_at(m),
  'sequence',sequence_number,'method',method,'organizerName',m.organizer_name);
 if method='CANCEL' then payload:=previous_invitation||jsonb_build_object('sequence',sequence_number,'method','CANCEL','description','Meeting cancelled in OfficeHub.','location','');end if;
 perform officehub_private.enqueue_email(event_key,case when method='CANCEL' then 'physical_calendar_cancel' else 'physical_calendar_request' end,m.id,recipient,
  '[OfficeHub] Physical meeting '||case when method='CANCEL' then 'cancelled: ' else 'invitation: ' end||(payload->>'title'),
  case when method='CANCEL' then 'This physical meeting invitation has been cancelled in OfficeHub.' else 'Physical meeting: '||m.title||E'\nVenue: '||coalesce(m.location,'')||E'\nWhen: '||m.date||' '||coalesce(m.start_time,m.time,'')||' – '||coalesce(m.end_time,'')||E' EAT.\nThis Outlook calendar invitation contains no Teams link.' end);
 update public.officehub_email_outbox q set calendar_payload=payload where q.event_key=enqueue_physical_calendar.event_key and q.recipient_id=recipient;
end$$;
create or replace function public.officehub_physical_calendar_event() returns trigger
language plpgsql security definer set search_path='' as $$
declare m public.meetings;r uuid;k text;method text;
begin
 if tg_op='DELETE' then m:=old;else m:=new;end if;
 if m.meeting_type<>'In-Person Boardroom' and not(tg_op='UPDATE' and old.meeting_type='In-Person Boardroom') then return coalesce(new,old);end if;
 if tg_op='UPDATE' and (new.title,new.description,new.date,new.time,new.start_time,new.end_time,new.duration_minutes,new.location,new.status,new.meeting_type)
   is not distinct from (old.title,old.description,old.date,old.time,old.start_time,old.end_time,old.duration_minutes,old.location,old.status,old.meeting_type) then return new;end if;
 method:=case when tg_op='DELETE' or m.status in ('Cancelled','Completed') or m.meeting_type<>'In-Person Boardroom' then 'CANCEL' else 'REQUEST' end;
 if tg_op='UPDATE' and old.meeting_type='In-Person Boardroom' and new.meeting_type<>'In-Person Boardroom' then m:=old;end if;
 k:='physical-meeting:'||m.id||':'||nextval('officehub_private.calendar_event_seq');
 for r in select user_id from public.meeting_attendees where meeting_id=m.id and status<>'Declined' union select m.organizer_id loop
  perform officehub_private.enqueue_physical_calendar(m,r,method,k);
 end loop;return coalesce(new,old);
end$$;
create trigger officehub_physical_calendar_event after insert or update on public.meetings for each row execute function public.officehub_physical_calendar_event();
-- Before parent deletion, the invitation membership still exists for cancellations.
create trigger officehub_physical_calendar_delete before delete on public.meetings for each row execute function public.officehub_physical_calendar_event();
create or replace function public.officehub_physical_attendee_event() returns trigger
language plpgsql security definer set search_path='' as $$
declare m public.meetings;recipient uuid;method text;
begin
 if tg_op='DELETE' then select * into m from public.meetings where id=old.meeting_id;recipient:=old.user_id;method:='CANCEL';
 else select * into m from public.meetings where id=new.meeting_id;recipient:=new.user_id;method:=case when new.status='Declined' then 'CANCEL' else 'REQUEST' end;end if;
 if m.id is null or m.meeting_type<>'In-Person Boardroom' or recipient=m.organizer_id then return coalesce(new,old);end if;
 if tg_op='UPDATE' and not ((new.status='Declined') is distinct from (old.status='Declined')) then return new;end if;
 perform officehub_private.enqueue_physical_calendar(m,recipient,method,'physical-attendee:'||m.id||':'||nextval('officehub_private.calendar_event_seq'));
 return coalesce(new,old);
end$$;
create trigger officehub_physical_attendee_event after insert or update or delete on public.meeting_attendees for each row execute function public.officehub_physical_attendee_event();
-- Preserve existing eligibility rules for all other mail, including digests and subtask suppression.
alter function officehub_private.email_recipient_is_current(text,text,uuid) rename to email_recipient_before_physical_calendar;
create function officehub_private.email_recipient_is_current(p_type text,p_entity text,p_recipient uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select case when p_type='physical_calendar_cancel' then exists(select 1 from public.profiles where id=p_recipient)
 when p_type='physical_calendar_request' then exists(select 1 from public.meetings m where m.id=p_entity and m.meeting_type='In-Person Boardroom' and m.status not in ('Cancelled','Completed')
  and officehub_private.meeting_end_at(m)>now() and (m.organizer_id=p_recipient or exists(select 1 from public.meeting_attendees a where a.meeting_id=m.id and a.user_id=p_recipient and a.status<>'Declined')))
 else officehub_private.email_recipient_before_physical_calendar(p_type,p_entity,p_recipient) end
$$;
revoke all on function officehub_private.meeting_start_at(public.meetings),public.officehub_physical_meeting_guard(),officehub_private.enqueue_physical_calendar(public.meetings,uuid,text,text),public.officehub_physical_calendar_event(),public.officehub_physical_attendee_event(),officehub_private.email_recipient_is_current(text,text,uuid) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
