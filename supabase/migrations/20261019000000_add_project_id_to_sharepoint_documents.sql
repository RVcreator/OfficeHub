-- =========================================================================
-- MIGRATION: 20261019000000_add_project_id_to_sharepoint_documents.sql
-- =========================================================================
-- Adds project_id to sharepoint_documents to allow linking real SharePoint
-- files directly to projects and strategic initiatives.
-- =========================================================================

alter table public.sharepoint_documents
  add column if not exists project_id text references public.projects(id) on delete set null;

create index if not exists idx_sharepoint_documents_project_id
  on public.sharepoint_documents(project_id);
