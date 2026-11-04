begin;
create table public.officehub_document_link_repairs(document_id text primary key references public.sharepoint_documents(id),graph_item_id text not null,previous_url text not null,canonical_url text not null,proof text not null check(proof in ('sharepoint_guid','exact_web_url')),confirmed_by uuid not null,confirmed_at timestamptz not null default now());
alter table public.officehub_document_link_repairs enable row level security;
revoke all on public.officehub_document_link_repairs from public,anon,authenticated;
grant all on public.officehub_document_link_repairs to service_role;
create function public.officehub_confirm_document_link(p_document text,p_expected_url text,p_item text,p_canonical_url text,p_proof text,p_actor uuid) returns void language plpgsql security definer set search_path='' as $$
declare d public.sharepoint_documents;
begin
 if nullif(p_item,'') is null then raise exception 'Microsoft file identity required'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('officehub-ms-file:'||p_item,0));
 select * into strict d from public.sharepoint_documents where id=p_document for update;
 if d.deleted_at is not null or d.deletion_pending_at is not null then raise exception 'Document unavailable or deletion pending'; end if;
 if d.graph_drive_item_id is not null then
   if d.graph_drive_item_id=p_item then return; end if;
   raise exception 'An existing Microsoft identity cannot be replaced';
 end if;
 if d.web_url is distinct from p_expected_url then raise exception 'Saved Microsoft link changed'; end if;
 if nullif(p_item,'') is null or nullif(p_canonical_url,'') is null or p_proof not in ('sharepoint_guid','exact_web_url') or p_actor is null then raise exception 'Confirmed Microsoft identity required'; end if;
 if exists(select 1 from public.sharepoint_documents where graph_drive_item_id=p_item and (deleted_at is not null or deletion_pending_at is not null)) then raise exception 'Microsoft file deletion is pending or already confirmed'; end if;
 update public.sharepoint_documents set graph_drive_item_id=p_item,web_url=p_canonical_url,synced_with_sharepoint=true where id=p_document;
 insert into public.officehub_document_link_repairs(document_id,graph_item_id,previous_url,canonical_url,proof,confirmed_by)values(p_document,p_item,p_expected_url,p_canonical_url,p_proof,p_actor);
end $$;
revoke all on function public.officehub_confirm_document_link(text,text,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.officehub_confirm_document_link(text,text,text,text,text,uuid) to service_role;
create or replace function public.officehub_prepare_document_delete(p_document text,p_item text,p_actor uuid) returns void language plpgsql security definer set search_path='' as $$
declare d public.sharepoint_documents;
begin
 if nullif(p_item,'') is null then raise exception 'Microsoft file identity required'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('officehub-ms-file:'||p_item,0));
 select * into strict d from public.sharepoint_documents where id=p_document for update;
 if d.graph_drive_item_id is distinct from p_item then raise exception 'Microsoft file identity changed'; end if;
 if not exists(select 1 from public.profiles where id=p_actor) then raise exception 'Staff account required'; end if;
 if d.deleted_at is null then update public.sharepoint_documents set deletion_pending_at=coalesce(deletion_pending_at,now()) where id=p_document; end if;
end $$;
-- One Microsoft file can have several legacy OfficeHub entries. Preserve history,
-- but hide every entry once Microsoft has confirmed that shared file was deleted.
create or replace function public.officehub_finish_document_delete(p_document text,p_item text,p_actor uuid) returns void language plpgsql security definer set search_path='' as $$
declare d public.sharepoint_documents;
begin
 if nullif(p_item,'') is null then raise exception 'Microsoft file identity required'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('officehub-ms-file:'||p_item,0));
 select * into strict d from public.sharepoint_documents where id=p_document for update;
 if d.graph_drive_item_id is distinct from p_item or nullif(p_item,'') is null or (d.deletion_pending_at is null and d.deleted_at is null) then raise exception 'Prepared Microsoft file identity required'; end if;
 update public.sharepoint_documents set deleted_at=coalesce(deleted_at,now()),deleted_by=coalesce(deleted_by,p_actor),deletion_pending_at=null,synced_with_sharepoint=false where graph_drive_item_id=p_item;
end $$;
commit;
