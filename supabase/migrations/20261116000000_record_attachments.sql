begin;
alter table public.tasks add column if not exists attachments jsonb not null default '[]';
alter table public.approvals add column if not exists attachments jsonb not null default '[]';
alter table public.meetings add column if not exists attachments jsonb not null default '[]';
alter table public.notices add column if not exists attachments jsonb not null default '[]';
insert into storage.buckets(id,name,public,file_size_limit) values('officehub-records','officehub-records',false,10485760)
on conflict(id) do update set public=false,file_size_limit=10485760;

-- Invoker semantics deliberately reuse the parent's current RLS, including
-- reassignment, revocation and archived records. Unlinked staged files are unreadable.
create function public.officehub_can_read_record_file(p_path text) returns boolean
language plpgsql stable security invoker set search_path='' as $$
declare kind text:=split_part(p_path,'/',1);k text:=split_part(p_path,'/',2);files jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and coalesce(app_metadata->>'deactivated','false')<>'true') then return false;end if;
 case kind
 when 'task' then select attachments into files from public.tasks where id=k;
 when 'approval' then select attachments into files from public.approvals where id=k;
 when 'meeting' then select attachments into files from public.meetings where id=k;
 when 'notice' then select attachments into files from public.notices where id=k;
 else return false;end case;
 return exists(select 1 from jsonb_array_elements(coalesce(files,'[]')) a where a->>'url'='storage://officehub-records/'||p_path);
end$$;
revoke all on function public.officehub_can_read_record_file(text) from public,anon;
grant execute on function public.officehub_can_read_record_file(text) to authenticated;
create policy record_file_read on storage.objects for select to authenticated using(bucket_id='officehub-records' and public.officehub_can_read_record_file(name));
create policy record_file_read_guard on storage.objects as restrictive for select to authenticated using(bucket_id<>'officehub-records' or public.officehub_can_read_record_file(name));
create policy record_file_stage on storage.objects for insert to authenticated with check(bucket_id='officehub-records' and split_part(name,'/',1) in ('task','approval','meeting','notice') and array_length(string_to_array(name,'/'),1)=4 and split_part(name,'/',2)~'^[A-Za-z0-9_-]+$' and split_part(name,'/',3)=auth.uid()::text and exists(select 1 from public.profiles where id=auth.uid() and coalesce(app_metadata->>'deactivated','false')<>'true'));
create policy record_file_stage_guard on storage.objects as restrictive for insert to authenticated with check(bucket_id<>'officehub-records' or (split_part(name,'/',1) in ('task','approval','meeting','notice') and array_length(string_to_array(name,'/'),1)=4 and split_part(name,'/',2)~'^[A-Za-z0-9_-]+$' and split_part(name,'/',3)=auth.uid()::text and exists(select 1 from public.profiles where id=auth.uid() and coalesce(app_metadata->>'deactivated','false')<>'true')));
create policy record_file_no_replace on storage.objects as restrictive for update to authenticated using(bucket_id<>'officehub-records') with check(bucket_id<>'officehub-records');
create policy record_file_no_delete on storage.objects as restrictive for delete to authenticated using(bucket_id<>'officehub-records');
create policy record_file_no_anonymous on storage.objects as restrictive for all to anon using(bucket_id<>'officehub-records') with check(bucket_id<>'officehub-records');

create function public.officehub_guard_record_files() returns trigger language plpgsql security definer set search_path='' as $$
declare a jsonb;path text;kind text;bytes bigint;total bigint:=0;previous jsonb:='[]';
begin
 if TG_OP='UPDATE' then
  if new.attachments is not distinct from old.attachments then return new;end if;
  previous:=old.attachments;
  if TG_TABLE_NAME='approvals' then
   if coalesce(auth.role(),'')='authenticated' and auth.uid() is distinct from old.requested_by_id then raise exception 'Only the requester may change approval attachments' using errcode='42501';end if;
  end if;
 end if;
 if jsonb_typeof(new.attachments) is distinct from 'array' or jsonb_array_length(new.attachments)>10 then raise exception 'Attach up to 10 files';end if;
 kind:=case TG_TABLE_NAME when 'tasks' then 'task' when 'approvals' then 'approval' when 'meetings' then 'meeting' else 'notice' end;
 for a in select value from jsonb_array_elements(new.attachments) loop
  if coalesce(length(a->>'id'),0) not between 1 and 200 or coalesce(length(a->>'name'),0) not between 1 and 255 or coalesce(a->>'type','') not in ('pdf','docx','xlsx','image','file') or a ? 'textContent' or a ? 'sheetData' then raise exception 'Invalid attachment details';end if;
  -- Preserve selected Microsoft document links; Microsoft remains authoritative
  -- for their existing access. Browser-local and executable URLs are never saved.
  if a->>'url' ~ '^https://wipahstz\.sharepoint\.com/' then continue;end if;
  if left(a->>'url',28) is distinct from 'storage://officehub-records/' then raise exception 'Upload the original attachment before saving';end if;
  path:=substr(a->>'url',29);
  if split_part(path,'/',1)<>kind or split_part(path,'/',2)<>new.id or array_length(string_to_array(path,'/'),1)<>4 then raise exception 'Attachment belongs to another record' using errcode='42501';end if;
  if coalesce(auth.role(),'')='authenticated' and split_part(path,'/',3)<>auth.uid()::text and not exists(select 1 from jsonb_array_elements(previous) p where p->>'url'=a->>'url') then raise exception 'Attachment belongs to another uploader' using errcode='42501';end if;
  select (metadata->>'size')::bigint into bytes from storage.objects where bucket_id='officehub-records' and name=path;
  if bytes is null or bytes>10485760 then raise exception 'Attachment upload is missing or exceeds 10 MB';end if;
  total:=total+bytes;if total>20971520 then raise exception 'Attach no more than 20 MB in total';end if;
 end loop;
 return new;
end$$;
revoke all on function public.officehub_guard_record_files() from public,anon,authenticated;
create trigger officehub_task_files before insert or update of attachments on public.tasks for each row execute function public.officehub_guard_record_files();
create trigger officehub_approval_files before insert or update of attachments on public.approvals for each row execute function public.officehub_guard_record_files();
create trigger officehub_meeting_files before insert or update of attachments on public.meetings for each row execute function public.officehub_guard_record_files();
create trigger officehub_notice_files before insert or update of attachments on public.notices for each row execute function public.officehub_guard_record_files();

-- Keep the existing meeting transaction and Microsoft queue intact. The file
-- binding participates in the same transaction and rolls back on a failed save.
create function public.officehub_save_meeting_files(p_id text,p_changes jsonb,p_attendees jsonb default null,p_create boolean default false)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;saved public.meetings;
begin
 result:=public.officehub_save_meeting(p_id,p_changes,p_attendees,p_create);
 if p_changes ? 'attachments' then
  update public.meetings set attachments=p_changes->'attachments' where id=p_id returning * into saved;
  if not found then raise exception 'Meeting attachments were not saved' using errcode='42501';end if;
  result:=jsonb_set(result,'{meeting}',to_jsonb(saved));
 end if;
 return result;
end$$;
revoke all on function public.officehub_save_meeting_files(text,jsonb,jsonb,boolean) from public,anon;
grant execute on function public.officehub_save_meeting_files(text,jsonb,jsonb,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
