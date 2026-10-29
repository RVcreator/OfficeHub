-- Persist fields already present in the department form. Keep existing rows and permissions.
begin;
alter table public.departments
 add column if not exists organisation text not null default 'WIPAHS',
 add column if not exists budget text,
 add column if not exists head_role text,
 add column if not exists head_avatar text;
-- Existing staff departments previously existed only as browser defaults.
-- Restore their directory rows without changing staff IDs, assignments, or existing departments.
with refs as (
 select min(btrim(p.department)) as name,
 coalesce(nullif(btrim(to_jsonb(p)->>'organisation'),''),'WIPAHS') as organisation
 from public.profiles p where nullif(btrim(p.department),'') is not null
 group by lower(btrim(p.department)),coalesce(nullif(btrim(to_jsonb(p)->>'organisation'),''),'WIPAHS')
)
insert into public.departments(id,name,organisation,description)
select 'dept-recovered-'||md5(lower(r.organisation)||':'||lower(r.name)),r.name,r.organisation,'' from refs r
where not exists(select 1 from public.departments d where lower(btrim(d.name))=lower(r.name) and lower(btrim(d.organisation))=lower(r.organisation))
on conflict(id) do nothing;

create or replace function public.officehub_guard_department() returns trigger
language plpgsql set search_path='' as $$
declare dept_name text;org_name text;
begin
 if TG_OP in ('DELETE','UPDATE') then
  if TG_OP='DELETE' or lower(btrim(new.name))<>lower(btrim(old.name)) or lower(btrim(new.organisation))<>lower(btrim(old.organisation)) then
   if exists(select 1 from public.profiles p where lower(btrim(p.department))=lower(btrim(old.name)) and lower(coalesce(nullif(btrim(to_jsonb(p)->>'organisation'),''),'WIPAHS'))=lower(btrim(old.organisation))) then
    raise exception 'Reassign staff before renaming, moving or deleting their department.' using errcode='23514';
   end if;
  end if;
 end if;
 if TG_OP='DELETE' then return old; end if;
 new.name:=btrim(new.name);new.organisation:=coalesce(nullif(btrim(new.organisation),''),'WIPAHS');
 if new.name='' then raise exception 'Department name is required' using errcode='23514';end if;
 if TG_OP='UPDATE' and lower(new.name)=lower(btrim(old.name)) and lower(new.organisation)=lower(btrim(old.organisation)) then return new;end if;
 -- Serialize same-name creates so concurrent administrators cannot create more duplicates.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(lower(new.organisation)||':'||lower(new.name),0));
 if exists(select 1 from public.departments d where lower(btrim(d.name))=lower(new.name) and lower(btrim(d.organisation))=lower(new.organisation) and d.id<>new.id) then
  raise exception 'A department with this name already exists in that organisation.' using errcode='23505';
 end if;
 return new;
end $$;
create trigger officehub_department_consistency before insert or update or delete on public.departments
for each row execute function public.officehub_guard_department();
commit;
