-- =========================================================================
-- CONSOLIDATED MIGRATION: 20261008000000_profile_security_and_password_sync.sql
-- =========================================================================
-- This single migration covers:
-- 1. Profiles Schema: Ensures must_change_password, temporary_password, and app_metadata exist.
-- 2. Foreign Key Cascade: Configures profiles(id) references auth.users(id) ON DELETE CASCADE.
-- 3. Auth Trigger: Minimal default trigger (handle_new_user) on auth.users insert.
-- 4. Public View: Creates public.profiles_public view completely excluding temporary_password.
-- 5. Strict RLS: Restricts public.profiles SELECT so regular users can only read their own profile row.
-- 6. Audit & Cleanup: One-time wipe of temporary_password on any profile where password change is complete.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. COLUMN DEFINITIONS ON PROFILES
-- -------------------------------------------------------------------------
alter table public.profiles
  add column if not exists must_change_password boolean default false,
  add column if not exists temporary_password text,
  add column if not exists app_metadata jsonb default '{}'::jsonb;

-- -------------------------------------------------------------------------
-- 2. FOREIGN KEY WITH ON DELETE CASCADE
-- -------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where constraint_name = 'profiles_id_fkey'
      and table_name = 'profiles'
  ) then
    alter table public.profiles drop constraint profiles_id_fkey;
  end if;

  alter table public.profiles
    add constraint profiles_id_fkey
    foreign key (id)
    references auth.users(id)
    on delete cascade;
exception
  when others then
    raise notice 'Foreign key update note: %', sqlerrm;
end $$;

-- -------------------------------------------------------------------------
-- 3. MINIMAL DEFAULT TRIGGER ON AUTH.USERS
-- -------------------------------------------------------------------------
-- The trigger only provisions minimal safe defaults (email, default role, 'Offline' status).
-- Full details and temporary passwords are now explicitly set by the admin Edge Function.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (
    id,
    email,
    name,
    role,
    department,
    organisation,
    status,
    must_change_password
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'Staff Member'),
    coalesce(new.raw_user_meta_data->>'department', 'General'),
    coalesce(new.raw_user_meta_data->>'organisation', 'WIPAHS'),
    'Offline',
    coalesce((new.raw_app_meta_data->>'must_change_password')::boolean, false)
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- -------------------------------------------------------------------------
-- 4. PUBLIC PROFILES VIEW (EXCLUDING TEMPORARY_PASSWORD)
-- -------------------------------------------------------------------------
-- Regular client queries for directory, pickers, and organisation views read from this view.
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
  created_at
from public.profiles;

grant select on public.profiles_public to authenticated;
grant select on public.profiles_public to anon;

-- -------------------------------------------------------------------------
-- 5. STRICT ROW LEVEL SECURITY (RLS) ON PUBLIC.PROFILES
-- -------------------------------------------------------------------------
alter table public.profiles enable row level security;

-- Drop legacy broad SELECT policies
drop policy if exists "Profiles viewable by everyone in organisation or admins" on public.profiles;
drop policy if exists "Profiles viewable by self or admin" on public.profiles;

-- Regular users can only select their own raw profile row; admins can view all for account administration
create policy "Profiles viewable by self or admin"
  on public.profiles
  for select
  using (
    id = auth.uid() or public.is_admin()
  );

-- Update permissions: users can update their own profile; admins can update any
drop policy if exists "Profiles updatable by self or admin" on public.profiles;
create policy "Profiles updatable by self or admin"
  on public.profiles
  for update
  using (
    id = auth.uid() or public.is_admin()
  );

-- Insert permissions: admins or user themselves on signup
drop policy if exists "Profiles insertable by admin" on public.profiles;
create policy "Profiles insertable by admin"
  on public.profiles
  for insert
  with check (
    public.is_admin() or id = auth.uid()
  );

-- Delete permissions: admins only
drop policy if exists "Profiles deletable by admin" on public.profiles;
create policy "Profiles deletable by admin"
  on public.profiles
  for delete
  using (
    public.is_admin()
  );

-- -------------------------------------------------------------------------
-- 6. ONE-TIME AUDIT CLEANUP
-- -------------------------------------------------------------------------
-- Wipe temporary_password on any profile where password change has completed
update public.profiles
set temporary_password = null
where (must_change_password is false or must_change_password is null)
  and temporary_password is not null;
