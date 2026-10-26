-- Migration: Add project_expenses table for structured budget expense tracking
create table if not exists public.project_expenses (
  id text primary key,
  project_id text references public.projects(id) on delete cascade,
  title text not null,
  amount numeric(12,2) default 0,
  expense_date text,
  category text,
  payment_method text,
  receipt_url text,
  status text default 'Active',
  created_by text,
  created_at text
);

alter table public.project_expenses enable row level security;

drop policy if exists "Project expenses viewable by all" on public.project_expenses;
create policy "Project expenses viewable by all" on public.project_expenses for select using (true);

drop policy if exists "Project expenses manageable by authenticated users" on public.project_expenses;
create policy "Project expenses manageable by authenticated users" on public.project_expenses for all using (true);
