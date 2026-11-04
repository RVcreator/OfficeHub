begin;
alter table public.meetings add column microsoft_sync_status text;
alter table public.meetings add column microsoft_sync_error text;
create table officehub_private.teams_sync_jobs(
 meeting_id text primary key, revision bigint not null default 1, synced_revision bigint not null default 0,
 transaction_id uuid not null default gen_random_uuid(),
 organizer_id uuid,chair_id uuid,organizer_email text,
 event_id text,owner_id text,online_id text,applied_hash text,legacy_event_id text,legacy_join_url text,
 cancelled boolean not null default false,status text not null default 'pending',attempts integer not null default 0,
 next_attempt timestamptz not null default now(),lease_token uuid,lease_until timestamptz,last_error text
);
revoke all on officehub_private.teams_sync_jobs from public,anon,authenticated,service_role;
alter table officehub_private.teams_sync_jobs enable row level security;
create function officehub_private.queue_teams_sync(m public.meetings,deleted boolean default false) returns void
language plpgsql security definer set search_path='' as $$
begin
 if m.meeting_type='In-Person Boardroom' and not exists(select 1 from officehub_private.teams_sync_jobs where meeting_id=m.id) then return;end if;
 insert into officehub_private.teams_sync_jobs(meeting_id,organizer_id,chair_id,organizer_email,cancelled,legacy_event_id,legacy_join_url)
 values(m.id,m.organizer_id,m.chair_id,(select lower(u.email) from auth.users u where u.id=m.organizer_id and u.email_confirmed_at is not null),deleted or m.status='Cancelled' or m.meeting_type='In-Person Boardroom',
 case when m.teams_meeting_id is not null and m.teams_meeting_id!~ '^(mtg-|meetup-)' and m.teams_meeting_id!~ '^[0-9]{3} [0-9]{3} [0-9]{3}$' then m.teams_meeting_id end,m.teams_join_url)
 on conflict(meeting_id)do update set revision=teams_sync_jobs.revision+1,chair_id=excluded.chair_id,cancelled=excluded.cancelled,status='pending',next_attempt=now(),attempts=0,last_error=null;
 if not deleted then update public.meetings set microsoft_sync_status='pending',microsoft_sync_error=null where id=m.id and (microsoft_sync_status is distinct from 'pending' or microsoft_sync_error is not null);end if;
end $$;
create function public.officehub_queue_teams_meeting()returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then perform officehub_private.queue_teams_sync(old,true);return old;end if;
 if tg_op='INSERT' or (new.title,new.date,new.time,new.start_time,new.end_time,new.duration_minutes,new.description,new.chair_id,new.meeting_type,new.status,new.recurrence)
 is distinct from (old.title,old.date,old.time,old.start_time,old.end_time,old.duration_minutes,old.description,old.chair_id,old.meeting_type,old.status,old.recurrence) then perform officehub_private.queue_teams_sync(new);end if;
 return new;
end $$;
create trigger officehub_queue_teams_meeting after insert or update on public.meetings for each row execute function public.officehub_queue_teams_meeting();
create trigger officehub_queue_teams_meeting_delete before delete on public.meetings for each row execute function public.officehub_queue_teams_meeting();
create function public.officehub_queue_teams_attendee()returns trigger language plpgsql security definer set search_path='' as $$
declare m public.meetings;begin
 if tg_op='UPDATE' and new.user_id is not distinct from old.user_id and new.meeting_id is not distinct from old.meeting_id then return new;end if;
 select * into m from public.meetings where id=coalesce(new.meeting_id,old.meeting_id);
 if found then perform officehub_private.queue_teams_sync(m);end if;return coalesce(new,old);
