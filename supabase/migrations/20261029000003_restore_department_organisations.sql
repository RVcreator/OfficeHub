-- Restore the organisation/department matrix supplied by the owner.
-- Existing staff IDs and stored assignments stay unchanged. Legacy aliases are matched
-- by organisation in the app so existing task/history labels remain valid.
begin;
lock table public.departments in share row exclusive mode;
alter table public.departments add column if not exists archived_at timestamptz,
 add column if not exists archive_reason text;

-- Owner-only before-image makes this data repair reversible; no browser grants.
create table if not exists public.officehub_department_repair_20261029 (
 id text primary key, row_data jsonb not null, saved_at timestamptz not null default now()
);
alter table public.officehub_department_repair_20261029 enable row level security;
revoke all on public.officehub_department_repair_20261029 from public,anon,authenticated;
insert into public.officehub_department_repair_20261029(id,row_data)
select id,to_jsonb(d) from public.departments d on conflict(id) do nothing;

create or replace function public.officehub_department_key(dept text,org text) returns text
language sql immutable set search_path='' as $$
 select case
 when upper(btrim(coalesce(org,'WIPAHS'))) in ('HO','HOP','WEC','MEDEWELL')
  and lower(btrim(dept)) in ('top management','management') then 'management'
 when upper(btrim(coalesce(org,'WIPAHS')))='HO'
  and lower(btrim(dept)) in ('marketing and projects','projects and mkt','projects & mkt','projects and marketing','projects & marketing') then 'projects and marketing'
 else lower(btrim(dept)) end
$$;

create or replace function public.officehub_guard_department() returns trigger
language plpgsql set search_path='' as $$
begin
 if TG_OP in ('DELETE','UPDATE') then
  if TG_OP='DELETE' or
   public.officehub_department_key(new.name,new.organisation) is distinct from public.officehub_department_key(old.name,old.organisation)
   or lower(btrim(new.organisation)) is distinct from lower(btrim(old.organisation))
   or (old.archived_at is null and new.archived_at is not null) then
   if exists(select 1 from public.profiles p
     where public.officehub_department_key(p.department,to_jsonb(p)->>'organisation')=public.officehub_department_key(old.name,old.organisation)
     and lower(coalesce(nullif(btrim(to_jsonb(p)->>'organisation'),''),'WIPAHS'))=lower(btrim(old.organisation)))
    and not exists(select 1 from public.departments d where d.id<>old.id and d.archived_at is null
     and lower(btrim(d.organisation))=lower(btrim(old.organisation))
     and public.officehub_department_key(d.name,d.organisation)=public.officehub_department_key(old.name,old.organisation)) then
    raise exception 'Reassign staff before renaming, moving or deleting their department.' using errcode='23514';
   end if;
  end if;
 end if;
 if TG_OP='DELETE' then return old;end if;
 new.name:=btrim(coalesce(new.name,''));new.organisation:=coalesce(nullif(btrim(new.organisation),''),'WIPAHS');
 if new.name='' then raise exception 'Department name is required' using errcode='23514';end if;
 if new.archived_at is not null then return new;end if;
 if TG_OP='UPDATE' and old.archived_at is null
  and public.officehub_department_key(new.name,new.organisation)=public.officehub_department_key(old.name,old.organisation)
  and lower(new.organisation)=lower(btrim(old.organisation)) then return new;end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(lower(new.organisation)||':'||public.officehub_department_key(new.name,new.organisation),0));
 if exists(select 1 from public.departments d where d.archived_at is null and d.id<>new.id
  and lower(btrim(d.organisation))=lower(new.organisation)
  and public.officehub_department_key(d.name,d.organisation)=public.officehub_department_key(new.name,new.organisation)) then
  raise exception 'A department with this name already exists in that organisation.' using errcode='23505';
 end if;
 return new;
end $$;

create temporary table restored_departments(org text,name text,keeper text,primary key(org,name)) on commit drop;
insert into restored_departments(org,name) values
 ('WIPAHS','Top management'),('WIPAHS','IT'),('WIPAHS','Finance'),
 ('HO','Management'),('HO','Finance'),('HO','Projects and Marketing'),('HO','Logistics and Operations'),('HO','Tabligh'),
 ('HOP','Management'),('HOP','Finance'),('WEC','Management'),('WEC','Finance'),('MEDEWELL','Management'),('MEDEWELL','Finance');
update restored_departments r set keeper=(select d.id from public.departments d where d.archived_at is null
 and lower(btrim(d.organisation))=lower(r.org)
 and public.officehub_department_key(d.name,d.organisation)=public.officehub_department_key(r.name,r.org)
 order by d.created_at nulls last,d.id limit 1);
update restored_departments set keeper='dept-restored-'||md5(lower(org)||':'||lower(name)) where keeper is null;
insert into public.departments(id,name,organisation,description)
select r.keeper,r.name,r.org,'' from restored_departments r
where not exists(select 1 from public.departments d where d.id=r.keeper);
update public.departments d set name=r.name,organisation=r.org from restored_departments r where d.id=r.keeper;
-- Archive equivalent old duplicates rather than deleting records.
update public.departments d set archived_at=now(),archive_reason='Duplicate of '||r.keeper||'; restored from owner organisation reference'
from restored_departments r where d.archived_at is null and d.id<>r.keeper
 and lower(btrim(d.organisation))=lower(r.org)
 and public.officehub_department_key(d.name,d.organisation)=public.officehub_department_key(r.name,r.org);
-- These entries were saved under the WIPAHS fallback before organisation was persisted.
-- The supplied reference places these functions in the other organisations above.
update public.departments d set archived_at=now(),archive_reason='Legacy WIPAHS fallback; organisation groups restored from owner reference'
where d.archived_at is null and upper(btrim(d.organisation))='WIPAHS'
 and lower(btrim(d.name)) in ('management','projects and marketing','marketing and projects','logistics and management','logistics and operations','tabligh');
create unique index if not exists officehub_active_department_org_name
 on public.departments(lower(btrim(organisation)),public.officehub_department_key(name,organisation)) where archived_at is null;
commit;
