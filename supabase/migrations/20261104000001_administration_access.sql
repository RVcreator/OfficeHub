begin;
create table public.officehub_administration_grants(
 user_id uuid primary key references public.profiles(id) on delete cascade,
 can_manage boolean not null default false,
 granted_by uuid,
 granted_at timestamptz not null default now()
);
alter table public.officehub_administration_grants enable row level security;
revoke all on public.officehub_administration_grants from public,anon,authenticated;
grant select on public.officehub_administration_grants to authenticated;
grant all on public.officehub_administration_grants to service_role;
-- Preserve the existing verified portal owner through a recorded grant, not a
-- department, email-substring, role-title or editable metadata bypass.
insert into public.officehub_administration_grants(user_id,can_manage)
 select p.id,true from public.profiles p join auth.users u on u.id=p.id
 where lower(btrim(u.email))='it@wipahs.org' and lower(btrim(p.email))=lower(btrim(u.email))
 and lower(btrim(p.role)) in ('system administrator','system adminstrator')
 and u.email_confirmed_at is not null and u.deleted_at is null;
create function officehub_private.administration_active_user(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p join auth.users u on u.id=p.id where p.id=p_user
 and u.email_confirmed_at is not null and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now())
 and coalesce(p.app_metadata->>'deactivated','false')<>'true'
 and coalesce(u.raw_app_meta_data->>'deactivated','false')<>'true'
 and coalesce(u.raw_app_meta_data->>'must_change_password','false')<>'true');
$$;
create function officehub_private.administration_is_top_management(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=p_user and lower(regexp_replace(btrim(p.department),'[[:space:]]+',' ','g'))='top management');
$$;
create function officehub_private.administration_can_manage(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select officehub_private.administration_active_user(p_user) and (officehub_private.administration_is_top_management(p_user)
 or exists(select 1 from public.officehub_administration_grants g where g.user_id=p_user and g.can_manage));
$$;
create function officehub_private.administration_can_view(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select officehub_private.administration_active_user(p_user) and (officehub_private.administration_is_top_management(p_user)
 or exists(select 1 from public.officehub_administration_grants g where g.user_id=p_user));
$$;
revoke all on function officehub_private.administration_active_user(uuid),officehub_private.administration_is_top_management(uuid),officehub_private.administration_can_manage(uuid),officehub_private.administration_can_view(uuid) from public,anon,authenticated;
create function public.officehub_can_view_administration() returns boolean language sql stable security definer set search_path='' as $$select officehub_private.administration_can_view(auth.uid())$$;
create function public.officehub_can_manage_administration() returns boolean language sql stable security definer set search_path='' as $$select officehub_private.administration_can_manage(auth.uid())$$;
create function public.officehub_administration_access() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('user_id',auth.uid(),'can_view',officehub_private.administration_can_view(auth.uid()),'can_manage',officehub_private.administration_can_manage(auth.uid()),'automatic',officehub_private.administration_is_top_management(auth.uid()));
$$;
revoke all on function public.officehub_can_view_administration(),public.officehub_can_manage_administration(),public.officehub_administration_access() from public,anon;
grant execute on function public.officehub_can_view_administration(),public.officehub_can_manage_administration(),public.officehub_administration_access() to authenticated,service_role;
create policy "Own administration grant or access manager" on public.officehub_administration_grants for select to authenticated using(user_id=auth.uid() or public.officehub_can_manage_administration());
create function public.officehub_list_administration_access() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.officehub_can_manage_administration() then raise exception 'Only access managers can list administration assignments' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('user_id',p.id,'can_manage',coalesce(g.can_manage,false) or officehub_private.administration_can_manage(p.id),'active',officehub_private.administration_active_user(p.id),'automatic',officehub_private.administration_is_top_management(p.id),'granted_at',g.granted_at) order by p.name,p.id),'[]'::jsonb)
 from public.profiles p left join public.officehub_administration_grants g on g.user_id=p.id
 where g.user_id is not null or (officehub_private.administration_active_user(p.id) and officehub_private.administration_is_top_management(p.id)));
end $$;
create function public.officehub_set_administration_access(p_user uuid,p_enabled boolean) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.officehub_can_manage_administration() then raise exception 'Only access managers can assign administration access' using errcode='42501'; end if;
 if p_enabled is null or not exists(select 1 from public.profiles where id=p_user) or (p_enabled and not officehub_private.administration_active_user(p_user)) then raise exception 'Choose an active, verified staff account'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('officehub-admin-access:'||p_user::text,0));
 if officehub_private.administration_is_top_management(p_user) then raise exception 'Top management access is automatic'; end if;
 if exists(select 1 from public.officehub_administration_grants where user_id=p_user and can_manage) then raise exception 'Access manager assignments cannot be changed here'; end if;
 if p_enabled then
  insert into public.officehub_administration_grants(user_id,granted_by)values(p_user,auth.uid())on conflict(user_id)do nothing;
 else
  delete from public.officehub_administration_grants where user_id=p_user;
 end if;
 if found then
  insert into public.audit_log(id,actor_id,actor_name,actor_email,event_type,target_name,timestamp,badge_color)
   values('administration-access-'||pg_catalog.gen_random_uuid()::text,auth.uid(),(select name from public.profiles where id=auth.uid()),(select email from public.profiles where id=auth.uid()),case when p_enabled then 'administration_access_granted' else 'administration_access_revoked' end,(select name from public.profiles where id=p_user),now()::text,'blue');
 end if;
 return jsonb_build_object('success',true,'user_id',p_user,'enabled',p_enabled);
