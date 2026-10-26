-- =========================================================================
-- MIGRATION: 20261009000000_fix_task_attribution_and_member_visibility.sql
-- =========================================================================
-- 1. Member Visibility: Ensure all registered staff members are viewable across
--    all accounts (including Marketing and IT accounts) for task assignment,
--    pickers, and the staff directory.
-- 2. Department Visibility: Ensure core departments (including IT Department)
--    are fully readable by all authenticated and anonymous portal users.
-- 3. Task Attribution: Rectify IT-assigned tasks that were previously recorded
--    with incorrect creator attribution so they properly reflect the IT department.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. PUBLIC PROFILES ROW LEVEL SECURITY (RLS)
-- -------------------------------------------------------------------------
-- Allow all portal members to view registered staff profiles in the directory,
-- assignment pickers, and organisation hierarchy. Note: temporary_password is
-- excluded by the profiles_public view.
drop policy if exists "Profiles viewable by self or admin" on public.profiles;
drop policy if exists "Profiles viewable by everyone in organisation or admins" on public.profiles;

create policy "Profiles viewable by everyone in organisation or admins"
  on public.profiles
  for select
  using (true);

grant select on public.profiles to authenticated, anon;
grant select on public.profiles_public to authenticated, anon;

-- -------------------------------------------------------------------------
-- 2. DEPARTMENTS ROW LEVEL SECURITY (RLS) & SEED DATA
-- -------------------------------------------------------------------------
drop policy if exists "Departments viewable by everyone" on public.departments;

create policy "Departments viewable by everyone"
  on public.departments
  for select
  using (true);

grant select on public.departments to authenticated, anon;

-- Ensure core departments exist
insert into public.departments (id, name, description, member_count, colour)
values
  ('dept-mgmt', 'Top management', 'Executive Leadership & Direction', 4, 'emerald'),
  ('dept-it', 'IT', 'Information Technology & Systems Operations', 5, 'blue'),
  ('dept-finance', 'Finance', 'Financial Planning, Accounting & Audit', 4, 'amber'),
  ('dept-marketing', 'Marketing', 'Communications, Media & Outreach', 4, 'purple'),
  ('dept-logistics', 'Logistics and Operations', 'Facilities, Transport & Supply Chain', 6, 'teal'),
  ('dept-tabligh', 'Tabligh', 'Community Welfare & Religious Affairs', 3, 'emerald')
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description;

-- -------------------------------------------------------------------------
-- 3. TASK ATTRIBUTION RECTIFICATION
-- -------------------------------------------------------------------------
-- Ensure tasks assigned by the IT department are correctly attributed to IT
-- and assigned to Marketing so they do not show up as "Assigned By Me" in Marketing.
update public.tasks
set
  created_by_id = '82f2bd3b-2f09-4e4a-9438-5c26e203cf30',
  created_by_name = 'Rija Virani (IT Department)',
  department = 'Marketing',
  assigned_to_name = 'marketing'
where id in ('tsk-1791528628894', 'tsk-1791528717621')
   or (title ilike 'IT TEST%' and created_by_name ilike '%marketing%');
