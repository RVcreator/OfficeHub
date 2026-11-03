-- The app uses East Africa Time for scheduled meeting allocations.
begin;
create function officehub_private.meeting_clock_seconds(v text) returns integer language plpgsql immutable set search_path='' as $$
declare parts text[];h integer;m integer;s integer;
begin
 parts:=regexp_match(lower(btrim(v)),'^([0-9]{1,2}):([0-9]{2})(?::([0-9]{2}))?[[:space:]]*(am|pm)?$');
 if parts is null then return null;end if;
 h:=parts[1]::integer;m:=parts[2]::integer;s:=coalesce(parts[3],'0')::integer;
 if m>59 or s>59 then return null;end if;
 if parts[4] is not null then if h<1 or h>12 then return null;end if;h:=h%12+case when parts[4]='pm' then 12 else 0 end;
 elsif h>23 then return null;end if;
 return h*3600+m*60+s;
end$$;
create function officehub_private.meeting_end_at(m public.meetings) returns timestamptz language plpgsql immutable set search_path='' as $$
declare d date;start_seconds integer;end_seconds integer;finish timestamp;
begin
 if m.date is null or m.date!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return null;end if;
 begin d:=m.date::date;exception when others then return null;end;
 start_seconds:=coalesce(officehub_private.meeting_clock_seconds(m.start_time),officehub_private.meeting_clock_seconds(m.time));end_seconds:=officehub_private.meeting_clock_seconds(m.end_time);
 if end_seconds is not null then
  finish:=d::timestamp+make_interval(secs=>end_seconds);
  if start_seconds is not null and end_seconds<start_seconds then finish:=finish+interval '1 day';end if;
 elsif start_seconds is not null then finish:=d::timestamp+make_interval(secs=>start_seconds,mins=>case when m.duration_minutes>0 then m.duration_minutes else 60 end);
 else return null;end if;
 return finish at time zone 'Africa/Dar_es_Salaam';
end$$;
create function public.officehub_meeting_response_deadline() returns trigger language plpgsql security definer set search_path='' as $$
declare m public.meetings;k text;deadline timestamptz;
begin
 if coalesce(auth.role(),'')<>'authenticated' then if TG_OP='DELETE' then return old;else return new;end if;end if;
 if TG_OP='DELETE' then k:=old.meeting_id;else k:=new.meeting_id;end if;
 select * into m from public.meetings where id=k;
 -- Parent deletion/cascade remains governed by its existing permission checks.
 if not found then if TG_OP='DELETE' then return old;else return new;end if;end if;
 if not officehub_private.meeting_member(k,auth.uid()) then if TG_OP='DELETE' then return old;else return new;end if;end if;
 deadline:=officehub_private.meeting_end_at(m);
 if deadline is null or clock_timestamp()>=deadline or m.status in ('Cancelled','Completed') then
  if TG_OP<>'UPDATE' or to_jsonb(new) is distinct from to_jsonb(old) then raise exception 'This meeting is dormant. Its response window has closed.' using errcode='42501';end if;
 end if;
 if TG_OP='DELETE' then return old;else return new;end if;
end$$;
create trigger officehub_meeting_response_deadline before insert or update or delete on public.meeting_attendees for each row execute function public.officehub_meeting_response_deadline();
create function public.officehub_dormant_meeting_schedule() returns trigger language plpgsql security definer set search_path='' as $$
declare deadline timestamptz;
begin
 if coalesce(auth.role(),'')<>'authenticated' then return new;end if;
 deadline:=officehub_private.meeting_end_at(old);
 if ((deadline is not null and clock_timestamp()>=deadline) or old.status in ('Cancelled','Completed')) and
  (new.date,new.time,new.start_time,new.end_time,new.duration_minutes,new.recurrence) is distinct from (old.date,old.time,old.start_time,old.end_time,old.duration_minutes,old.recurrence) then
  raise exception 'Past meetings are dormant. Create a new meeting to schedule another allocation.' using errcode='42501';
 end if;return new;
end$$;
create trigger officehub_dormant_meeting_schedule before update on public.meetings for each row execute function public.officehub_dormant_meeting_schedule();
revoke all on function officehub_private.meeting_clock_seconds(text),officehub_private.meeting_end_at(public.meetings),public.officehub_meeting_response_deadline(),public.officehub_dormant_meeting_schedule() from public,anon,authenticated;
commit;