end $$;
create trigger officehub_queue_teams_attendee after insert or delete or update of user_id,meeting_id on public.meeting_attendees for each row execute function public.officehub_queue_teams_attendee();
-- Keep atomic permissions/RSVP semantics. Microsoft IDs and delivery state are server-owned.
alter function public.officehub_save_meeting(text,jsonb,jsonb,boolean) set schema officehub_private;
alter function officehub_private.officehub_save_meeting(text,jsonb,jsonb,boolean) rename to save_meeting_before_teams;
revoke all on function officehub_private.save_meeting_before_teams(text,jsonb,jsonb,boolean) from public,anon,authenticated,service_role;
create function public.officehub_save_meeting(p_id text,p_changes jsonb,p_attendees jsonb default null,p_create boolean default false)returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;m public.meetings;begin
 if p_changes ?| array['teams_join_url','teams_meeting_id','teams_passcode','microsoft_sync_status','microsoft_sync_error'] then
  raise exception 'Microsoft meeting links and sync state are managed by the server' using errcode='42501';end if;
 -- Do not silently create a single event when a recurring series was requested.
 if coalesce(p_changes->>'recurrence','None')<>'None' and coalesce(p_changes->>'meeting_type',(select meeting_type from public.meetings where id=p_id),'Microsoft Teams')<>'In-Person Boardroom' then
  raise exception 'Recurring Teams meetings must be scheduled in Outlook. Choose None in OfficeHub.' using errcode='23514';end if;
 if not p_create and p_changes ? 'chair_id' and p_attendees is null then
  select coalesce(jsonb_agg(jsonb_build_object('user_id',user_id)),'[]') into p_attendees from public.meeting_attendees where meeting_id=p_id;
 end if;
 result:=officehub_private.save_meeting_before_teams(p_id,p_changes,p_attendees,p_create);
 select * into m from public.meetings where id=p_id;
 if m.meeting_type<>'In-Person Boardroom' and not exists(select 1 from officehub_private.teams_sync_jobs where meeting_id=p_id) then perform officehub_private.queue_teams_sync(m);end if;
 return jsonb_build_object('meeting',(select to_jsonb(x) from public.meetings x where id=p_id),'attendees',result->'attendees');
end $$;
revoke all on function public.officehub_save_meeting(text,jsonb,jsonb,boolean)from public,anon;
grant execute on function public.officehub_save_meeting(text,jsonb,jsonb,boolean)to authenticated;
create function public.officehub_guard_teams_fields()returns trigger language plpgsql set search_path='' as $$
begin
 if current_user='authenticated' and (new.teams_join_url,new.teams_meeting_id,new.teams_passcode,new.microsoft_sync_status,new.microsoft_sync_error)
 is distinct from (old.teams_join_url,old.teams_meeting_id,old.teams_passcode,old.microsoft_sync_status,old.microsoft_sync_error) then raise exception 'Microsoft meeting state is server-managed' using errcode='42501';end if;return new;
end $$;
create trigger officehub_guard_teams_fields before update on public.meetings for each row execute function public.officehub_guard_teams_fields();
create function public.officehub_teams_sync_authorized(p_actor uuid,p_meeting text)returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users u join public.profiles p on p.id=u.id where u.id=p_actor and u.email_confirmed_at is not null and u.deleted_at is null
 and (u.banned_until is null or u.banned_until<=now()) and coalesce(u.raw_app_meta_data->>'must_change_password','false')<>'true'
 and coalesce(u.raw_app_meta_data->>'deactivated','false')<>'true' and coalesce(p.app_metadata->>'deactivated','false')<>'true')
 and (officehub_private.meeting_manager(p_meeting,p_actor) or (not exists(select 1 from public.meetings where id=p_meeting) and exists(select 1 from officehub_private.teams_sync_jobs where meeting_id=p_meeting and p_actor in(organizer_id,chair_id))));
$$;
create function public.officehub_claim_teams_sync(p_meeting text default null)returns jsonb language plpgsql security definer set search_path='' as $$
declare j officehub_private.teams_sync_jobs;m public.meetings;payload jsonb;begin
 select * into j from officehub_private.teams_sync_jobs where (p_meeting is null or meeting_id=p_meeting) and status in('pending','retry') and next_attempt<=now()
 and (lease_until is null or lease_until<now()) order by next_attempt,meeting_id for update skip locked limit 1;
 if not found then return null;end if;
 update officehub_private.teams_sync_jobs set lease_token=gen_random_uuid(),lease_until=now()+interval '3 minutes',attempts=attempts+1 where meeting_id=j.meeting_id returning * into j;
 if j.cancelled then payload:=jsonb_build_object('cancelled',true,'organizer_email',j.organizer_email);
 else
  select * into m from public.meetings where id=j.meeting_id;
  payload:=jsonb_build_object('cancelled',false,'title',m.title,'description',coalesce(m.description,''),'start',officehub_private.meeting_start_at(m),'end',officehub_private.meeting_end_at(m),
   'organizer_email',j.organizer_email,'chair_email',(select lower(u.email) from auth.users u where u.id=m.chair_id and u.email_confirmed_at is not null and u.deleted_at is null),
   'attendees',(select coalesce(jsonb_agg(jsonb_build_object('email',case when u.email_confirmed_at is not null and u.deleted_at is null and coalesce(p.app_metadata->>'deactivated','false')<>'true' then lower(u.email) end,'name',p.name) order by a.user_id),'[]') from public.meeting_attendees a join public.profiles p on p.id=a.user_id left join auth.users u on u.id=a.user_id where a.meeting_id=m.id));
 end if;
 return to_jsonb(j)||jsonb_build_object('payload',payload);
