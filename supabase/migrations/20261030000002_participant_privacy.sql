-- Participant-only records. Administrative UI roles do not bypass membership.
begin;
create or replace function officehub_private.safe_array(j jsonb) returns jsonb language sql immutable set search_path='' as $$select case when jsonb_typeof(j)='array' then j else '[]'::jsonb end$$;
create or replace function officehub_private.task_audience(t jsonb,u uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=u and coalesce(p.app_metadata->>'deactivated','false')<>'true' and (
  t->>'created_by_id'=u::text or t->>'assigned_to_id'=u::text
  or u::text in(select jsonb_array_elements_text(officehub_private.safe_array(t->'assigned_to_ids')))
  or exists(select 1 from public.task_assignees a where a.task_id=t->>'id' and a.user_id=u)
  or (t->>'assignment_type'='department' and lower(btrim(p.organisation))=lower(btrim(t->>'organisation')) and (
   exists(select 1 from jsonb_array_elements_text(officehub_private.safe_array(t->'assigned_departments')) d where public.officehub_department_key(d,p.organisation)=public.officehub_department_key(p.department,p.organisation))
   or (jsonb_array_length(officehub_private.safe_array(t->'assigned_departments'))=0 and public.officehub_department_key(t->>'department',p.organisation)=public.officehub_department_key(p.department,p.organisation))))
  or (t->>'assignment_type'='organization' and (exists(select 1 from jsonb_array_elements_text(officehub_private.safe_array(t->'assigned_organisations')) o where lower(btrim(o))=lower(btrim(p.organisation)))
   or (jsonb_array_length(officehub_private.safe_array(t->'assigned_organisations'))=0 and lower(btrim(t->>'organisation'))=lower(btrim(p.organisation))))
 )))
$$;
create or replace function officehub_private.task_member(k text,u uuid) returns boolean
language sql stable security definer set search_path='' as $$select exists(select 1 from public.tasks t where t.id=k and officehub_private.task_audience(to_jsonb(t),u))$$;
create or replace function officehub_private.task_owner(k text,u uuid) returns boolean
language sql stable security definer set search_path='' as $$select exists(select 1 from public.tasks where id=k and created_by_id=u)$$;
create or replace function officehub_private.meeting_member(k text,u uuid) returns boolean
language sql stable security definer set search_path='' as $$select u is not null and exists(select 1 from public.meetings m where m.id=k and (m.organizer_id=u or m.chair_id=u or exists(select 1 from public.meeting_attendees a where a.meeting_id=m.id and a.user_id=u)))$$;
create or replace function officehub_private.meeting_manager(k text,u uuid) returns boolean
language sql stable security definer set search_path='' as $$select u is not null and exists(select 1 from public.meetings where id=k and (organizer_id=u or chair_id=u))$$;
create or replace function officehub_private.approval_member(k text,u uuid) returns boolean
language sql stable security definer set search_path='' as $$select u is not null and exists(select 1 from public.approvals where id=k and (requested_by_id=u or u::text=any(approver_ids)))$$;

create or replace function public.officehub_can_view_task(k text) returns boolean language sql stable security definer set search_path='' as $$select officehub_private.task_member(k,auth.uid())$$;
create or replace function public.officehub_owns_task(k text) returns boolean language sql stable security definer set search_path='' as $$select officehub_private.task_owner(k,auth.uid())$$;
create or replace function public.officehub_can_view_meeting(k text) returns boolean language sql stable security definer set search_path='' as $$select officehub_private.meeting_member(k,auth.uid())$$;
create or replace function public.officehub_manages_meeting(k text) returns boolean language sql stable security definer set search_path='' as $$select officehub_private.meeting_manager(k,auth.uid())$$;

do $$declare p record;t text;begin
 foreach t in array array['tasks','task_assignees','task_subtasks','task_ratings','meetings','meeting_attendees','approvals'] loop
  for p in select policyname from pg_policies where schemaname='public' and tablename=t loop execute format('drop policy %I on public.%I',p.policyname,t);end loop;
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,public',t);
  execute format('revoke truncate,references,trigger on public.%I from authenticated',t);
  execute format('grant select,insert,update,delete on public.%I to authenticated',t);
 end loop;
