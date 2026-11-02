-- One transaction for meeting details and invitation membership.
begin;
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
  insert into public.meetings(id,title,department,date,time,start_time,end_time,duration_minutes,description,organizer_id,organizer_name,agenda,meeting_type,teams_join_url,teams_meeting_id,teams_passcode,minutes,status,recurrence,chair_id,chair_name,chair_email,created_at)
  values(candidate.id,candidate.title,candidate.department,candidate.date,candidate.time,candidate.start_time,candidate.end_time,candidate.duration_minutes,candidate.description,candidate.organizer_id,candidate.organizer_name,candidate.agenda,candidate.meeting_type,candidate.teams_join_url,candidate.teams_meeting_id,candidate.teams_passcode,candidate.minutes,candidate.status,candidate.recurrence,candidate.chair_id,candidate.chair_name,candidate.chair_email,candidate.created_at) returning * into saved;
 else
  update public.meetings set title=candidate.title,department=candidate.department,date=candidate.date,time=candidate.time,start_time=candidate.start_time,end_time=candidate.end_time,duration_minutes=candidate.duration_minutes,description=candidate.description,agenda=candidate.agenda,meeting_type=candidate.meeting_type,teams_join_url=candidate.teams_join_url,teams_meeting_id=candidate.teams_meeting_id,teams_passcode=candidate.teams_passcode,minutes=candidate.minutes,status=candidate.status,recurrence=candidate.recurrence,chair_id=candidate.chair_id,chair_name=candidate.chair_name,chair_email=candidate.chair_email where id=p_id returning * into saved;
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
commit;
