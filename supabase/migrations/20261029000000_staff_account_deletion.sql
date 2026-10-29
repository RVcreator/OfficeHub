-- Verified against the live FK names/nullability on 29 October 2026.
-- Preserve business history when Auth cascades into profiles. Existing membership,
-- personal notification, document-grant and queue cascades remain unchanged.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$
declare link record; definition record;
begin
 for link in select * from (values
  ('approvals','requested_by_id','approvals_requested_by_id_fkey'),
  ('audit_log','actor_id','audit_log_actor_id_fkey'),
  ('decisions','author_id','decisions_author_id_fkey'),
  ('departments','head_id','departments_head_id_fkey'),
  ('meetings','chair_id','meetings_chair_id_fkey'),
  ('meetings','organizer_id','meetings_organizer_id_fkey'),
  ('messages','sender_id','messages_sender_id_fkey'),
  ('notices','author_id','notices_author_id_fkey'),
  ('notifications','actor_id','notifications_actor_id_fkey'),
  ('profiles','backup_contact_id','profiles_backup_contact_id_fkey'),
  ('projects','leader_id','projects_leader_id_fkey'),
  ('task_ratings','rated_by_id','task_ratings_rated_by_id_fkey'),
  ('task_ratings','rated_user_id','task_ratings_rated_user_id_fkey'),
  ('tasks','created_by_id','tasks_created_by_id_fkey'),
  ('tasks','assigned_to_id','tasks_assigned_to_id_fkey')
 ) as links(table_name,column_name,constraint_name) loop
  select c.oid,c.confdeltype into definition from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
   where c.conrelid=to_regclass(format('public.%I',link.table_name)) and c.conname=link.constraint_name and c.contype='f'
    and c.confrelid='public.profiles'::regclass and cardinality(c.conkey)=1 and a.attname=link.column_name and not a.attnotnull;
  if not found then raise exception 'Unexpected user-reference schema: %.%',link.table_name,link.column_name; end if;
  if definition.confdeltype<>'n' then
   execute format('alter table public.%I drop constraint %I',link.table_name,link.constraint_name);
   execute format('alter table public.%I add constraint %I foreign key (%I) references public.profiles(id) on delete set null',link.table_name,link.constraint_name,link.column_name);
  end if;
 end loop;
 if not exists(select 1 from pg_constraint where conrelid='public.profiles'::regclass and confrelid='auth.users'::regclass and contype='f' and confdeltype='c') then
  raise exception 'profiles must already cascade from Auth users';
 end if;
end $$;

create schema if not exists officehub_private;
create table officehub_private.account_delete_legacy_admins (
 user_id uuid primary key references auth.users(id) on delete cascade
);
alter table officehub_private.account_delete_legacy_admins enable row level security;
revoke all on officehub_private.account_delete_legacy_admins from public,anon,authenticated;
-- Preserve the existing verified legacy system administrator, whose Auth role is
-- currently missing. This snapshot is not writable through public profile edits.
insert into officehub_private.account_delete_legacy_admins(user_id)
 select u.id from auth.users u join public.profiles p on p.id=u.id
 where lower(u.email)='it@wipahs.org' and u.email_confirmed_at is not null
 and lower(trim(p.role)) in ('system administrator','system adminstrator')
 and coalesce((p.app_metadata->>'deactivated')::boolean,false)=false;

create function public.officehub_account_delete_allowed(p_actor uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users u join public.profiles p on p.id=u.id
  where u.id=p_actor and u.deleted_at is null and (u.banned_until is null or u.banned_until<now())
   and coalesce((p.app_metadata->>'deactivated')::boolean,false)=false
   and lower(trim(p.role)) in ('admin','administrator','system administrator','system adminstrator','super admin','super administrator')
   and (
    lower(trim(u.raw_app_meta_data->>'role')) in ('admin','administrator','system administrator','system adminstrator','super admin','super administrator')
    or exists(select 1 from officehub_private.account_delete_legacy_admins a where a.user_id=u.id)
   ));
$$;
revoke all on function public.officehub_account_delete_allowed(uuid) from public,anon,authenticated;
grant execute on function public.officehub_account_delete_allowed(uuid) to service_role;

-- Legacy notification targets are text (UUID or email), so they have no FK.
-- Remove private inbox entries atomically, including for an orphaned Auth account.
create function officehub_private.clean_deleted_account_notifications()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 delete from public.notifications where lower(trim(target_user_id))=old.id::text
  or (old.email is not null and lower(trim(target_user_id))=lower(trim(old.email)));
 return old;
end $$;
revoke all on function officehub_private.clean_deleted_account_notifications() from public,anon,authenticated;
create trigger officehub_deleted_account_notifications after delete on auth.users
 for each row execute function officehub_private.clean_deleted_account_notifications();
commit;
