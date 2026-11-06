begin;
alter table public.tasks add column if not exists general_update jsonb;
alter table public.tasks add column if not exists general_update_version bigint not null default 0;

-- Security invoker deliberately retains the existing participant RLS rules.
create or replace function public.officehub_save_task_update(p_task_id text,p_text text,p_expected jsonb default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare existing jsonb; saved jsonb; version bigint; author_name text; trimmed text:=btrim(coalesce(p_text,''));
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if length(trimmed)>20000 then raise exception 'Task updates must be 20,000 characters or fewer'; end if;
  select name into author_name from public.profiles where id=auth.uid();
  if author_name is null then raise exception 'Staff account required' using errcode='42501'; end if;
  select general_update,general_update_version into existing,version from public.tasks where id=p_task_id for update;
  if not found then raise exception 'Task not found or permission denied' using errcode='42501'; end if;
  -- A repeated successful submission is safe even if the response was lost.
  if (existing is null and trimmed='') or (existing->>'text'=trimmed and existing->>'authorId'=auth.uid()::text) then
    return jsonb_build_object('conflict',false,'update',existing,'version',version);
  end if;
  if existing is distinct from p_expected then
    return jsonb_build_object('conflict',true,'update',existing,'version',version);
  end if;
  saved:=case when trimmed='' then null else jsonb_build_object('text',trimmed,'authorId',auth.uid(),'authorName',author_name,'updatedAt',clock_timestamp()) end;
  update public.tasks set general_update=saved,general_update_version=general_update_version+1 where id=p_task_id returning general_update,general_update_version into saved,version;
  if not found then raise exception 'Task update was not saved: permission denied' using errcode='42501'; end if;
  return jsonb_build_object('conflict',false,'update',saved,'version',version);
end $$;
revoke all on function public.officehub_save_task_update(text,text,jsonb) from public,anon;
grant execute on function public.officehub_save_task_update(text,text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
