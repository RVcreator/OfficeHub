begin;
alter table public.sharepoint_documents add column deleted_at timestamptz, add column deleted_by uuid, add column deletion_pending_at timestamptz;
-- Recoverable tombstones retain file IDs and sharing history for retry/reconciliation.
create policy "Deleted documents stay hidden" on public.sharepoint_documents as restrictive for select to authenticated using(deleted_at is null);
revoke delete on public.sharepoint_documents from authenticated,anon;
create function officehub_private.protect_document_lifecycle() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' then
    if auth.role()='authenticated' then raise exception 'Use the Microsoft document deletion service'; end if;
    return old;
  end if;
  if auth.role()='authenticated' and (new.deleted_at is distinct from old.deleted_at or new.deleted_by is distinct from old.deleted_by or new.deletion_pending_at is distinct from old.deletion_pending_at or new.name is distinct from old.name or new.folder is distinct from old.folder or new.modified_at is distinct from old.modified_at or new.modified_by is distinct from old.modified_by or new.size is distinct from old.size or new.file_type is distinct from old.file_type or new.version is distinct from old.version or new.synced_with_sharepoint is distinct from old.synced_with_sharepoint) then
    raise exception 'Use the Microsoft document service to change file state';
  end if;
  if old.deleted_at is not null and (new.visibility is distinct from old.visibility or new.allowed_user_ids is distinct from old.allowed_user_ids or new.editable_user_ids is distinct from old.editable_user_ids or new.target_department is distinct from old.target_department) then raise exception 'Deleted documents cannot be shared'; end if;
  if old.deletion_pending_at is not null and (new.visibility is distinct from old.visibility or new.allowed_user_ids is distinct from old.allowed_user_ids or new.editable_user_ids is distinct from old.editable_user_ids or new.target_department is distinct from old.target_department) then raise exception 'Document deletion is pending'; end if;
  return new;
end $$;
create trigger officehub_protect_document_lifecycle before update or delete on public.sharepoint_documents for each row execute function officehub_private.protect_document_lifecycle();
create function public.officehub_prepare_document_delete(p_document text,p_item text,p_actor uuid) returns void language plpgsql security definer set search_path='' as $$
declare d public.sharepoint_documents;
begin
  select * into strict d from public.sharepoint_documents where id=p_document for update;
  if d.graph_drive_item_id is distinct from p_item or nullif(p_item,'') is null then raise exception 'Microsoft file identity changed'; end if;
  if not exists(select 1 from public.profiles where id=p_actor) then raise exception 'Staff account required'; end if;
  if d.deleted_at is null then update public.sharepoint_documents set deletion_pending_at=coalesce(deletion_pending_at,now()) where id=p_document; end if;
end $$;
create function public.officehub_finish_document_delete(p_document text,p_item text,p_actor uuid) returns void language plpgsql security definer set search_path='' as $$
begin
  update public.sharepoint_documents set deleted_at=coalesce(deleted_at,now()),deleted_by=coalesce(deleted_by,p_actor),deletion_pending_at=null,synced_with_sharepoint=false
    where id=p_document and graph_drive_item_id=p_item and (deletion_pending_at is not null or deleted_at is not null);
  if not found then raise exception 'Prepared Microsoft file identity required'; end if;
end $$;
revoke all on function public.officehub_prepare_document_delete(text,text,uuid),public.officehub_finish_document_delete(text,text,uuid) from public,anon,authenticated;
grant execute on function public.officehub_prepare_document_delete(text,text,uuid),public.officehub_finish_document_delete(text,text,uuid) to service_role;
-- Preserve the existing sharing implementation and all its recipient validation.
alter function public.officehub_commit_document_shares(text,jsonb,jsonb,uuid) rename to officehub_commit_document_shares_before_lifecycle;
create function public.officehub_commit_document_shares(p_document text,p_settings jsonb,p_grants jsonb,p_actor uuid) returns void language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.sharepoint_documents where id=p_document and deleted_at is null and deletion_pending_at is null for update;
  if not found then raise exception 'Document unavailable or deletion pending'; end if;
  perform public.officehub_commit_document_shares_before_lifecycle(p_document,p_settings,p_grants,p_actor);
end $$;
revoke all on function public.officehub_commit_document_shares(text,jsonb,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.officehub_commit_document_shares(text,jsonb,jsonb,uuid) to service_role;
alter function officehub_private.email_recipient_is_current(text,text,uuid) rename to email_recipient_before_document_lifecycle;
create function officehub_private.email_recipient_is_current(p_type text,p_entity text,p_recipient uuid) returns boolean language sql stable security definer set search_path='' as $$
select case when p_type='document_shared' and not exists(select 1 from public.sharepoint_documents where id=p_entity and deleted_at is null and deletion_pending_at is null) then false else officehub_private.email_recipient_before_document_lifecycle(p_type,p_entity,p_recipient) end;
$$;
revoke all on function officehub_private.email_recipient_is_current(text,text,uuid) from public,anon,authenticated;
create table public.officehub_document_folders(graph_item_id text primary key,name text not null,created_by_id uuid not null references public.profiles(id) on delete cascade);
alter table public.officehub_document_folders enable row level security;
revoke all on public.officehub_document_folders from public,anon,authenticated;
grant select on public.officehub_document_folders to authenticated;
grant all on public.officehub_document_folders to service_role;
create policy "Own confirmed folders" on public.officehub_document_folders for select to authenticated using(created_by_id=auth.uid() or public.is_admin());
commit;
