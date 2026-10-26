-- Email is opt-in at cutover. No historical records are backfilled.
-- Keep credentials in Edge Function secrets, never in this migration.
begin;

-- Persist the recipient selections already offered by the React forms.
alter table public.tasks
  add column if not exists assignment_type text,
  add column if not exists assigned_departments text[] not null default '{}',
  add column if not exists assigned_organisations text[] not null default '{}';
alter table public.notices
  add column if not exists target_audience_type text,
  add column if not exists target_organisations text[] not null default '{}',
  add column if not exists target_departments text[] not null default '{}',
  add column if not exists target_user_ids text[] not null default '{}';
alter table public.approvals add column if not exists approver_ids text[] not null default '{}';

create schema if not exists officehub_private;
revoke all on schema officehub_private from public, anon, authenticated;
create sequence officehub_private.email_event_seq;
create table officehub_private.email_settings (
  id boolean primary key default true check (id),
  capture_enabled boolean not null default false,
  delivery_enabled boolean not null default false,
  -- Empty means all verified internal user addresses; use one test address first.
  allowed_recipient_emails text[] not null default '{}'
);
alter table officehub_private.email_settings enable row level security;
insert into officehub_private.email_settings(id) values (true);

create table public.officehub_email_outbox (
  id uuid primary key default gen_random_uuid(),
  event_key text not null,
  event_type text not null,
  entity_id text not null,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  recipient_email text not null,
  recipient_name text not null,
  subject text not null,
  body_text text not null,
  status text not null default 'queued' check (status in
    ('queued','processing','sending','retry','accepted','failed','review','cancelled')),
  attempts integer not null default 0 check (attempts between 0 and 6),
  available_at timestamptz not null default (now() + interval '30 seconds'),
  lease_token uuid,
  lease_until timestamptz,
  accepted_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (event_key, recipient_email)
);
create index officehub_email_due_idx on public.officehub_email_outbox(available_at)
  where status in ('queued','retry');
alter table public.officehub_email_outbox enable row level security;
revoke all on public.officehub_email_outbox from public, anon, authenticated;
grant select on public.officehub_email_outbox to authenticated;
grant all on public.officehub_email_outbox to service_role;
create policy "Recipients read their own email queue" on public.officehub_email_outbox
  for select to authenticated using (recipient_id = auth.uid());

