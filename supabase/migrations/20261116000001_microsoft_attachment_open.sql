begin;
-- Server-owned Microsoft identities; never accept drive/item/recipient IDs from browsers.
create table public.officehub_attachment_microsoft_files(
 source_url text primary key, drive_id text not null,item_id text not null,web_url text not null,
 created_at timestamptz not null default now(),unique(drive_id,item_id)
);
create table public.officehub_attachment_microsoft_grants(
 source_url text not null references public.officehub_attachment_microsoft_files(source_url),
 user_id uuid not null,permission_id text not null,created_at timestamptz not null default now(),
 primary key(source_url,user_id)
);
alter table public.officehub_attachment_microsoft_files enable row level security;
alter table public.officehub_attachment_microsoft_grants enable row level security;
revoke all on public.officehub_attachment_microsoft_files,public.officehub_attachment_microsoft_grants from public,anon,authenticated;
grant all on public.officehub_attachment_microsoft_files,public.officehub_attachment_microsoft_grants to service_role;

-- Used only by the service worker to remove grants after unlinking/reassignment.
-- Match the same parent policies as authenticated reads; admin titles never bypass membership.
create function officehub_private.attachment_member(p_url text,p_user uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare path text;k text;kind text;files jsonb;n public.notices;p public.profiles;
begin
 if not officehub_private.administration_active_user(p_user) then return false;end if;
 if left(p_url,25)='storage://officehub-chat/' then
  path:=substr(p_url,26);
  return exists(select 1 from public.message_attachments a join public.messages m on m.id=a.message_id where a.url=p_url and m.conversation_id=split_part(path,'/',1) and officehub_private.chat_member(m.conversation_id,p_user));
 end if;
 if left(p_url,28)<>'storage://officehub-records/' then return false;end if;
 path:=substr(p_url,29);kind:=split_part(path,'/',1);k:=split_part(path,'/',2);
 case kind
 when 'task' then
  if not officehub_private.task_member(k,p_user) then return false;end if;
  select attachments into files from public.tasks where id=k;
 when 'approval' then
  if not officehub_private.approval_member(k,p_user) then return false;end if;
  select attachments into files from public.approvals where id=k;
 when 'meeting' then
  if not officehub_private.meeting_member(k,p_user) then return false;end if;
  select attachments into files from public.meetings where id=k;
 when 'notice' then
  select * into n from public.notices where id=k;
  select * into p from public.profiles where id=p_user;
  if n.id is null or not ((officehub_private.administration_can_manage(p_user) and officehub_private.administration_legacy_privilege(p_user)) or n.department=p.department or n.department='All Departments') then return false;end if;
  files:=n.attachments;
 else return false;
 end case;
 return exists(select 1 from jsonb_array_elements(coalesce(files,'[]')) a where a->>'url'=p_url);
end$$;
revoke all on function officehub_private.attachment_member(text,uuid) from public,anon,authenticated;
create function public.officehub_stale_attachment_grants(p_limit integer default 3)
returns table(source_url text,user_id uuid,permission_id text,drive_id text,item_id text)
language sql stable security definer set search_path='' as $$
 select g.source_url,g.user_id,g.permission_id,f.drive_id,f.item_id
 from public.officehub_attachment_microsoft_grants g join public.officehub_attachment_microsoft_files f using(source_url)
 where not officehub_private.attachment_member(g.source_url,g.user_id)
 order by g.created_at limit least(greatest(p_limit,1),3)
$$;
revoke all on function public.officehub_stale_attachment_grants(integer) from public,anon,authenticated;
grant execute on function public.officehub_stale_attachment_grants(integer) to service_role;
notify pgrst,'reload schema';
commit;
