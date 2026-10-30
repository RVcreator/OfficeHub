import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.OFFICEHUB_PGLITE_MODULE||'@electric-sql/pglite');const db=new PGlite();
try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;grant usage on schema auth,public to anon,authenticated,service_role;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table public.profiles(id uuid primary key,name text,email text,role text,organisation text,department text,phone text,birthday text,temporary_password text,must_change_password boolean,app_metadata jsonb,created_at timestamptz default now());
 insert into profiles(id,name,email,role,organisation,department,temporary_password,must_change_password,app_metadata) values
 ('10000000-0000-4000-8000-000000000001','Fixture Member','member@example.invalid','Staff','HO','Top management','fixture-only',true,'{"must_change_password":true}'),
 ('10000000-0000-4000-8000-000000000002','Fixture Admin','admin@example.invalid','Admin','WIPAHS','IT',null,false,'{}');
 create function public.is_admin() returns boolean language sql security definer as $$select exists(select 1 from public.profiles where id=auth.uid() and role='Admin')$$;
 create function public.officehub_department_key(dept text,org text) returns text language sql immutable as $$select case when org='HO' and lower(dept) in ('top management','management') then 'management' else lower(dept) end$$;
 alter table profiles enable row level security;
 create policy "Profiles viewable by everyone in organisation or admins" on profiles for select using(true);
 create policy "Profiles viewable by self or admin" on profiles for select using(id=auth.uid() or public.is_admin());
 create policy "Profiles updatable by self or admin" on profiles for update using(id=auth.uid() or public.is_admin());
 create policy "Profiles insertable by admin" on profiles for insert with check(id=auth.uid() or public.is_admin());
 create policy "Profiles deletable by admin" on profiles for delete using(public.is_admin());
 create view profiles_public as select id,name,email,role,organisation,department,phone,birthday,must_change_password,app_metadata,created_at from profiles;
 grant all on profiles,profiles_public to anon,authenticated,service_role;`);
 await db.exec('set role anon');assert.equal((await db.query('select count(*)::int as n from profiles_public')).rows[0].n,2,'old anonymous exposure reproduced');await db.exec('reset role');
 const viewMigration=await readFile(new URL('../supabase/migrations/20261030000000_secure_profile_view.sql',import.meta.url),'utf8');
 const columnMigration=await readFile(new URL('../supabase/migrations/20261030000001_protect_legacy_profile_credentials.sql',import.meta.url),'utf8');
 await db.exec(viewMigration);await db.exec(columnMigration);
 await db.exec('set role anon');
 for(const query of ['select * from profiles_public','select id from profiles','select temporary_password from profiles'])await assert.rejects(db.query(query),/permission denied/);
 await db.exec("reset role;set role authenticated;select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false)");
 assert.equal((await db.query('select count(*)::int as n from profiles_public')).rows[0].n,2,'signed-in directory remains available across organisations');
 assert.equal((await db.query("select email from profiles where id=auth.uid()")).rows.length,1,'verified own profile remains readable');
 await assert.rejects(db.query('select temporary_password from profiles'),/permission denied/);
 await assert.rejects(db.query('select * from profiles'),/permission denied/);
 await assert.rejects(db.query("update profiles_public set role='Admin' where id=auth.uid()"),/permission denied/);
 await assert.rejects(db.query("update profiles set role='Admin' where id=auth.uid()"),/Only an administrator/);
 await assert.rejects(db.query("update profiles set must_change_password=false where id=auth.uid()"),/protected account service/);
 await assert.rejects(db.query("update profiles set app_metadata='{}' where id=auth.uid()"),/protected account service/);
 await db.query("update profiles set phone='fixture-phone',department='Management' where id=auth.uid()");
 assert.equal((await db.query('select phone from profiles where id=auth.uid()')).rows[0].phone,'fixture-phone','ordinary profile edit and harmless department alias work');
 await db.exec("select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',false)");
 await assert.rejects(db.query("insert into profiles(id,role) values(auth.uid(),'Admin')"),/row-level security/);
 await db.exec("select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false)");
 await db.query("update profiles set department='Finance' where email='member@example.invalid'");
 await db.exec('reset role;set role service_role');await db.query("update profiles set must_change_password=false,temporary_password=null,app_metadata='{}' where email='member@example.invalid'");
 await db.exec('reset role');
 assert.equal((await db.query("select reloptions from pg_class where oid='profiles_public'::regclass")).rows[0].reloptions.includes('security_invoker=true'),true);
 await db.exec(viewMigration);await db.exec(columnMigration);
 console.log('PASS: anonymous view/table denied; signed-in directory and own profile readable; legacy credentials denied; view writes and self privilege escalation blocked; ordinary edits, administrator assignment and service-role password updates preserved; migration repeat safe.');
}finally{await db.close();}
