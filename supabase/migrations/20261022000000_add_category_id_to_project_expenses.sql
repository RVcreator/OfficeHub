-- Migration: Add category_id to project_expenses referencing project_budget_categories
alter table public.project_expenses add column if not exists category_id text references public.project_budget_categories(id) on delete set null;

-- Index for performant join / lookup by category_id
create index if not exists idx_project_expenses_category_id on public.project_expenses(category_id);