create function officehub_private.enqueue_email(
  p_key text, p_type text, p_entity text, p_recipient uuid, p_subject text, p_body text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (select capture_enabled from officehub_private.email_settings where id) then return; end if;
  -- Resolve the address from Supabase Auth, never from client emailRecipients or attendee.email.
  insert into public.officehub_email_outbox(event_key,event_type,entity_id,
    recipient_id,recipient_email,recipient_name,subject,body_text)
  select p_key,p_type,p_entity,p.id,lower(trim(u.email)),p.name,
    left(regexp_replace(p_subject,E'[\r\n]+',' ','g'),240),left(p_body,12000)
  from public.profiles p join auth.users u on u.id=p.id
  where p.id=p_recipient and u.email_confirmed_at is not null
    and (u.banned_until is null or u.banned_until < now())
    and coalesce(to_jsonb(p)->>'deactivated','false') <> 'true'
    and lower(trim(u.email)) ~ '^[^[:space:]@]+@wipahs[.]org$'
  on conflict (event_key,recipient_email) do nothing;
end $$;

create function officehub_private.task_recipients(t jsonb)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select distinct p.id from public.profiles p where
    p.id::text=t->>'assigned_to_id'
    or p.id::text in (select jsonb_array_elements_text(case when jsonb_typeof(t->'assigned_to_ids')='array' then t->'assigned_to_ids' else '[]'::jsonb end))
    or (t->>'assignment_type'='department'
      and p.organisation=t->>'organisation'
      and p.department in (select jsonb_array_elements_text(coalesce(t->'assigned_departments','[]'))))
    or (t->>'assignment_type'='organization'
      and p.organisation in (select jsonb_array_elements_text(coalesce(t->'assigned_organisations','[]'))));
$$;

create function officehub_private.notice_recipients(n jsonb)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select p.id from public.profiles p where
    case n->>'target_audience_type'
      when 'selected_people' then p.id::text in (select jsonb_array_elements_text(n->'target_user_ids'))
      when 'all' then true
      when 'organisation' then p.organisation in (select jsonb_array_elements_text(n->'target_organisations'))
      when 'department' then p.department in (select jsonb_array_elements_text(n->'target_departments'))
        and (jsonb_array_length(n->'target_organisations')=0 or p.organisation in (select jsonb_array_elements_text(n->'target_organisations')))
      when 'org_and_dept' then p.department in (select jsonb_array_elements_text(n->'target_departments'))
        and p.organisation in (select jsonb_array_elements_text(n->'target_organisations'))
      -- Legacy records have no persisted audience: do not guess or broadcast.
      else false
    end;
$$;

create function officehub_private.email_task_event() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r uuid; k text; previous jsonb := '{}';
begin
  if tg_op='UPDATE' then
    previous:=to_jsonb(old);
    if (to_jsonb(new)-array['assigned_to_id','assigned_to_ids','assignment_type','assigned_departments','assigned_organisations','status'])
      = (previous-array['assigned_to_id','assigned_to_ids','assignment_type','assigned_departments','assigned_organisations','status'])
      and new.assigned_to_id is not distinct from old.assigned_to_id
      and new.assigned_to_ids is not distinct from old.assigned_to_ids
      and new.assignment_type is not distinct from old.assignment_type
      and new.assigned_departments is not distinct from old.assigned_departments
      and new.assigned_organisations is not distinct from old.assigned_organisations
      and new.status is not distinct from old.status then return new; end if;
  end if;
  k:='task:'||new.id||':'||nextval('officehub_private.email_event_seq');
  for r in select * from officehub_private.task_recipients(to_jsonb(new))
    except select * from officehub_private.task_recipients(previous)
  loop
    if r is distinct from auth.uid() then
      perform officehub_private.enqueue_email(k,'task_assigned',new.id,r,
        '[OfficeHub] Task assigned: '||new.title,
        'You have been assigned the task "'||new.title||'". Due: '||coalesce(new.due_date,'Not specified')||'. Sign in to OfficeHub to review it.');
    end if;
  end loop;
  if tg_op='UPDATE' and new.status is distinct from old.status and new.created_by_id is distinct from auth.uid() then
    perform officehub_private.enqueue_email(k||':status','task_status',new.id,new.created_by_id,
      '[OfficeHub] Task '||new.status||': '||new.title,
      'The task "'||new.title||'" is now '||new.status||'. Sign in to OfficeHub for details.');
  end if;
  return new;
end $$;
create trigger officehub_email_task after insert or update on public.tasks
  for each row execute function officehub_private.email_task_event();

create function officehub_private.email_subtask_event() returns trigger
language plpgsql security definer set search_path = '' as $$
declare t public.tasks; r uuid; k text;
begin
  if tg_op='UPDATE' and new.completed is not distinct from old.completed and new.title is not distinct from old.title then return new; end if;
  select * into t from public.tasks where id=new.task_id;
  k:='subtask:'||new.id||':'||nextval('officehub_private.email_event_seq');
  -- Current schema has no independent subtask assignment. Use the parent participants.
  for r in select * from officehub_private.task_recipients(to_jsonb(t))
    union select user_id from public.task_assignees where task_id=t.id
    union select t.created_by_id
  loop
    if r is distinct from auth.uid() then
      perform officehub_private.enqueue_email(k,'subtask',t.id,r,
        '[OfficeHub] Subtask update: '||t.title,
        'Subtask "'||new.title||'" in "'||t.title||'": '||case when new.completed then 'complete' else 'open' end||'. Sign in to OfficeHub for details.');
    end if;
  end loop;
  return new;
end $$;
create trigger officehub_email_subtask after insert or update on public.task_subtasks
  for each row execute function officehub_private.email_subtask_event();

create function officehub_private.email_extra_assignee() returns trigger
language plpgsql security definer set search_path = '' as $$
declare t public.tasks;
begin
  select * into t from public.tasks where id=new.task_id;
  if new.user_id is distinct from auth.uid() and not exists (
    select 1 from officehub_private.task_recipients(to_jsonb(t)) r where r=new.user_id
  ) then
    perform officehub_private.enqueue_email('task-member:'||new.task_id||':'||nextval('officehub_private.email_event_seq'),
      'task_assigned',t.id,new.user_id,'[OfficeHub] Task assigned: '||t.title,
      'You have been assigned "'||t.title||'". Sign in to OfficeHub for details.');
  end if;
  return new;
end $$;
create trigger officehub_email_extra_assignee after insert on public.task_assignees
  for each row execute function officehub_private.email_extra_assignee();

create function officehub_private.email_notice_event() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r uuid; k text;
begin
  if tg_op='UPDATE' and (new.title,new.content,new.target_audience_type,new.target_organisations,new.target_departments,new.target_user_ids)
    is not distinct from (old.title,old.content,old.target_audience_type,old.target_organisations,old.target_departments,old.target_user_ids) then return new; end if;
  k:='notice:'||new.id||':'||nextval('officehub_private.email_event_seq');
  for r in select * from officehub_private.notice_recipients(to_jsonb(new)) loop
    if r is distinct from auth.uid() then
      perform officehub_private.enqueue_email(k,'notice',new.id,r,'[OfficeHub] Notice: '||new.title,
        'A notice titled "'||new.title||'" is available for you. Sign in to OfficeHub to read and acknowledge it.');
    end if;
  end loop;
  return new;
end $$;
create trigger officehub_email_notice after insert or update on public.notices
  for each row execute function officehub_private.email_notice_event();

create function officehub_private.email_ack_event() returns trigger
language plpgsql security definer set search_path = '' as $$
declare n public.notices;
begin
  select * into n from public.notices where id=new.notice_id;
  if n.author_id is distinct from new.user_id then
    perform officehub_private.enqueue_email('notice-ack:'||new.notice_id||':'||new.user_id,
      'notice_ack',n.id,n.author_id,'[OfficeHub] Notice acknowledged: '||n.title,
      'A recipient has acknowledged "'||n.title||'". Sign in to OfficeHub to view the acknowledgement.');
  end if;
  return new;
end $$;
create trigger officehub_email_ack after insert on public.notice_acknowledgements
  for each row execute function officehub_private.email_ack_event();

create function officehub_private.email_approval_event() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r uuid; k text; prev text[] := '{}';
begin
  if tg_op='UPDATE' then
    if new.status is not distinct from old.status and new.approver_ids is not distinct from old.approver_ids then return new; end if;
    prev:=old.approver_ids;
  end if;
  k:='approval:'||new.id||':'||nextval('officehub_private.email_event_seq');
  if new.status in ('Pending','Under Review') then
    for r in select p.id from public.profiles p where p.id::text=any(new.approver_ids) and not p.id::text=any(prev) loop
      if r is distinct from auth.uid() then
        perform officehub_private.enqueue_email(k,'approval_requested',new.id,r,'[OfficeHub] Approval requested: '||new.title,
          'Your review is requested for "'||new.title||'". Sign in to OfficeHub to review the request.');
      end if;
    end loop;
  end if;
  if tg_op='UPDATE' and new.status is distinct from old.status and new.requested_by_id is distinct from auth.uid() then
    perform officehub_private.enqueue_email(k||':status','approval_status',new.id,new.requested_by_id,
      '[OfficeHub] Request '||new.status||': '||new.title,
      'Your request "'||new.title||'" is now '||new.status||'. Sign in to OfficeHub for details.');
  end if;
  return new;
end $$;
create trigger officehub_email_approval after insert or update on public.approvals
  for each row execute function officehub_private.email_approval_event();

create function officehub_private.email_meeting_event() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r uuid; k text;
begin
  if tg_op='UPDATE' and (new.title,new.date,new.start_time,new.end_time,new.status,new.teams_join_url,new.organizer_id)
    is not distinct from (old.title,old.date,old.start_time,old.end_time,old.status,old.teams_join_url,old.organizer_id) then return new; end if;
  k:='meeting:'||new.id||':'||nextval('officehub_private.email_event_seq');
  for r in select user_id from public.meeting_attendees where meeting_id=new.id union select new.organizer_id loop
    perform officehub_private.enqueue_email(k,'meeting',new.id,r,'[OfficeHub] Meeting: '||new.title,
      'Meeting "'||new.title||'": '||coalesce(new.date,'')||' '||coalesce(new.start_time,'')||' EAT. Status: '||coalesce(new.status,'Scheduled')||'. Sign in to OfficeHub for meeting details.');
  end loop;
  return new;
end $$;
create trigger officehub_email_meeting after insert or update on public.meetings
  for each row execute function officehub_private.email_meeting_event();

create function officehub_private.email_attendee_event() returns trigger
language plpgsql security definer set search_path = '' as $$
declare m public.meetings; k text;
begin
  select * into m from public.meetings where id=new.meeting_id;
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
create trigger officehub_email_attendee after insert or update on public.meeting_attendees
  for each row execute function officehub_private.email_attendee_event();

-- Worker RPCs are service-role-only. Processing may retry; sending must never
-- automatically retry after a timeout/crash, since Graph has no sendMail idempotency key.
create function officehub_private.email_recipient_is_current(p_type text,p_entity text,p_recipient uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when p_type in ('task_assigned','subtask') then exists (
      select 1 from public.tasks t where t.id=p_entity and (
        p_recipient in (select * from officehub_private.task_recipients(to_jsonb(t)))
        or exists(select 1 from public.task_assignees a where a.task_id=t.id and a.user_id=p_recipient)
        or (p_type='subtask' and t.created_by_id=p_recipient)))
    when p_type='task_status' then exists(select 1 from public.tasks where id=p_entity and created_by_id=p_recipient)
    when p_type in ('meeting','meeting_invite') then exists (
      select 1 from public.meetings m where m.id=p_entity and (m.organizer_id=p_recipient
        or exists(select 1 from public.meeting_attendees a where a.meeting_id=m.id and a.user_id=p_recipient)))
    when p_type='meeting_rsvp' then exists(select 1 from public.meetings where id=p_entity and organizer_id=p_recipient)
    when p_type='notice' then exists(select 1 from public.notices n where n.id=p_entity
      and p_recipient in (select * from officehub_private.notice_recipients(to_jsonb(n))))
    when p_type='notice_ack' then exists(select 1 from public.notices where id=p_entity and author_id=p_recipient)
    when p_type='approval_requested' then exists(select 1 from public.approvals
      where id=p_entity and p_recipient::text=any(approver_ids) and status in ('Pending','Under Review'))
    when p_type='approval_status' then exists(select 1 from public.approvals where id=p_entity and requested_by_id=p_recipient)
    else false
  end;
$$;

create function public.officehub_email_claim() returns setof public.officehub_email_outbox
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
    lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes'
    from candidate c where q.id=c.id returning q.*;
end $$;

create function public.officehub_email_mark_sending(p_id uuid,p_lease uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare changed integer;
begin
  update public.officehub_email_outbox set status='sending'
    where id=p_id and lease_token=p_lease and status='processing' and lease_until>now()
      and exists(select 1 from officehub_private.email_settings s where s.id and s.delivery_enabled
        and (cardinality(s.allowed_recipient_emails)=0 or recipient_email=any(s.allowed_recipient_emails)))
      and officehub_private.email_recipient_is_current(event_type,entity_id,recipient_id)
      and exists(select 1 from auth.users u join public.profiles p on p.id=u.id
        where u.id=recipient_id and lower(trim(u.email))=recipient_email and u.email_confirmed_at is not null
          and (u.banned_until is null or u.banned_until<now())
          and coalesce(to_jsonb(p)->>'deactivated','false')<>'true');
  get diagnostics changed=row_count; return changed=1;
end $$;

create function public.officehub_email_finish(p_id uuid,p_lease uuid,p_status text,p_error text default null,p_delay integer default 60)
returns boolean language plpgsql security definer set search_path = '' as $$
declare changed integer;
begin
  if p_status not in ('retry','accepted','failed','review') then raise exception 'Invalid email outcome'; end if;
  update public.officehub_email_outbox set
    status=case when p_status='retry' and attempts>=6 then 'failed' else p_status end,
    accepted_at=case when p_status='accepted' then now() else null end,
    last_error=left(p_error,300),available_at=now()+make_interval(secs=>greatest(30,least(p_delay,86400))),lease_until=null
  where id=p_id and lease_token=p_lease and lease_until>now()
    and ((status='processing' and p_status in ('retry','failed')) or (status='sending'));
  get diagnostics changed=row_count; return changed=1;
end $$;

revoke all on all functions in schema officehub_private from public,anon,authenticated;
revoke all on function public.officehub_email_claim() from public,anon,authenticated;
revoke all on function public.officehub_email_mark_sending(uuid,uuid) from public,anon,authenticated;
revoke all on function public.officehub_email_finish(uuid,uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.officehub_email_claim() to service_role;
grant execute on function public.officehub_email_mark_sending(uuid,uuid) to service_role;
grant execute on function public.officehub_email_finish(uuid,uuid,text,text,integer) to service_role;

-- Old browser clients must not be able to fabricate successful delivery records.
revoke insert,update,delete on public.dispatched_emails from anon,authenticated;
commit;