end $$;
create function public.officehub_checkpoint_teams_sync(p_meeting text,p_lease uuid,p_binding jsonb)returns void language plpgsql security definer set search_path='' as $$
begin
 update officehub_private.teams_sync_jobs set event_id=coalesce(p_binding->>'event_id',event_id),owner_id=coalesce(p_binding->>'owner_id',owner_id),online_id=coalesce(p_binding->>'online_id',online_id)
 where meeting_id=p_meeting and lease_token=p_lease and lease_until>now();
 if not found then raise exception 'Microsoft sync lease expired';end if;
 -- Persist the confirmed link immediately, even if a newer edit is queued.
 if p_binding->>'join_url' is not null then update public.meetings set teams_join_url=p_binding->>'join_url',teams_meeting_id=p_binding->>'event_id',teams_passcode=null where id=p_meeting and meeting_type<>'In-Person Boardroom';end if;
end $$;
create function public.officehub_finish_teams_sync(p_meeting text,p_lease uuid,p_revision bigint,p_binding jsonb,p_error text,p_blocked boolean default false)returns void language plpgsql security definer set search_path='' as $$
declare j officehub_private.teams_sync_jobs;state text;begin
 select * into j from officehub_private.teams_sync_jobs where meeting_id=p_meeting and lease_token=p_lease and lease_until>now() for update;
 if not found then raise exception 'Microsoft sync lease expired';end if;
 if p_error is null then perform public.officehub_checkpoint_teams_sync(p_meeting,p_lease,p_binding);end if;
 state:=case when j.revision<>p_revision then 'pending' when p_error is null then 'synced' when p_blocked then 'blocked' else 'retry' end;
 update officehub_private.teams_sync_jobs set status=state,last_error=case when state='pending' then null else left(p_error,400) end,lease_token=null,lease_until=null,
  synced_revision=case when p_error is null then p_revision else synced_revision end,
  applied_hash=case when p_error is null then p_binding->>'applied_hash' else applied_hash end,
  next_attempt=case when state='pending' then now() else now()+make_interval(secs=>least(3600,30*power(2,least(attempts,7)))) end where meeting_id=p_meeting;
 update public.meetings set microsoft_sync_status=state,microsoft_sync_error=case when state='pending' then null else left(p_error,400) end where id=p_meeting;
end $$;
create function public.officehub_retry_teams_sync(p_meeting text)returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.officehub_teams_sync_authorized(auth.uid(),p_meeting) then raise exception 'Only the organizer or chair can sync this meeting' using errcode='42501';end if;
 update officehub_private.teams_sync_jobs set status='pending',next_attempt=now(),last_error=null where meeting_id=p_meeting and status in('blocked','retry');
 if found then update public.meetings set microsoft_sync_status='pending',microsoft_sync_error=null where id=p_meeting;end if;
end $$;
revoke all on function public.officehub_teams_sync_authorized(uuid,text),public.officehub_claim_teams_sync(text),public.officehub_checkpoint_teams_sync(text,uuid,jsonb),public.officehub_finish_teams_sync(text,uuid,bigint,jsonb,text,boolean)from public,anon,authenticated;
grant execute on function public.officehub_teams_sync_authorized(uuid,text),public.officehub_claim_teams_sync(text),public.officehub_checkpoint_teams_sync(text,uuid,jsonb),public.officehub_finish_teams_sync(text,uuid,bigint,jsonb,text,boolean)to service_role;
revoke all on function public.officehub_retry_teams_sync(text)from public,anon;
grant execute on function public.officehub_retry_teams_sync(text)to authenticated;
revoke all on function officehub_private.queue_teams_sync(public.meetings,boolean),public.officehub_queue_teams_meeting(),public.officehub_queue_teams_attendee(),public.officehub_guard_teams_fields()from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