end$$;
create policy participant_tasks_read on public.tasks for select to authenticated using(created_by_id=auth.uid() or public.officehub_can_view_task(id));
create policy participant_tasks_create on public.tasks for insert to authenticated with check(created_by_id=auth.uid());
create policy participant_tasks_update on public.tasks for update to authenticated using(public.officehub_can_view_task(id)) with check(public.officehub_can_view_task(id));
create policy participant_tasks_delete on public.tasks for delete to authenticated using(created_by_id=auth.uid());
create policy participant_assignees_read on public.task_assignees for select to authenticated using(public.officehub_can_view_task(task_id));
create policy participant_assignees_write on public.task_assignees for all to authenticated using(public.officehub_owns_task(task_id)) with check(public.officehub_owns_task(task_id));
create policy participant_subtasks_read on public.task_subtasks for select to authenticated using(public.officehub_can_view_task(task_id));
create policy participant_subtasks_create on public.task_subtasks for insert to authenticated with check(public.officehub_can_view_task(task_id));
create policy participant_subtasks_update on public.task_subtasks for update to authenticated using(public.officehub_can_view_task(task_id)) with check(public.officehub_can_view_task(task_id));
create policy participant_subtasks_delete on public.task_subtasks for delete to authenticated using(public.officehub_owns_task(task_id));
create policy participant_ratings_read on public.task_ratings for select to authenticated using(public.officehub_can_view_task(task_id));
create policy participant_ratings_write on public.task_ratings for all to authenticated using(public.officehub_owns_task(task_id)) with check(public.officehub_owns_task(task_id) and rated_by_id=auth.uid());
create policy participant_meetings_read on public.meetings for select to authenticated using(organizer_id=auth.uid() or chair_id=auth.uid() or public.officehub_can_view_meeting(id));
create policy participant_meetings_create on public.meetings for insert to authenticated with check(organizer_id=auth.uid());
create policy participant_meetings_update on public.meetings for update to authenticated using(public.officehub_manages_meeting(id)) with check(public.officehub_manages_meeting(id));
create policy participant_meetings_delete on public.meetings for delete to authenticated using(public.officehub_manages_meeting(id));
create policy participant_attendees_read on public.meeting_attendees for select to authenticated using(public.officehub_can_view_meeting(meeting_id));
create policy participant_attendees_create on public.meeting_attendees for insert to authenticated with check(public.officehub_manages_meeting(meeting_id));
create policy participant_attendees_update on public.meeting_attendees for update to authenticated using(public.officehub_manages_meeting(meeting_id) or (user_id=auth.uid() and public.officehub_can_view_meeting(meeting_id))) with check(public.officehub_manages_meeting(meeting_id) or (user_id=auth.uid() and public.officehub_can_view_meeting(meeting_id)));
create policy participant_attendees_delete on public.meeting_attendees for delete to authenticated using(public.officehub_manages_meeting(meeting_id));
create policy participant_approvals_read on public.approvals for select to authenticated using(requested_by_id=auth.uid() or auth.uid()::text=any(approver_ids));
create policy participant_approvals_create on public.approvals for insert to authenticated with check(requested_by_id=auth.uid() and status='Pending' and cardinality(approver_ids)>0);
create policy participant_approvals_update on public.approvals for update to authenticated using(auth.uid()::text=any(approver_ids) or (requested_by_id=auth.uid() and status='Pending')) with check(requested_by_id=auth.uid() or auth.uid()::text=any(approver_ids));
create policy participant_approvals_delete on public.approvals for delete to authenticated using(requested_by_id=auth.uid() and status='Pending');

