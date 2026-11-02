-- One committed task transition owns its alerts. Subtasks never enqueue email.
begin;
alter table public.tasks add column delivery_event_version bigint not null default 0;
alter table public.task_subtasks add column completion_event_version bigint not null default 0;
create function public.officehub_delivery_version() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_TABLE_NAME='tasks' then
  if TG_OP='INSERT' then new.delivery_event_version:=1;
  else
   if new.status is not distinct from old.status then
    new.completed_at:=old.completed_at;new.cancelled_at:=old.cancelled_at;
    if new.rating is not distinct from old.rating then new.pending_rating:=old.pending_rating;end if;
   end if;
   new.delivery_event_version:=old.delivery_event_version+case when
    (new.status,new.assigned_to_id,new.assigned_to_ids,new.assignment_type,new.assigned_departments,new.assigned_organisations,new.organisation,new.department,coalesce(new.rating,'{}')-'ratedAt')
    is distinct from (old.status,old.assigned_to_id,old.assigned_to_ids,old.assignment_type,old.assigned_departments,old.assigned_organisations,old.organisation,old.department,coalesce(old.rating,'{}')-'ratedAt') then 1 else 0 end;
  end if;
 else
  if TG_OP='INSERT' then new.completion_event_version:=0;
  else new.completion_event_version:=old.completion_event_version+case when new.completed and not coalesce(old.completed,false) then 1 else 0 end;end if;
 end if;return new;
end$$;
create trigger officehub_task_delivery_version before insert or update on public.tasks for each row execute function public.officehub_delivery_version();
create trigger officehub_subtask_delivery_version before insert or update on public.task_subtasks for each row execute function public.officehub_delivery_version();
create function officehub_private.task_alert(k text,t text,r uuid,a uuid,heading text,body text,kind text,extra jsonb default '{}') returns void language plpgsql security definer set search_path='' as $$
begin
 if r is null then return;end if;
 insert into public.notifications(id,title,message,type,target_user_id,actor_id,actor_name,actor_avatar,created_at,read,priority,metadata,email_triggered,pushed_to_microsoft_teams)
 select k||':'||r,heading,body,kind,r::text,a,p.name,p.avatar,now()::text,false,'Normal',jsonb_build_object('taskId',t,'eventKey',k)||extra,false,false from public.profiles p where p.id=a
 on conflict(id) do nothing;
end$$;
create or replace function officehub_private.email_task_event() returns trigger language plpgsql security definer set search_path='' as $$
declare previous jsonb:='{}';r uuid;k text;a uuid:=coalesce(auth.uid(),new.created_by_id);kind text;
begin
 if TG_OP='UPDATE' then
  if new.delivery_event_version=old.delivery_event_version then return new;end if;
  previous:=to_jsonb(old);
 end if;
 k:='task-event:'||new.id||':'||new.delivery_event_version;
 if TG_OP='INSERT' then
  perform officehub_private.task_alert('task-created:'||new.id,new.id,new.created_by_id,a,'Task created: '||new.title,'Your task "'||new.title||'" was created successfully.','task');
 end if;
 for r in select * from officehub_private.task_recipients(to_jsonb(new)) except select * from officehub_private.task_recipients(previous) loop
  if r is distinct from a then
   perform officehub_private.task_alert(k||':assigned',new.id,r,a,'New Task Assigned: '||new.title,'You have been assigned "'||new.title||'". Open OfficeHub for details.','task');
   perform officehub_private.enqueue_email(k||':assigned','task_assigned',new.id,r,'[OfficeHub] Task assigned: '||new.title,'You have been assigned "'||new.title||'". Due: '||coalesce(new.due_date,'Not specified')||'. Sign in to OfficeHub to review it.');
  end if;
 end loop;
 if TG_OP='UPDATE' and new.status is distinct from old.status and new.created_by_id is distinct from a then
  kind:=case when new.status='Done' and new.pending_rating then 'task_rating_required' else 'task' end;
  perform officehub_private.task_alert(k||':status',new.id,new.created_by_id,a,'Task '||case when new.status='Done' then 'completed' else new.status end||': '||new.title,'The task "'||new.title||'" is now '||new.status||case when kind='task_rating_required' then '. Your performance rating is required.' else '.' end,kind,jsonb_build_object('requiresRating',coalesce(new.pending_rating,false),'completedAt',new.completed_at));
  perform officehub_private.enqueue_email(k||':status','task_status',new.id,new.created_by_id,'[OfficeHub] Task '||new.status||': '||new.title,'The task "'||new.title||'" is now '||new.status||'. Sign in to OfficeHub for details.');
 end if;
 if TG_OP='UPDATE' and new.rating is not null and (new.rating-'ratedAt') is distinct from (coalesce(old.rating,'{}')-'ratedAt') then
  update public.notifications set read=true where type='task_rating_required' and target_user_id=new.created_by_id::text and metadata->>'taskId'=new.id;
  for r in select * from officehub_private.task_recipients(to_jsonb(new)) loop
   if r is distinct from a then perform officehub_private.task_alert(k||':rated',new.id,r,a,'Performance Rating: '||new.title,'Your work on "'||new.title||'" has been rated. Open OfficeHub to view the rating.','task',jsonb_build_object('stars',new.rating->'stars'));end if;
  end loop;
 end if;
 return new;
