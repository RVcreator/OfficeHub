-- One shared status, changed atomically against the version the member reviewed.
begin;
create function public.officehub_set_task_status(p_task text,p_status text,p_expected_version bigint,p_reopen boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.tasks;u uuid:=auth.uid();personal boolean;
begin
 if u is null or coalesce(auth.role(),'')<>'authenticated' then raise exception 'Verified sign-in required' using errcode='42501';end if;
 if p_status is null or p_status not in ('To Do','In Progress','In Review','Done','Cancelled') then raise exception 'Invalid task status' using errcode='23514';end if;
 select * into t from public.tasks where id=p_task for update;
 if not found or not officehub_private.task_member(p_task,u) then raise exception 'Only task members may change this task' using errcode='42501';end if;
 if t.status=p_status then return jsonb_build_object('task',to_jsonb(t),'changed',false,'conflict',false);end if;
 if p_expected_version is null or p_expected_version<>t.delivery_event_version then return jsonb_build_object('task',to_jsonb(t),'changed',false,'conflict',true);end if;
 if t.status='Done' and not coalesce(p_reopen,false) then raise exception 'Confirm changing the completed task for everyone before reopening it' using errcode='42501';end if;
 personal:=coalesce(t.assignment_type='personal',false) or (t.created_by_id=t.assigned_to_id and coalesce(cardinality(t.assigned_to_ids),0)<=1 and coalesce(t.assignment_type,'') not in ('department','organization'));
 update public.tasks set status=p_status,
  completed_at=case when p_status='Done' then now()::text else null end,
  cancelled_at=case when p_status='Cancelled' then now()::text else null end,
  pending_rating=(p_status='Done' and not coalesce(personal,false))
 where id=p_task returning * into t;
 return jsonb_build_object('task',to_jsonb(t),'changed',true,'conflict',false);
end$$;
-- Cached clients cannot bypass the version/explicit-reopen check with a raw update.
create function public.officehub_task_status_guard() returns trigger language plpgsql set search_path='' as $$begin
 if current_user='authenticated' and new.status is distinct from old.status then raise exception 'Refresh OfficeHub to change the shared task status safely' using errcode='42501';end if;
 return new;
end$$;
create trigger officehub_task_status_guard before update on public.tasks for each row execute function public.officehub_task_status_guard();
revoke all on function public.officehub_set_task_status(text,text,bigint,boolean) from public,anon;
grant execute on function public.officehub_set_task_status(text,text,bigint,boolean) to authenticated;
revoke all on function public.officehub_task_status_guard() from public,anon,authenticated;
commit;
