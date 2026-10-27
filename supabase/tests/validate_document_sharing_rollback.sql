begin;
create table public.officehub_document_grants (
  document_id text not null references public.sharepoint_documents(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  access_role text not null check(access_role in ('read','write')),
  permission_id text not null check(length(permission_id)>0),
  confirmed_at timestamptz not null default now(),
  primary key(document_id,recipient_id)
);
alter table public.officehub_document_grants enable row level security;
revoke all on public.officehub_document_grants from public,anon,authenticated;
grant select on public.officehub_document_grants to authenticated;
grant all on public.officehub_document_grants to service_role;
create policy "Recipients read confirmed document access" on public.officehub_document_grants for select to authenticated using(recipient_id=auth.uid());

-- Only a server-confirmed Microsoft grant can produce a document email/alert.
create function public.officehub_commit_document_shares(p_document text,p_settings jsonb,p_grants jsonb,p_actor uuid)
returns void language plpgsql security definer set search_path='' as $$
declare d public.sharepoint_documents; g jsonb; previous_role text; recipient uuid; event_key text;
begin
  select * into strict d from public.sharepoint_documents where id=p_document for update;
  if d.graph_drive_item_id is null then raise exception 'Microsoft file is required'; end if;
  if p_settings->>'visibility' not in ('Everyone','Department','Specific People') then raise exception 'Invalid audience'; end if;
  update public.sharepoint_documents set
    visibility=p_settings->>'visibility',target_department=p_settings->>'targetDepartment',
    allowed_user_ids=array(select jsonb_array_elements_text(p_settings->'allowedUserIds')),
    editable_user_ids=array(select jsonb_array_elements_text(p_settings->'editableUserIds')),
    synced_with_sharepoint=true where id=p_document;
  for g in select * from jsonb_array_elements(p_grants) loop
    recipient:=(g->>'recipient_id')::uuid;
    if not exists(select 1 from auth.users u join public.profiles p on p.id=u.id where u.id=recipient and u.email_confirmed_at is not null and lower(trim(u.email)) ~ '^[^[:space:]@]+@wipahs[.]org$') then raise exception 'Verified internal recipient required'; end if;
    select access_role into previous_role from public.officehub_document_grants where document_id=p_document and recipient_id=recipient;
    insert into public.officehub_document_grants(document_id,recipient_id,access_role,permission_id)
      values(p_document,recipient,g->>'access_role',g->>'permission_id')
      on conflict(document_id,recipient_id) do update set access_role=excluded.access_role,permission_id=excluded.permission_id,confirmed_at=now();
    if recipient is distinct from p_actor and previous_role is distinct from g->>'access_role' then
      event_key:='document-shared:'||p_document||':'||recipient||':'||(g->>'access_role');
      insert into public.notifications(id,title,message,type,target_user_id,actor_id,actor_name,priority,metadata,created_at,pushed_to_microsoft_teams)
        values(event_key,'Document shared: '||d.name,'A document has been shared with you. Open OfficeHub to view it.','document',recipient::text,p_actor,
          (select name from public.profiles where id=p_actor),'Normal',jsonb_build_object('documentId',p_document,'accessRole',g->>'access_role'),now()::text,false)
        on conflict(id) do nothing;
      perform officehub_private.enqueue_email(event_key,'document_shared',p_document,recipient,
        '[OfficeHub] Document shared: '||d.name,
        'The document "'||d.name||'" has been shared with you with '||(g->>'access_role')||' access. Sign in to OfficeHub and open SharePoint Documents using your work Microsoft account.');
    end if;
  end loop;
end $$;
revoke all on function public.officehub_commit_document_shares(text,jsonb,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.officehub_commit_document_shares(text,jsonb,jsonb,uuid) to service_role;

-- Replace overlapping permissive policies: frontend labels are not authorization.
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='sharepoint_documents' loop
    execute format('drop policy %I on public.sharepoint_documents',p.policyname);
  end loop;
end $$;
create policy "Document audience reads" on public.sharepoint_documents for select to authenticated using(
  public.is_admin() or created_by_id=auth.uid() or visibility in ('Everyone','All')
  or (visibility='Department' and lower(trim(target_department))=lower(trim(public.current_department())))
  or auth.uid()::text=any(allowed_user_ids) or auth.uid()::text=any(editable_user_ids));
create policy "Document owners insert" on public.sharepoint_documents for insert to authenticated with check(created_by_id=auth.uid() and graph_drive_item_id is null);
create policy "Document owners update" on public.sharepoint_documents for update to authenticated using(created_by_id=auth.uid() or public.is_admin()) with check(created_by_id=auth.uid() or public.is_admin());
create policy "Document owners delete" on public.sharepoint_documents for delete to authenticated using(created_by_id=auth.uid() or public.is_admin());
create function officehub_private.protect_document_sharing() returns trigger language plpgsql set search_path='' as $$
begin
  if auth.role()='authenticated' and (new.created_by_id is distinct from old.created_by_id or new.graph_drive_item_id is distinct from old.graph_drive_item_id or new.visibility is distinct from old.visibility or new.target_department is distinct from old.target_department or new.allowed_user_ids is distinct from old.allowed_user_ids or new.editable_user_ids is distinct from old.editable_user_ids or new.web_url is distinct from old.web_url) then
    raise exception 'Use the secure document-sharing service to update access';
  end if;
  return new;
end $$;
create trigger officehub_protect_document_sharing before update on public.sharepoint_documents for each row execute function officehub_private.protect_document_sharing();
create or replace function officehub_private.email_recipient_is_current(p_type text,p_entity text,p_recipient uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when p_type='document_shared' then exists(select 1 from public.officehub_document_grants g join public.sharepoint_documents d on d.id=g.document_id where g.document_id=p_entity and g.recipient_id=p_recipient and (d.created_by_id=p_recipient or d.visibility in ('Everyone','All') or (d.visibility='Department' and d.target_department=(select department from public.profiles where id=p_recipient)) or p_recipient::text=any(d.allowed_user_ids) or p_recipient::text=any(d.editable_user_ids)))
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



do $$ begin
  if has_function_privilege('authenticated','public.officehub_commit_document_shares(text,jsonb,jsonb,uuid)','EXECUTE') then raise exception 'Frontend may not confirm Microsoft grants'; end if;
  if has_table_privilege('authenticated','public.officehub_document_grants','INSERT') then raise exception 'Frontend may not forge grants'; end if;
  if not has_function_privilege('service_role','public.officehub_commit_document_shares(text,jsonb,jsonb,uuid)','EXECUTE') then raise exception 'Worker confirmation privilege missing'; end if;
end $$;
select 'Document sharing migration and privilege checks passed; rolled back' as validation_result;
rollback;