end$$;
create or replace function officehub_private.email_subtask_event() returns trigger language plpgsql security definer set search_path='' as $$
declare t public.tasks;r uuid;a uuid;k text;
begin
 if TG_OP<>'UPDATE' or not new.completed or coalesce(old.completed,false) then return new;end if;
 select * into t from public.tasks where id=new.task_id;
 a:=coalesce(auth.uid(),t.created_by_id);k:='subtask-completed:'||new.id||':'||new.completion_event_version;
 for r in select * from officehub_private.task_recipients(to_jsonb(t)) union select t.created_by_id loop
  if r is distinct from a then perform officehub_private.task_alert(k,t.id,r,a,'Subtask completed: '||new.title,'Subtask "'||new.title||'" in "'||t.title||'" has been completed.','subtask_completed',jsonb_build_object('subtaskId',new.id));end if;
 end loop;
 return new;
end$$;
-- Preserve the full current eligibility function (including digest rules).
do $$declare definition text;begin
 definition:=pg_get_functiondef('officehub_private.email_recipient_is_current(text,text,uuid)'::regprocedure);
 definition:=replace(definition,'officehub_private.email_recipient_is_current(','officehub_private.email_recipient_before_subtask_stop(');
 if strpos(definition,'officehub_private.email_recipient_before_subtask_stop(')=0 then raise exception 'Cannot preserve existing email eligibility rules';end if;
 execute definition;
end$$;
create or replace function officehub_private.email_recipient_is_current(p_type text,p_entity text,p_recipient uuid) returns boolean language sql stable security definer set search_path='' as $$select case when p_type='subtask' then false else officehub_private.email_recipient_before_subtask_stop(p_type,p_entity,p_recipient) end$$;
-- Stop pending/claimed subtask mail too. Already accepted email is not recalled.
update public.officehub_email_outbox set status='cancelled',lease_until=null,last_error='Subtask updates are in-app only' where event_type='subtask' and status in ('queued','retry','processing');
create function public.officehub_task_alert_source_guard() returns trigger language plpgsql set search_path='' as $$begin
 if current_user='authenticated' and new.metadata ? 'taskId' and new.type in ('task','task_rating_required','subtask_completed') then raise exception 'Task alerts are created automatically after the saved action. Refresh OfficeHub.' using errcode='42501';end if;
 return new;
end$$;
create trigger officehub_task_alert_source before insert on public.notifications for each row execute function public.officehub_task_alert_source_guard();
revoke all on function officehub_private.task_alert(text,text,uuid,uuid,text,text,text,jsonb),officehub_private.email_recipient_before_subtask_stop(text,text,uuid),officehub_private.email_recipient_is_current(text,text,uuid),public.officehub_delivery_version(),public.officehub_task_alert_source_guard() from public,anon,authenticated;
commit;
