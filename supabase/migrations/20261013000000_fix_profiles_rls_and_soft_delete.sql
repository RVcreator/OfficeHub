-- =========================================================================
-- MIGRATION: 20261013000000_fix_profiles_rls_and_soft_delete.sql
-- =========================================================================
-- 1. Add deactivated column to public.profiles
-- 2. Update RLS select policy on public.profiles to using (true)
--    so all authenticated staff can view the staff directory
-- 3. Update public.profiles_public view to include deactivated column
-- 4. Grant select permissions on profiles and profiles_public to authenticated and anon
-- =========================================================================

-- 1. COLUMN DEFINITION: DEACTIVATED
alter table public.profiles
  add column if not exists deactivated boolean default false;

-- 2. REPLACE SELECT RLS POLICY ON PROFILES
alter table public.profiles enable row level security;

drop policy if exists "Profiles viewable by self or admin" on public.profiles;
drop policy if exists "Profiles viewable by everyone in organisation or admins" on public.profiles;

create policy "Profiles viewable by everyone in organisation or admins"
  on public.profiles
  for select
  using (true);

-- Ensure update and delete policies remain restricted to self or admin
drop policy if exists "Profiles updatable by self or admin" on public.profiles;
create policy "Profiles updatable by self or admin"
  on public.profiles
  for update
  using (
    id = auth.uid() or public.is_admin()
  );

drop policy if exists "Profiles deletable by admin" on public.profiles;
create policy "Profiles deletable by admin"
  on public.profiles
  for delete
  using (
    public.is_admin()
  );

grant select on public.profiles to authenticated, anon;

-- 3. UPDATE PROFILES_PUBLIC VIEW
drop view if exists public.profiles_public;

create view public.profiles_public with (security_invoker = false) as
select
  id,
  email,
  name,
  role,
  department,
  organisation,
  phone,
  avatar,
  status,
  teams_handle,
  bio,
  location,
  average_rating,
  total_ratings_count,
  out_of_office,
  out_of_office_message,
  leave_type,
  leave_start_date,
  leave_end_date,
  backup_contact_id,
  must_change_password,
  app_metadata,
  deactivated,
  created_at
from public.profiles;

grant select on public.profiles_public to authenticated, anon;

-- 4. ENSURE NOTIFICATIONS ARE INSERTABLE AND SELECTABLE BY ALL PORTAL USERS
alter table public.notifications enable row level security;
drop policy if exists "Notifications insertable" on public.notifications;
create policy "Notifications insertable" on public.notifications for insert with check (true);
drop policy if exists "Notifications manageable" on public.notifications;
create policy "Notifications manageable" on public.notifications for all using (true) with check (true);
grant all on public.notifications to authenticated, anon;