create or replace function public.officehub_guard_participant_record() returns trigger language plpgsql set search_path='' as $$
declare u uuid:=auth.uid();actor text;
begin
 if current_user<>'authenticated' then return new;end if;
 select name into actor from public.profiles where id=u;
 if TG_TABLE_NAME='tasks' then
  if TG_OP='INSERT' then
   if new.created_by_id is not null and new.created_by_id<>u then raise exception 'Cannot create a task as another member' using errcode='42501';end if;
   new.created_by_id:=u;new.created_by_name:=actor;
  else
   if (new.id,new.created_by_id,new.created_by_name,new.created_at) is distinct from (old.id,old.created_by_id,old.created_by_name,old.created_at) then raise exception 'Task ownership is immutable' using errcode='42501';end if;
   if old.created_by_id is distinct from u and ((new.assigned_to_id,new.assigned_to_ids,new.assignment_type,new.assigned_departments,new.assigned_organisations,new.organisation,new.department) is distinct from (old.assigned_to_id,old.assigned_to_ids,old.assignment_type,old.assigned_departments,old.assigned_organisations,old.organisation,old.department) or new.rating is distinct from old.rating) then raise exception 'Only the creator may change task access or ratings' using errcode='42501';end if;
  end if;
 elsif TG_TABLE_NAME='meetings' then
  if TG_OP='INSERT' then
   if new.organizer_id is not null and new.organizer_id<>u then raise exception 'Cannot create a meeting as another member' using errcode='42501';end if;
   new.organizer_id:=u;new.organizer_name:=actor;
  elsif (new.id,new.organizer_id,new.organizer_name,new.created_at) is distinct from (old.id,old.organizer_id,old.organizer_name,old.created_at) or (old.organizer_id is distinct from u and new.chair_id is distinct from old.chair_id) then raise exception 'Only the organizer may change the meeting chair; ownership is immutable' using errcode='42501';end if;
 elsif TG_TABLE_NAME='approvals' then
  if TG_OP='INSERT' then
   if new.requested_by_id is not null and new.requested_by_id<>u then raise exception 'Cannot submit as another member' using errcode='42501';end if;
   new.requested_by_id:=u;new.requested_by_name:=actor;
   if coalesce(new.status,'Pending')<>'Pending' then raise exception 'New requests must be pending' using errcode='42501';end if;
   new.status:='Pending';new.approved_by:=null;new.approved_date:=null;
  else
   if (new.id,new.requested_by_id,new.requested_by_name,new.requested_date) is distinct from (old.id,old.requested_by_id,old.requested_by_name,old.requested_date) then raise exception 'Request ownership is immutable' using errcode='42501';end if;
   if new.status is distinct from old.status then
    if not (u::text=any(old.approver_ids)) or old.status not in ('Pending','Under Review') or new.status not in ('Approved','Rejected','Under Review') then raise exception 'Only a selected approver can resolve a pending request' using errcode='42501';end if;
    if (to_jsonb(new)-array['status','approved_by','approved_date','notes']) is distinct from (to_jsonb(old)-array['status','approved_by','approved_date','notes']) then raise exception 'An approver cannot rewrite the request or its audience' using errcode='42501';end if;
    new.approved_by:=actor;new.approved_date:=now()::text;
   elsif old.requested_by_id is distinct from u or old.status<>'Pending' or (new.approved_by,new.approved_date) is distinct from (old.approved_by,old.approved_date) then raise exception 'Only the requester may edit an unresolved submission' using errcode='42501';end if;
  end if;
  if new.approver_ids is null or cardinality(new.approver_ids)=0 or exists(select 1 from unnest(new.approver_ids) a where not exists(select 1 from public.profiles p where p.id::text=a)) then raise exception 'Choose existing members as approvers' using errcode='23514';end if;
 end if;
 return new;
end$$;
create trigger officehub_task_participant_guard before insert or update on public.tasks for each row execute function public.officehub_guard_participant_record();
create trigger officehub_meeting_participant_guard before insert or update on public.meetings for each row execute function public.officehub_guard_participant_record();
create trigger officehub_approval_participant_guard before insert or update on public.approvals for each row execute function public.officehub_guard_participant_record();
create or replace function public.officehub_guard_participant_child() returns trigger language plpgsql set search_path='' as $$
begin
 if current_user<>'authenticated' then return new;end if;
 if TG_TABLE_NAME='meeting_attendees' then
  if TG_OP='UPDATE' and (new.meeting_id,new.user_id) is distinct from (old.meeting_id,old.user_id) then raise exception 'Invitation identity is immutable' using errcode='42501';end if;
  if TG_OP='UPDATE' and not public.officehub_manages_meeting(old.meeting_id) and (to_jsonb(new)-array['status','proposed_date','proposed_time','proposed_end_time','proposal_note','note','comment','responded_at']) is distinct from (to_jsonb(old)-array['status','proposed_date','proposed_time','proposed_end_time','proposal_note','note','comment','responded_at']) then raise exception 'Attendees may change only their own response' using errcode='42501';end if;
 elsif TG_TABLE_NAME='task_subtasks' then
  if TG_OP='UPDATE' and (new.task_id,new.id) is distinct from (old.task_id,old.id) then raise exception 'Subtask identity is immutable' using errcode='42501';end if;
 elsif TG_TABLE_NAME='task_ratings' then
  if TG_OP='UPDATE' and (new.task_id,new.id,new.rated_by_id) is distinct from (old.task_id,old.id,old.rated_by_id) then raise exception 'Rating identity is immutable' using errcode='42501';end if;
  if new.rated_by_id<>auth.uid() or new.rating not between 1 and 5 then raise exception 'Invalid rating author or score' using errcode='42501';end if;
 end if;
 return new;
