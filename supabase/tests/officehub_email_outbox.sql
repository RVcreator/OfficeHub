-- Run after the migration inside the SAME transaction, then ROLLBACK.
-- No Graph calls or scheduler are used. Uses existing verified internal users.
do $$
declare a uuid; b uuid; n integer; first_job public.officehub_email_outbox; second_job public.officehub_email_outbox;
begin
  select p.id into a from public.profiles p join auth.users u on p.id=u.id
    where u.email_confirmed_at is not null and u.email ilike '%@wipahs.org' order by p.id limit 1;
  select p.id into b from public.profiles p join auth.users u on p.id=u.id
    where u.email_confirmed_at is not null and u.email ilike '%@wipahs.org' and p.id<>a order by p.id limit 1;
  if a is null or b is null then raise exception 'Need two verified internal test accounts'; end if;
  update officehub_private.email_settings set capture_enabled=true;

  insert into public.tasks(id,title,assigned_to_id,assigned_to_ids,created_by_id) values
    ('email-validation-task','Email validation',a,array[a::text],b);
  select count(*) into n from public.officehub_email_outbox where event_type='task_assigned';
  if n<>1 then raise exception 'Expected one assignment job, got %',n; end if;
  update public.tasks set assigned_to_id=a,assigned_to_ids=array[a::text] where id='email-validation-task';
  if (select count(*) from public.officehub_email_outbox)<>1 then raise exception 'Noop task write duplicated email'; end if;
  insert into public.task_assignees(task_id,user_id) values ('email-validation-task',a);
  if (select count(*) from public.officehub_email_outbox)<>1 then raise exception 'Relation duplicated canonical assignment'; end if;
  update public.tasks set assigned_to_id=b,assigned_to_ids=array[b::text] where id='email-validation-task';
  if (select count(*) from public.officehub_email_outbox where event_type='task_assigned')<>2 then raise exception 'Delegation recipient missing'; end if;
  insert into public.task_subtasks(id,task_id,title) values ('email-validation-subtask','email-validation-task','Validation subtask');
  if not exists(select 1 from public.officehub_email_outbox where event_type='subtask') then raise exception 'Subtask event missing'; end if;

  insert into public.notices(id,title,content,author_id,author_name,author_role,created_at,target_audience_type,target_user_ids)
    values ('email-validation-notice','Private notice','Test',b,'Test','Staff',now()::text,'selected_people',array[a::text]);
  if (select count(*) from public.officehub_email_outbox where event_type='notice')<>1
    or exists(select 1 from public.officehub_email_outbox where event_type='notice' and recipient_id<>a)
    then raise exception 'Notice audience leaked'; end if;
  insert into public.notice_acknowledgements(notice_id,user_id,acknowledged_at)
    values ('email-validation-notice',a,now()::text);
  perform officehub_private.enqueue_email('dedup-test','test','test',a,'Test','Test');
  perform officehub_private.enqueue_email('dedup-test','test','test',a,'Test','Test');
  if (select count(*) from public.officehub_email_outbox where event_key='dedup-test')<>1 then raise exception 'Dedup failed'; end if;

  insert into public.approvals(id,title,description,requested_by_id,requested_by_name,requested_date,approver_ids,status)
    values ('email-validation-approval','Validation approval','Test request',b,'Test',now()::text,array[a::text],'Pending');
  if (select count(*) from public.officehub_email_outbox where event_type='approval_requested')<>1 then raise exception 'Approval recipient missing'; end if;
  update public.approvals set status='Approved' where id='email-validation-approval';
  if not exists(select 1 from public.officehub_email_outbox where event_type='approval_status' and recipient_id=b) then raise exception 'Approval response missing'; end if;

  insert into public.meetings(id,title,date,start_time,end_time,organizer_id,organizer_name)
    values ('email-validation-meeting','Validation meeting','2099-01-01','10:00','11:00',b,'Test');
  insert into public.meeting_attendees(meeting_id,user_id,name,email,status)
    values ('email-validation-meeting',a,'Test','spoofed@example.com','Pending');
  if not exists(select 1 from public.officehub_email_outbox where event_type='meeting_invite' and recipient_id=a and recipient_email<>'spoofed@example.com') then raise exception 'Meeting recipient not resolved from Auth'; end if;
  update public.meeting_attendees set status='Accepted' where meeting_id='email-validation-meeting' and user_id=a;
  if not exists(select 1 from public.officehub_email_outbox where event_type='meeting_rsvp' and recipient_id=b) then raise exception 'RSVP missing'; end if;

  if has_table_privilege('authenticated','public.officehub_email_outbox','INSERT')
    or has_function_privilege('authenticated','public.officehub_email_claim()','EXECUTE')
    or has_schema_privilege('authenticated','officehub_private','USAGE') then raise exception 'Queue privileges exposed'; end if;
  if not (select relrowsecurity from pg_class where oid='public.officehub_email_outbox'::regclass) then raise exception 'RLS disabled'; end if;
  if exists(select 1 from public.officehub_email_claim()) then raise exception 'Paused queue claimed'; end if;
  update officehub_private.email_settings set delivery_enabled=true;
  update public.officehub_email_outbox set available_at=now()-interval '1 second';
  select * into first_job from public.officehub_email_claim();
  select * into second_job from public.officehub_email_claim();
  if first_job.id is null or first_job.id=second_job.id then raise exception 'Claim lease failed'; end if;
  if public.officehub_email_mark_sending(first_job.id,gen_random_uuid()) then raise exception 'Wrong lease accepted'; end if;
  if not public.officehub_email_mark_sending(first_job.id,first_job.lease_token) then raise exception 'Valid lease rejected'; end if;
  if exists(select 1 from public.officehub_email_outbox where event_type='approval_requested' and status<>'cancelled') then raise exception 'Resolved approval request stayed sendable'; end if;
  update public.officehub_email_outbox set lease_until=now()-interval '1 second' where id=first_job.id;
  perform public.officehub_email_claim();
  if (select status from public.officehub_email_outbox where id=first_job.id)<>'review' then raise exception 'Ambiguous send retried'; end if;
  raise notice 'OfficeHub email migration and transactional assertions passed';
end $$;
