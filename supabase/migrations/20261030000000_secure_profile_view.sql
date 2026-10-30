-- Make the internal directory obey the caller's RLS and close anonymous access.
begin;
alter view public.profiles_public set (security_invoker=true);
revoke all on public.profiles,public.profiles_public from anon,public;
-- Clear any column grants as well as table-level grants for anonymous callers.
do $$declare cols text;begin
 select string_agg(quote_ident(attname),',') into cols from pg_attribute
 where attrelid='public.profiles'::regclass and attnum>0 and not attisdropped;
 execute 'revoke all ('||cols||') on public.profiles from anon,public';
end$$;
revoke all on public.profiles_public from authenticated;
grant select on public.profiles_public to authenticated;
revoke truncate,references,trigger on public.profiles from authenticated;
drop policy if exists "Profiles viewable by everyone in organisation or admins" on public.profiles;
drop policy if exists "Profiles viewable by self or admin" on public.profiles;
drop policy if exists officehub_profiles_directory_authenticated on public.profiles;
create policy officehub_profiles_directory_authenticated on public.profiles
 for select to authenticated using ((select auth.uid()) is not null);
alter table public.profiles enable row level security;
drop policy if exists "Profiles insertable by admin" on public.profiles;
create policy "Profiles insertable by admin" on public.profiles for insert to authenticated with check (public.is_admin());

-- Existing administrative membership rules remain unchanged. Pin resolution to
-- qualified names before using this helper in a profile-write guard.
alter function public.is_admin() set search_path='';
create or replace function public.officehub_guard_profile_security() returns trigger
language plpgsql set search_path='' as $$
begin
 if current_user='authenticated' then
  if new.id is distinct from old.id or new.email is distinct from old.email
   or new.must_change_password is distinct from old.must_change_password
   or new.app_metadata is distinct from old.app_metadata
   or new.temporary_password is distinct from old.temporary_password
   or new.created_at is distinct from old.created_at then
   raise exception 'Sign-in identity and password requirements must be changed through the protected account service.' using errcode='42501';
  end if;
  if not public.is_admin() and (new.role is distinct from old.role
   or lower(btrim(new.organisation)) is distinct from lower(btrim(old.organisation)) or public.officehub_department_key(new.department,new.organisation) is distinct from public.officehub_department_key(old.department,old.organisation)) then
   raise exception 'Only an administrator can change a member role or organisation assignment.' using errcode='42501';
  end if;
 end if;
 return new;
end$$;
revoke all on function public.officehub_guard_profile_security() from public,anon,authenticated;
drop trigger if exists officehub_profile_security_guard on public.profiles;
create trigger officehub_profile_security_guard before update on public.profiles
 for each row execute function public.officehub_guard_profile_security();
commit;