end$$;
create trigger officehub_invitation_guard before insert or update on public.meeting_attendees for each row execute function public.officehub_guard_participant_child();
create trigger officehub_subtask_guard before insert or update on public.task_subtasks for each row execute function public.officehub_guard_participant_child();
create trigger officehub_rating_guard before insert or update on public.task_ratings for each row execute function public.officehub_guard_participant_child();

create or replace function officehub_private.notification_member(n jsonb,u uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare k text;private_item boolean:=false;
begin
 k:=nullif(n->'metadata'->>'taskId','');if k is not null then private_item:=true;if not officehub_private.task_member(k,u) then return false;end if;end if;
 k:=coalesce(nullif(n->'metadata'->>'meetingId',''),nullif(n->>'meeting_id',''));if k is not null then private_item:=true;if not officehub_private.meeting_member(k,u) then return false;end if;end if;
 k:=nullif(n->'metadata'->>'approvalId','');if k is not null then private_item:=true;if not officehub_private.approval_member(k,u) then return false;end if;end if;
 if not private_item and (n->>'type' in ('task','approval') or n->>'type' like 'meeting%') then return false;end if;
 return true;
end$$;
create or replace function public.officehub_can_view_notification(n public.notifications) returns boolean language sql stable security definer set search_path='' as $$select officehub_private.notification_member(to_jsonb(n),auth.uid())$$;
revoke all on public.notifications,public.dispatched_emails,public.audit_log from anon,public;
create policy participant_audit_privacy on public.audit_log as restrictive for select to authenticated using(actor_id=auth.uid());
create policy participant_notification_privacy on public.notifications as restrictive for select to authenticated using(public.officehub_can_view_notification(notifications));
create policy participant_notification_update_privacy on public.notifications as restrictive for update to authenticated using(public.officehub_can_view_notification(notifications)) with check(public.officehub_can_view_notification(notifications));
create policy participant_notification_delete_privacy on public.notifications as restrictive for delete to authenticated using(public.officehub_can_view_notification(notifications));
create or replace function public.officehub_guard_private_notification() returns trigger language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
 if coalesce(auth.role(),'')<>'authenticated' then return new;end if;
 if TG_OP='UPDATE' then
  if to_jsonb(new)-'read' is distinct from to_jsonb(old)-'read' then raise exception 'Only read state may be changed on a saved notification' using errcode='42501';end if;
  return new;
 end if;
 new.actor_id:=auth.uid();
 if not public.officehub_can_view_notification(new) then raise exception 'No access to the notification record' using errcode='42501';end if;
 if new.type in ('task','approval') or new.type like 'meeting%' or new.metadata ?| array['taskId','meetingId','approvalId'] then
  select id into target from public.profiles p where p.id::text=new.target_user_id or lower(p.email)=lower(new.target_user_id) limit 1;
  if target is null or not officehub_private.notification_member(to_jsonb(new),target) then raise exception 'Choose a permitted recipient for this private update' using errcode='42501';end if;
 end if;
 return new;
end$$;
create trigger officehub_private_notification_guard before insert or update on public.notifications for each row execute function public.officehub_guard_private_notification();
-- Old delivery logs cannot become a side channel for unrelated administrators.
create policy participant_delivery_privacy on public.dispatched_emails as restrictive for select to authenticated using(lower(recipient_email)=lower(auth.email()));

-- Digests and email eligibility use the same explicit department/organisation audience.
create or replace function officehub_private.task_recipients(t jsonb) returns setof uuid language sql stable security definer set search_path='' as $$select p.id from public.profiles p where officehub_private.task_audience(t-'created_by_id',p.id)$$;
-- Caller-only helpers reveal no record data and reject anonymous callers.
revoke all on function officehub_private.safe_array(jsonb),officehub_private.task_audience(jsonb,uuid),officehub_private.task_member(text,uuid),officehub_private.task_owner(text,uuid),officehub_private.meeting_member(text,uuid),officehub_private.meeting_manager(text,uuid),officehub_private.approval_member(text,uuid),officehub_private.notification_member(jsonb,uuid) from public,anon,authenticated;
revoke all on function public.officehub_can_view_task(text),public.officehub_owns_task(text),public.officehub_can_view_meeting(text),public.officehub_manages_meeting(text),public.officehub_can_view_notification(public.notifications) from public,anon;
grant execute on function public.officehub_can_view_task(text),public.officehub_owns_task(text),public.officehub_can_view_meeting(text),public.officehub_manages_meeting(text),public.officehub_can_view_notification(public.notifications) to authenticated;
revoke all on function public.officehub_guard_participant_record(),public.officehub_guard_participant_child(),public.officehub_guard_private_notification() from public,anon,authenticated;
commit;
