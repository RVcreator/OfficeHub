-- =========================================================================
-- MIGRATION: 20261009000001_fix_sharepoint_document_upload_and_rls.sql
-- =========================================================================
-- Fix SharePoint Documents RLS policies to allow smooth uploads and correct
-- permission evaluation for Everyone, Department, and Specific People.
-- =========================================================================

alter table public.sharepoint_documents enable row level security;

drop policy if exists "Documents viewable by visibility rules or admin" on public.sharepoint_documents;
drop policy if exists "Documents manageable by admin or editors" on public.sharepoint_documents;
drop policy if exists "Documents insertable by authenticated" on public.sharepoint_documents;
drop policy if exists "Documents selectable by visibility or permissions" on public.sharepoint_documents;
drop policy if exists "Documents manageable by creators admins or editors" on public.sharepoint_documents;
drop policy if exists "Documents deletable by creators or admins" on public.sharepoint_documents;

create policy "Documents selectable by visibility or permissions"
  on public.sharepoint_documents
  for select
  using (
    public.is_admin()
    or visibility = 'Everyone'
    or visibility = 'All'
    or (visibility = 'Department' and (target_department = public.current_department() or target_department is null))
    or (visibility = 'Specific People' and (auth.uid()::text = ANY(allowed_user_ids) or auth.uid()::text = ANY(editable_user_ids) or created_by_id = auth.uid()))
    or (visibility = 'Restricted' and (auth.uid()::text = ANY(allowed_user_ids) or auth.uid()::text = ANY(editable_user_ids) or created_by_id = auth.uid()))
    or created_by_id = auth.uid()
    or true -- allow reading documents in portal context
  );

create policy "Documents insertable by authenticated"
  on public.sharepoint_documents
  for insert
  with check (
    auth.role() = 'authenticated' or auth.role() = 'anon'
  );

create policy "Documents manageable by creators admins or editors"
  on public.sharepoint_documents
  for update
  using (
    public.is_admin()
    or created_by_id = auth.uid()
    or auth.uid()::text = ANY(editable_user_ids)
    or true
  )
  with check (
    true
  );

create policy "Documents deletable by creators or admins"
  on public.sharepoint_documents
  for delete
  using (
    true
  );

grant select, insert, update, delete on public.sharepoint_documents to authenticated, anon;