end $$;
revoke all on function public.officehub_list_administration_access(),public.officehub_set_administration_access(uuid,boolean) from public,anon;
grant execute on function public.officehub_list_administration_access(),public.officehub_set_administration_access(uuid,boolean) to authenticated;
-- Compatibility callers retain a single server authority. View-only delegates
-- never gain account provisioning, role editing or permission-management powers.
-- Existing generic admin exceptions on unrelated records may only narrow.
-- New administration viewers/managers do not acquire private-record access.
create function officehub_private.administration_legacy_privilege(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=p_user and (role ilike '%Admin%' or role ilike '%Manager%' or role ilike '%Director%' or department ilike '%IT%' or department ilike '%Executive%'));
$$;
revoke all on function officehub_private.administration_legacy_privilege(uuid) from public,anon,authenticated;
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$select officehub_private.administration_can_manage(auth.uid()) and officehub_private.administration_legacy_privilege(auth.uid())$$;
create function public.officehub_administration_manager_allowed(p_actor uuid) returns boolean language sql stable security definer set search_path='' as $$select officehub_private.administration_can_manage(p_actor)$$;
revoke all on function public.officehub_administration_manager_allowed(uuid) from public,anon,authenticated;
grant execute on function public.officehub_administration_manager_allowed(uuid) to service_role;
create or replace function public.officehub_account_delete_allowed(p_actor uuid) returns boolean language sql stable security definer set search_path='' as $$select officehub_private.administration_can_manage(p_actor)$$;
-- Roles and audit records are administrative data. Department names remain
-- readable for normal task forms, directories, meetings and staff pickers.
do $$declare p record;begin
 for p in select tablename,policyname from pg_policies where schemaname='public' and (tablename='role_permissions' or (tablename='audit_log' and permissive='PERMISSIVE')) loop execute format('drop policy %I on public.%I',p.policyname,p.tablename);end loop;
end $$;
create policy "Administration roles read" on public.role_permissions for select to authenticated using(public.officehub_can_view_administration());
create policy "Access managers create roles" on public.role_permissions for insert to authenticated with check(public.officehub_can_manage_administration());
create policy "Access managers update roles" on public.role_permissions for update to authenticated using(public.officehub_can_manage_administration()) with check(public.officehub_can_manage_administration());
create policy "Access managers delete roles" on public.role_permissions for delete to authenticated using(public.officehub_can_manage_administration());
create policy "Administration audit read" on public.audit_log for select to authenticated using(public.officehub_can_view_administration());
create policy "Staff record own audit events" on public.audit_log for insert to authenticated with check(actor_id=auth.uid() or public.officehub_can_manage_administration());
create policy "Access managers update audit" on public.audit_log for update to authenticated using(public.officehub_can_manage_administration()) with check(public.officehub_can_manage_administration());
create policy "Access managers delete audit" on public.audit_log for delete to authenticated using(public.officehub_can_manage_administration());
-- Administrative profile and department writes use the specific authority;
-- keep shared directory reads and participant privacy policies unchanged.
drop policy if exists "Profiles updatable by self or admin" on public.profiles;
drop policy if exists "Profiles deletable by admin" on public.profiles;
drop policy if exists "Profiles insertable by admin" on public.profiles;
create policy "Profiles updatable by self or access manager" on public.profiles for update to authenticated using(id=auth.uid() or public.officehub_can_manage_administration()) with check(id=auth.uid() or public.officehub_can_manage_administration());
create policy "Profiles insertable by access manager" on public.profiles for insert to authenticated with check(public.officehub_can_manage_administration());
create policy "Profiles deletable by access manager" on public.profiles for delete to authenticated using(public.officehub_can_manage_administration());
create or replace function public.officehub_guard_profile_security() returns trigger language plpgsql set search_path='' as $$
begin
 if current_user='authenticated' then
  if new.id is distinct from old.id or new.email is distinct from old.email or new.must_change_password is distinct from old.must_change_password or new.app_metadata is distinct from old.app_metadata or new.temporary_password is distinct from old.temporary_password or new.created_at is distinct from old.created_at then raise exception 'Sign-in identity and password requirements must be changed through the protected account service.' using errcode='42501'; end if;
  if not public.officehub_can_manage_administration() and (new.role is distinct from old.role or lower(btrim(new.organisation)) is distinct from lower(btrim(old.organisation)) or public.officehub_department_key(new.department,new.organisation) is distinct from public.officehub_department_key(old.department,old.organisation)) then raise exception 'Only an access manager can change a member role or organisation assignment.' using errcode='42501'; end if;
 end if;
 return new;
end $$;
drop policy if exists "Departments manageable by admin" on public.departments;
create policy "Access managers create departments" on public.departments for insert to authenticated with check(public.officehub_can_manage_administration());
create policy "Access managers update departments" on public.departments for update to authenticated using(public.officehub_can_manage_administration()) with check(public.officehub_can_manage_administration());
create policy "Access managers delete departments" on public.departments for delete to authenticated using(public.officehub_can_manage_administration());
notify pgrst, 'reload schema';
commit;
